use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Request, State},
    http::{StatusCode, header::AUTHORIZATION},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use serde::Deserialize;
use tokio::sync::RwLock;

#[derive(Clone, Debug)]
pub struct Identity {
    pub subject: String,
}

#[derive(Clone)]
pub struct CognitoVerifier {
    issuer: String,
    client_id: String,
    jwks_uri: String,
    jwks: Arc<RwLock<JwkSet>>,
    http: reqwest::Client,
}

#[derive(Debug, Deserialize)]
struct Claims {
    iss: String,
    sub: String,
    #[allow(dead_code)]
    exp: usize,
    token_use: String,
    client_id: String,
}

impl CognitoVerifier {
    pub async fn new(
        issuer: String,
        client_id: String,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let issuer = issuer.trim_end_matches('/').to_owned();
        let jwks_uri = format!("{issuer}/.well-known/jwks.json");
        let http = reqwest::Client::new();
        let jwks = http
            .get(&jwks_uri)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(Self {
            issuer,
            client_id,
            jwks_uri,
            jwks: Arc::new(RwLock::new(jwks)),
            http,
        })
    }

    pub async fn verify(&self, token: &str) -> Result<Identity, VerifyError> {
        let header = decode_header(token).map_err(|_| VerifyError::InvalidToken)?;
        let kid = header.kid.ok_or(VerifyError::InvalidToken)?;
        let key = {
            let jwks = self.jwks.read().await;
            jwks.find(&kid).cloned()
        };
        let key = match key {
            Some(key) => key,
            None => {
                let refreshed = self
                    .http
                    .get(&self.jwks_uri)
                    .send()
                    .await
                    .map_err(|_| VerifyError::KeyServiceUnavailable)?
                    .error_for_status()
                    .map_err(|_| VerifyError::KeyServiceUnavailable)?
                    .json::<JwkSet>()
                    .await
                    .map_err(|_| VerifyError::KeyServiceUnavailable)?;
                let found = refreshed
                    .find(&kid)
                    .cloned()
                    .ok_or(VerifyError::InvalidToken)?;
                *self.jwks.write().await = refreshed;
                found
            }
        };
        let decoding_key = DecodingKey::from_jwk(&key).map_err(|_| VerifyError::InvalidToken)?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[self.issuer.as_str()]);
        validation.set_required_spec_claims(&["exp", "iss", "sub"]);
        let claims = decode::<Claims>(token, &decoding_key, &validation)
            .map_err(|_| VerifyError::InvalidToken)?
            .claims;
        if claims.iss != self.issuer
            || claims.client_id != self.client_id
            || claims.token_use != "access"
        {
            return Err(VerifyError::InvalidToken);
        }
        Ok(Identity {
            subject: claims.sub,
        })
    }
}

#[derive(Debug)]
pub enum VerifyError {
    InvalidToken,
    KeyServiceUnavailable,
}

pub async fn require_identity(
    State(verifier): State<CognitoVerifier>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let header = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let token = header
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let identity = verifier
        .verify(token)
        .await
        .map_err(|_| StatusCode::UNAUTHORIZED)?;
    request.extensions_mut().insert(identity);
    Ok(next.run(request).await)
}

pub fn subject_partition(subject: &str) -> String {
    format!("SUB#{subject}")
}

#[cfg(test)]
mod tests {
    use super::subject_partition;

    #[test]
    fn user_owned_keys_come_from_verified_subject() {
        assert_eq!(subject_partition("cognito-sub-123"), "SUB#cognito-sub-123");
        assert_ne!(
            subject_partition("verified-a"),
            subject_partition("body-supplied-b")
        );
    }
}
