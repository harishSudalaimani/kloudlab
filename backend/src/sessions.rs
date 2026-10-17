use std::{collections::HashMap, sync::Arc};

use aws_sdk_dynamodb::{Client as DynamoClient, types::AttributeValue};
use axum::{
    Json, Router,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    middleware,
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    auth::{self, CognitoVerifier, Identity},
    provider::{EnvironmentRef, LabProvider},
};

#[derive(Clone)]
pub struct AppState {
    pub dynamodb: DynamoClient,
    pub verifier: CognitoVerifier,
    pub provider: Arc<dyn LabProvider>,
    pub sessions_table: String,
    pub session_ttl_minutes: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Session {
    id: String,
    owner_sub: String,
    lab_slug: String,
    lab_version: String,
    status: String,
    created_at: String,
    expires_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    environment: Option<EnvironmentRef>,
}

#[derive(Deserialize)]
struct StartRequest {
    lab_slug: String,
}

#[derive(Deserialize)]
struct ListQuery {
    limit: Option<i32>,
    next_token: Option<String>,
}

pub fn secure_router(verifier: CognitoVerifier) -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/labs", get(list_labs))
        .route("/api/sessions", get(list_sessions).post(start_session))
        .route("/api/sessions/{id}", get(get_session))
        .route("/api/sessions/{id}/access", post(access_session))
        .route("/api/sessions/{id}/evaluate", post(evaluate_session))
        .route("/api/sessions/{id}/destroy", post(destroy_session))
        .route_layer(middleware::from_fn_with_state(
            verifier,
            auth::require_identity,
        ))
}

async fn list_labs(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let estimated_cost = state
        .provider
        .estimate("aws-ec2-basics")
        .await
        .map_err(ApiError::provider)?;
    Ok(Json(json!({"items": [{
        "slug": "aws-ec2-basics",
        "version": "1",
        "title": "Launch and inspect an EC2 instance",
        "description": "Start an isolated lab instance and verify its running state.",
        "estimated_cost_cents_per_hour": estimated_cost,
        "tasks": [{"id": "instance-running", "title": "Confirm the instance is running"}]
    }]})))
}

async fn start_session(
    State(state): State<Arc<AppState>>,
    Extension(identity): Extension<Identity>,
    Json(body): Json<StartRequest>,
) -> Result<(StatusCode, Json<Session>), ApiError> {
    state
        .provider
        .validate(&body.lab_slug)
        .await
        .map_err(ApiError::provider)?;
    let id = Uuid::new_v4().to_string();
    let created = Utc::now();
    let expires = created + Duration::minutes(state.session_ttl_minutes);
    let session = Session {
        id: id.clone(),
        owner_sub: identity.subject.clone(),
        lab_slug: body.lab_slug.clone(),
        lab_version: "1".into(),
        status: "PENDING".into(),
        created_at: created.to_rfc3339(),
        expires_at: expires.to_rfc3339(),
        environment: None,
    };
    // Keep the record searchable well beyond expiration so a cleanup outage cannot race TTL.
    put_pending(&state, &session, expires.timestamp() + 30 * 24 * 60 * 60).await?;
    mark_provisioning(&state, &session).await?;

    match state
        .provider
        .provision(&identity.subject, &id, &body.lab_slug, expires.timestamp())
        .await
    {
        Ok(environment) => {
            if let Err(error) = set_active(&state, &session, &environment).await {
                if let Err(cleanup_error) = state.provider.destroy(&environment).await {
                    tracing::error!(session_id = %id, error = %cleanup_error, "failed to roll back unrecorded lab environment");
                }
                return Err(error);
            }
            let mut ready = session;
            ready.status = "ACTIVE".into();
            ready.environment = Some(environment);
            Ok((StatusCode::CREATED, Json(ready)))
        }
        Err(error) => {
            mark_failed(&state, &session.owner_sub, &session.id).await;
            tracing::error!(session_id = %id, error = %error, "lab provisioning failed");
            Err(ApiError::provider(error))
        }
    }
}

