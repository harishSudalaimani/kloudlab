mod auth;
mod config;
mod payments;
mod provider;
mod sessions;

use std::{net::SocketAddr, sync::Arc};

use aws_sdk_dynamodb::Client as DynamoClient;
use axum::{
    Router,
    http::{
        HeaderValue,
        header::{AUTHORIZATION, CONTENT_TYPE},
    },
    routing::get,
};
use config::Config;
use provider::{AwsEc2Provider, LabProvider, LocalProvider};
use sessions::{AppState, secure_router};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = Config::from_env()?;
    let aws_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(aws_config::Region::new(config.aws_region.clone()))
        .load()
        .await;
    let mut dynamo_builder = aws_sdk_dynamodb::config::Builder::from(&aws_config);
    if let Some(endpoint) = &config.dynamodb_endpoint {
        dynamo_builder = dynamo_builder.endpoint_url(endpoint);
    }
    let dynamodb = DynamoClient::from_conf(dynamo_builder.build());
    let verifier = auth::CognitoVerifier::new(
        config.cognito_issuer.clone(),
        config.cognito_app_client_id.clone(),
    )
    .await?;

    let provider: Arc<dyn LabProvider> = if config.lab_provider == "aws" {
        Arc::new(AwsEc2Provider::from_env(&aws_config).await?)
    } else {
        Arc::new(LocalProvider::default())
    };
    let state = Arc::new(AppState {
        dynamodb,
        verifier,
        provider,
        sessions_table: config.sessions_table,
        session_ttl_minutes: config.session_ttl_minutes,
    });

    let cleanup_state = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            if let Err(error) = sessions::cleanup_once(&cleanup_state).await {
                tracing::error!(error = ?error, "session cleanup pass failed");
            }
        }
    });

    let allowed_origin: HeaderValue = config.web_origin.parse()?;
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .merge(secure_router(state.verifier.clone()))
        .layer(
            CorsLayer::new()
                .allow_origin(allowed_origin)
                .allow_methods([http::Method::GET, http::Method::POST])
                .allow_headers([AUTHORIZATION, CONTENT_TYPE]),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);
    let address: SocketAddr = config.api_bind.parse()?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    tracing::info!(%address, "CloudLab API listening");
    axum::serve(listener, app).await?;
    Ok(())
}
