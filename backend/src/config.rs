use std::env;

pub struct Config {
    pub api_bind: String,
    pub web_origin: String,
    pub aws_region: String,
    pub dynamodb_endpoint: Option<String>,
    pub sessions_table: String,
    pub cognito_issuer: String,
    pub cognito_app_client_id: String,
    pub lab_provider: String,
    pub session_ttl_minutes: i64,
}

impl Config {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Self {
            api_bind: env::var("API_BIND").unwrap_or_else(|_| "127.0.0.1:8080".into()),
            web_origin: env::var("WEB_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".into()),
            aws_region: env::var("AWS_REGION").unwrap_or_else(|_| "ap-south-1".into()),
            dynamodb_endpoint: env::var("DYNAMODB_ENDPOINT").ok(),
            sessions_table: env::var("SESSIONS_TABLE")?,
            cognito_issuer: env::var("COGNITO_ISSUER")?,
            cognito_app_client_id: env::var("COGNITO_APP_CLIENT_ID")?,
            lab_provider: env::var("LAB_PROVIDER").unwrap_or_else(|_| "local".into()),
            session_ttl_minutes: env::var("LAB_SESSION_TTL_MINUTES")
                .unwrap_or_else(|_| "60".into())
                .parse()?,
        })
    }
}