async fn list_sessions(
    State(state): State<Arc<AppState>>,
    Extension(identity): Extension<Identity>,
    Query(query): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let partition = auth::subject_partition(&identity.subject);
    let mut request = state
        .dynamodb
        .query()
        .table_name(&state.sessions_table)
        .key_condition_expression("PK = :pk AND begins_with(SK, :prefix)")
        .expression_attribute_values(":pk", AttributeValue::S(partition))
        .expression_attribute_values(":prefix", AttributeValue::S("SESSION#".into()))
        .limit(limit);
    if let Some(token) = query.next_token {
        let decoded = URL_SAFE_NO_PAD
            .decode(token)
            .map_err(|_| ApiError::bad_request("invalid_page_token"))?;
        let sk =
            String::from_utf8(decoded).map_err(|_| ApiError::bad_request("invalid_page_token"))?;
        if !sk.starts_with("SESSION#") {
            return Err(ApiError::bad_request("invalid_page_token"));
        }
        request = request
            .exclusive_start_key(
                "PK",
                AttributeValue::S(auth::subject_partition(&identity.subject)),
            )
            .exclusive_start_key("SK", AttributeValue::S(sk));
    }
    let result = request.send().await.map_err(ApiError::database)?;
    let items = result
        .items()
        .iter()
        .filter_map(parse_session)
        .collect::<Vec<_>>();
    let next_token = result
        .last_evaluated_key()
        .and_then(|key| key.get("SK"))
        .and_then(|value| value.as_s().ok())
        .map(|sk| URL_SAFE_NO_PAD.encode(sk.as_bytes()));
    Ok(Json(json!({"items": items, "next_token": next_token})))
}

async fn get_session(
    State(state): State<Arc<AppState>>,
    Extension(identity): Extension<Identity>,
    Path(id): Path<String>,
) -> Result<Json<Session>, ApiError> {
    Ok(Json(load_owned(&state, &identity.subject, &id).await?))
}

async fn access_session(
    State(state): State<Arc<AppState>>,
    Extension(identity): Extension<Identity>,
    Path(id): Path<String>,
) -> Result<Json<crate::provider::AccessGrant>, ApiError> {
    let session = load_owned(&state, &identity.subject, &id).await?;
    if session.status != "ACTIVE" {
        return Err(ApiError::conflict("session_not_active"));
    }
    let environment = session
        .environment
        .ok_or_else(|| ApiError::conflict("environment_unavailable"))?;
    Ok(Json(
        state
            .provider
            .access(&environment)
            .await
            .map_err(ApiError::provider)?,
    ))
}

async fn evaluate_session(
    State(state): State<Arc<AppState>>,
    Extension(identity): Extension<Identity>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let session = load_owned(&state, &identity.subject, &id).await?;
    if session.status != "ACTIVE" {
        return Err(ApiError::conflict("session_not_active"));
    }
    let environment = session
        .environment
        .ok_or_else(|| ApiError::conflict("environment_unavailable"))?;
    let passed = state
        .provider
        .evaluate(&environment, "instance-running")
        .await
        .map_err(ApiError::provider)?;
    let (pk, sk) = session_keys(&identity.subject, &id);
    state
        .dynamodb
        .update_item()
        .table_name(&state.sessions_table)
        .key("PK", AttributeValue::S(pk))
        .key("SK", AttributeValue::S(sk))
        .update_expression(
            "SET last_task_id = :task, last_task_passed = :passed, last_score = :score",
        )
        .condition_expression("owner_sub = :owner AND #status = :active")
        .expression_attribute_names("#status", "status")
        .expression_attribute_values(":task", AttributeValue::S("instance-running".into()))
        .expression_attribute_values(":passed", AttributeValue::Bool(passed))
        .expression_attribute_values(
            ":score",
            AttributeValue::N((if passed { "100" } else { "0" }).into()),
        )
        .expression_attribute_values(":owner", AttributeValue::S(identity.subject))
        .expression_attribute_values(":active", AttributeValue::S("ACTIVE".into()))
        .send()
        .await
        .map_err(ApiError::database)?;
    Ok(Json(
        json!({"task_id": "instance-running", "passed": passed, "score": if passed {100} else {0}}),
    ))
}

async fn destroy_session(
    State(state): State<Arc<AppState>>,
    Extension(identity): Extension<Identity>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let session = load_owned(&state, &identity.subject, &id).await?;
    if let Some(environment) = session.environment.as_ref() {
        state
            .provider
            .destroy(&environment)
            .await
            .map_err(ApiError::provider)?;
        match state
            .provider
            .inspect(&environment)
            .await
            .map_err(ApiError::provider)?
            .as_str()
        {
            "terminated" | "not-found" => mark_destroyed(&state, &session).await?,
            _ => {
                mark_cleanup_pending(&state, &session).await?;
                return Ok(StatusCode::ACCEPTED);
            }
        }
    } else {
        return Err(ApiError::conflict("environment_unavailable"));
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn put_pending(state: &AppState, session: &Session, ttl_epoch: i64) -> Result<(), ApiError> {
    state
        .dynamodb
        .put_item()
        .table_name(&state.sessions_table)
        .item(
            "PK",
            AttributeValue::S(auth::subject_partition(&session.owner_sub)),
        )
        .item("SK", AttributeValue::S(format!("SESSION#{}", session.id)))
        .item("id", AttributeValue::S(session.id.clone()))
        .item("owner_sub", AttributeValue::S(session.owner_sub.clone()))
        .item("lab_slug", AttributeValue::S(session.lab_slug.clone()))
        .item(
            "lab_version",
            AttributeValue::S(session.lab_version.clone()),
        )
        .item("status", AttributeValue::S(session.status.clone()))
        .item("created_at", AttributeValue::S(session.created_at.clone()))
        .item("expires_at", AttributeValue::S(session.expires_at.clone()))
        .item("ttlEpoch", AttributeValue::N(ttl_epoch.to_string()))
        .condition_expression("attribute_not_exists(PK) AND attribute_not_exists(SK)")
        .send()
        .await
        .map_err(ApiError::database)?;
    Ok(())
}

async fn set_active(
    state: &AppState,
    session: &Session,
    environment: &EnvironmentRef,
) -> Result<(), ApiError> {
    state.dynamodb.update_item().table_name(&state.sessions_table)
        .key("PK", AttributeValue::S(auth::subject_partition(&session.owner_sub)))
        .key("SK", AttributeValue::S(format!("SESSION#{}", session.id)))
        .update_expression("SET #status = :active, GSI1PK = :gpk, GSI1SK = :gsk, provider = :provider, resource_id = :resource")
        .condition_expression("#status = :provisioning")
        .expression_attribute_names("#status", "status")
        .expression_attribute_values(":provisioning", AttributeValue::S("PROVISIONING".into()))
        .expression_attribute_values(":active", AttributeValue::S("ACTIVE".into()))
        .expression_attribute_values(":gpk", AttributeValue::S("STATUS#ACTIVE".into()))
        .expression_attribute_values(":gsk", AttributeValue::S(format!("EXPIRES#{}#SESSION#{}", session.expires_at, session.id)))
        .expression_attribute_values(":provider", AttributeValue::S(environment.provider.clone()))
        .expression_attribute_values(":resource", AttributeValue::S(environment.resource_id.clone()))
        .send().await.map_err(ApiError::database)?;
    Ok(())
}

async fn mark_provisioning(state: &AppState, session: &Session) -> Result<(), ApiError> {
    let (pk, sk) = session_keys(&session.owner_sub, &session.id);
    state
        .dynamodb
        .update_item()
        .table_name(&state.sessions_table)
        .key("PK", AttributeValue::S(pk))
        .key("SK", AttributeValue::S(sk))
        .update_expression("SET #status = :provisioning, provisioning_attempts = :one")
        .condition_expression("owner_sub = :owner AND #status = :pending")
        .expression_attribute_names("#status", "status")
        .expression_attribute_values(":pending", AttributeValue::S("PENDING".into()))
        .expression_attribute_values(":provisioning", AttributeValue::S("PROVISIONING".into()))
        .expression_attribute_values(":one", AttributeValue::N("1".into()))
        .expression_attribute_values(":owner", AttributeValue::S(session.owner_sub.clone()))
        .send()
        .await
        .map_err(ApiError::database)?;
    Ok(())
}

async fn load_owned(state: &AppState, owner: &str, id: &str) -> Result<Session, ApiError> {
    let result = state
        .dynamodb
        .get_item()
        .table_name(&state.sessions_table)
        .key("PK", AttributeValue::S(auth::subject_partition(owner)))
        .key("SK", AttributeValue::S(format!("SESSION#{id}")))
        .consistent_read(true)
        .send()
        .await
        .map_err(ApiError::database)?;
    result
        .item()
        .and_then(parse_session)
        .ok_or_else(|| ApiError::not_found("session_not_found"))
}

async fn mark_failed(state: &AppState, owner: &str, id: &str) {
    let _ = state
        .dynamodb
        .update_item()
        .table_name(&state.sessions_table)
        .key("PK", AttributeValue::S(auth::subject_partition(owner)))
        .key("SK", AttributeValue::S(format!("SESSION#{id}")))
        .update_expression("SET #status = :failed")
        .condition_expression("#status = :provisioning")
        .expression_attribute_names("#status", "status")
        .expression_attribute_values(":provisioning", AttributeValue::S("PROVISIONING".into()))
        .expression_attribute_values(":failed", AttributeValue::S("FAILED".into()))
        .send()
        .await;
}

async fn mark_destroyed(state: &AppState, session: &Session) -> Result<(), ApiError> {
    state
        .dynamodb
        .update_item()
        .table_name(&state.sessions_table)
        .key(
            "PK",
            AttributeValue::S(auth::subject_partition(&session.owner_sub)),
        )
        .key("SK", AttributeValue::S(format!("SESSION#{}", session.id)))
        .update_expression("SET #status = :destroyed REMOVE GSI1PK, GSI1SK")
        .condition_expression("#status = :active OR #status = :cleanup")
        .expression_attribute_names("#status", "status")
        .expression_attribute_values(":active", AttributeValue::S("ACTIVE".into()))
        .expression_attribute_values(":cleanup", AttributeValue::S("CLEANUP_PENDING".into()))
        .expression_attribute_values(":destroyed", AttributeValue::S("DESTROYED".into()))
        .send()
        .await
        .map_err(ApiError::database)?;
    Ok(())
}

/// Reconciles expired infrastructure independently of DynamoDB TTL.
pub async fn cleanup_once(state: &AppState) -> Result<usize, ApiError> {
    let cutoff = format!("EXPIRES#{}", Utc::now().to_rfc3339());
    let mut cleaned = 0;
    for status in ["ACTIVE", "CLEANUP_PENDING"] {
        let result = state
            .dynamodb
            .query()
            .table_name(&state.sessions_table)
            .index_name("GSI1")
            .key_condition_expression("GSI1PK = :pk AND GSI1SK <= :cutoff")
            .expression_attribute_values(":pk", AttributeValue::S(format!("STATUS#{status}")))
            .expression_attribute_values(":cutoff", AttributeValue::S(cutoff.clone()))
            .send()
            .await
            .map_err(ApiError::database)?;
        for item in result.items() {
            let Some(session) = parse_session(item) else {
                continue;
            };
            let Some(environment) = session.environment.as_ref() else {
                continue;
            };
            let mut destroyed = false;
            match state.provider.destroy(environment).await {
                Ok(()) => match state.provider.inspect(environment).await {
                    Ok(state_name) if state_name == "terminated" || state_name == "not-found" => {
                        destroyed = true
                    }
                    Ok(state_name) => {
                        tracing::info!(session_id = %session.id, provider_state = %state_name, "waiting for lab cleanup confirmation")
                    }
                    Err(error) => {
                        tracing::warn!(session_id = %session.id, error = %error, "cleanup verification will retry")
                    }
                },
                Err(error) => {
                    tracing::warn!(session_id = %session.id, error = %error, "lab destroy will retry")
                }
            }
            if destroyed {
                mark_destroyed(state, &session).await?;
                cleaned += 1;
            } else if session.status == "ACTIVE" {
                mark_cleanup_pending(state, &session).await?;
            }
        }
    }
    // Resource tags also find environments whose session item was eventually TTL-deleted.
    let orphans = state
        .provider
        .expired_environments(Utc::now().timestamp())
        .await
        .map_err(ApiError::provider)?;
    for environment in orphans {
        if let Err(error) = state.provider.destroy(&environment).await {
            tracing::warn!(resource_id = %environment.resource_id, error = %error, "orphaned lab cleanup will retry");
            continue;
        }
        match state.provider.inspect(&environment).await {
            Ok(state_name) if state_name == "terminated" || state_name == "not-found" => {
                cleaned += 1
            }
            Ok(state_name) => {
                tracing::info!(resource_id = %environment.resource_id, provider_state = %state_name, "waiting for orphan cleanup confirmation")
            }
            Err(error) => {
                tracing::warn!(resource_id = %environment.resource_id, error = %error, "orphan cleanup verification will retry")
            }
        }
    }
    Ok(cleaned)
}

async fn mark_cleanup_pending(state: &AppState, session: &Session) -> Result<(), ApiError> {
    state
        .dynamodb
        .update_item()
        .table_name(&state.sessions_table)
        .key(
            "PK",
            AttributeValue::S(auth::subject_partition(&session.owner_sub)),
        )
        .key("SK", AttributeValue::S(format!("SESSION#{}", session.id)))
        .update_expression("SET #status = :pending, GSI1PK = :gpk")
        .condition_expression("#status = :active")
        .expression_attribute_names("#status", "status")
        .expression_attribute_values(":active", AttributeValue::S("ACTIVE".into()))
        .expression_attribute_values(":pending", AttributeValue::S("CLEANUP_PENDING".into()))
        .expression_attribute_values(":gpk", AttributeValue::S("STATUS#CLEANUP_PENDING".into()))
        .send()
        .await
        .map_err(ApiError::database)?;
    Ok(())
}

fn parse_session(item: &HashMap<String, AttributeValue>) -> Option<Session> {
    let get = |key: &str| item.get(key)?.as_s().ok().cloned();
    let environment = match (get("provider"), get("resource_id")) {
        (Some(provider), Some(resource_id)) => Some(EnvironmentRef {
            provider,
            resource_id,
        }),
        _ => None,
    };
    Some(Session {
        id: get("id")?,
        owner_sub: get("owner_sub")?,
        lab_slug: get("lab_slug")?,
        lab_version: get("lab_version")?,
        status: get("status")?,
        created_at: get("created_at")?,
        expires_at: get("expires_at")?,
        environment,
    })
}

fn session_keys(owner: &str, id: &str) -> (String, String) {
    (auth::subject_partition(owner), format!("SESSION#{id}"))
}

#[cfg(test)]
mod tests {
    use super::session_keys;

    #[test]
    fn session_keys_are_scoped_to_the_verified_owner() {
        let (pk, sk) = session_keys("verified-cognito-sub", "session-1");
        assert_eq!(pk, "SUB#verified-cognito-sub");
        assert_eq!(sk, "SESSION#session-1");
        assert_ne!(pk, session_keys("attacker-sub", "session-1").0);
    }

    #[test]
    fn request_body_cannot_change_the_owner_partition() {
        // Ownership is supplied to `session_keys` only from the authenticated Identity extension.
        let verified_sub = "sub-from-signed-token";
        let body_sub = "sub-in-untrusted-json";
        assert_eq!(
            session_keys(verified_sub, "id").0,
            "SUB#sub-from-signed-token"
        );
        assert_ne!(
            session_keys(verified_sub, "id").0,
            format!("SUB#{body_sub}")
        );
    }
}

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: String,
}
impl ApiError {
    fn bad_request(code: &str) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: code.into(),
        }
    }
    fn not_found(code: &str) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code: code.into(),
        }
    }
    fn conflict(code: &str) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            code: code.into(),
        }
    }
    fn database<E: std::fmt::Display>(error: E) -> Self {
        tracing::error!(error = %error, "DynamoDB operation failed");
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "database_error".into(),
        }
    }
    fn provider<E: std::fmt::Display>(error: E) -> Self {
        tracing::error!(error = %error, "lab provider operation failed");
        Self {
            status: StatusCode::BAD_GATEWAY,
            code: "provider_error".into(),
        }
    }
}
impl axum::response::IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (self.status, Json(json!({"error": self.code}))).into_response()
    }
}
