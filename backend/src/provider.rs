use std::{collections::HashMap, env, error::Error, sync::Mutex};

use async_trait::async_trait;
use aws_sdk_ec2::{
    Client as Ec2Client,
    types::{
        HttpTokensState, IamInstanceProfileSpecification, InstanceMetadataEndpointState,
        InstanceMetadataOptionsRequest, ResourceType, Tag, TagSpecification,
    },
};
use aws_sdk_ssm::Client as SsmClient;
use serde::{Deserialize, Serialize};

pub type ProviderResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct EnvironmentRef {
    pub provider: String,
    pub resource_id: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct AccessGrant {
    pub session_id: String,
    pub stream_url: String,
    pub token: String,
}

#[async_trait]
#[allow(dead_code)]
pub trait LabProvider: Send + Sync {
    async fn validate(&self, lab_slug: &str) -> ProviderResult<()>;
    async fn estimate(&self, lab_slug: &str) -> ProviderResult<u64>;
    async fn provision(
        &self,
        owner: &str,
        session_id: &str,
        lab_slug: &str,
        expires_epoch: i64,
    ) -> ProviderResult<EnvironmentRef>;
    async fn inspect(&self, environment: &EnvironmentRef) -> ProviderResult<String>;
    async fn access(&self, environment: &EnvironmentRef) -> ProviderResult<AccessGrant>;
    async fn evaluate(&self, environment: &EnvironmentRef, task_id: &str) -> ProviderResult<bool>;
    async fn reset(&self, environment: &EnvironmentRef) -> ProviderResult<()>;
    async fn stop(&self, environment: &EnvironmentRef) -> ProviderResult<()>;
    async fn resume(&self, environment: &EnvironmentRef) -> ProviderResult<()>;
    async fn destroy(&self, environment: &EnvironmentRef) -> ProviderResult<()>;
    async fn expired_environments(&self, now_epoch: i64) -> ProviderResult<Vec<EnvironmentRef>>;
}

pub struct AwsEc2Provider {
    ec2: Ec2Client,
    ssm: SsmClient,
    image_id: String,
    subnet_id: String,
    security_group_id: String,
    instance_profile: String,
}

impl AwsEc2Provider {
    pub async fn from_env(config: &aws_config::SdkConfig) -> Result<Self, Box<dyn Error>> {
        Ok(Self {
            ec2: Ec2Client::new(config),
            ssm: SsmClient::new(config),
            image_id: env::var("LAB_AMI_ID")?,
            subnet_id: env::var("LAB_SUBNET_ID")?,
            security_group_id: env::var("LAB_SECURITY_GROUP_ID")?,
            instance_profile: env::var("LAB_INSTANCE_PROFILE")?,
        })
    }
}

#[async_trait]
impl LabProvider for AwsEc2Provider {
    async fn validate(&self, lab_slug: &str) -> ProviderResult<()> {
        if lab_slug != "aws-ec2-basics" {
            return Err("unknown AWS lab".into());
        }
        Ok(())
    }

    async fn estimate(&self, _lab_slug: &str) -> ProviderResult<u64> {
        // Cost is a configured estimate in USD cents per hour for one t3.micro.
        Ok(env::var("LAB_ESTIMATED_CENTS_PER_HOUR")
            .unwrap_or_else(|_| "2".into())
            .parse()?)
    }

    async fn provision(
        &self,
        owner: &str,
        session_id: &str,
        lab_slug: &str,
        expires_epoch: i64,
    ) -> ProviderResult<EnvironmentRef> {
        self.validate(lab_slug).await?;
        let tag = |key: &str, value: &str| Tag::builder().key(key).value(value).build();
        let tags = TagSpecification::builder()
            .resource_type(ResourceType::Instance)
            .tags(tag("cloudlab", "true"))
            .tags(tag("cloudlab:owner", owner))
            .tags(tag("cloudlab:session", session_id))
            .tags(tag("cloudlab:lab", lab_slug))
            .tags(tag("cloudlab:expires_epoch", &expires_epoch.to_string()))
            .build();
        let profile = IamInstanceProfileSpecification::builder()
            .name(&self.instance_profile)
            .build();
        let result = self
            .ec2
            .run_instances()
            .image_id(&self.image_id)
            .instance_type(aws_sdk_ec2::types::InstanceType::T3Micro)
            .min_count(1)
            .max_count(1)
            .subnet_id(&self.subnet_id)
            .security_group_ids(&self.security_group_id)
            .iam_instance_profile(profile)
            .metadata_options(
                InstanceMetadataOptionsRequest::builder()
                    .http_endpoint(InstanceMetadataEndpointState::Enabled)
                    .http_tokens(HttpTokensState::Required)
                    .http_put_response_hop_limit(1)
                    .build(),
            )
            .tag_specifications(tags)
            .send()
            .await?;
        let instance_id = result
            .instances()
            .first()
            .and_then(|i| i.instance_id())
            .ok_or("EC2 returned no instance ID")?
            .to_owned();
        Ok(EnvironmentRef {
            provider: "aws-ec2".into(),
            resource_id: instance_id,
        })
    }

    async fn inspect(&self, environment: &EnvironmentRef) -> ProviderResult<String> {
        let response = self
            .ec2
            .describe_instances()
            .instance_ids(&environment.resource_id)
            .send()
            .await?;
        let Some(instance) = response
            .reservations()
            .first()
            .and_then(|reservation| reservation.instances().first())
        else {
            return Ok("not-found".into());
        };
        let state = instance
            .state()
            .and_then(|state| state.name())
            .map(|state| state.as_str())
            .unwrap_or("unknown");
        Ok(state.to_owned())
    }

    async fn access(&self, environment: &EnvironmentRef) -> ProviderResult<AccessGrant> {
        let session = self
            .ssm
            .start_session()
            .target(&environment.resource_id)
            .send()
            .await?;
        Ok(AccessGrant {
            session_id: session.session_id().unwrap_or_default().to_owned(),
            stream_url: session.stream_url().unwrap_or_default().to_owned(),
            token: session.token_value().unwrap_or_default().to_owned(),
        })
    }

    async fn evaluate(&self, environment: &EnvironmentRef, task_id: &str) -> ProviderResult<bool> {
        if task_id != "instance-running" {
            return Ok(false);
        }
        Ok(self.inspect(environment).await? == "running")
    }

    async fn reset(&self, _environment: &EnvironmentRef) -> ProviderResult<()> {
        Err("reset is not configured for this lab version".into())
    }

    async fn stop(&self, environment: &EnvironmentRef) -> ProviderResult<()> {
        self.ec2
            .stop_instances()
            .instance_ids(&environment.resource_id)
            .send()
            .await?;
        Ok(())
    }

    async fn resume(&self, environment: &EnvironmentRef) -> ProviderResult<()> {
        self.ec2
            .start_instances()
            .instance_ids(&environment.resource_id)
            .send()
            .await?;
        Ok(())
    }

    async fn destroy(&self, environment: &EnvironmentRef) -> ProviderResult<()> {
        self.ec2
            .terminate_instances()
            .instance_ids(&environment.resource_id)
            .send()
            .await?;
        Ok(())
    }

    async fn expired_environments(&self, now_epoch: i64) -> ProviderResult<Vec<EnvironmentRef>> {
        let mut results = Vec::new();
        let mut next_token: Option<String> = None;
        loop {
            let mut request = self.ec2.describe_instances().filters(
                aws_sdk_ec2::types::Filter::builder()
                    .name("tag:cloudlab")
                    .values("true")
                    .build(),
            );
            if let Some(token) = next_token.as_deref() {
                request = request.next_token(token);
            }
            let page = request.send().await?;
            for instance in page.reservations().iter().flat_map(|r| r.instances()) {
                let expires = instance
                    .tags()
                    .iter()
                    .find(|tag| tag.key() == Some("cloudlab:expires_epoch"))
                    .and_then(|tag| tag.value())
                    .and_then(|value| value.parse::<i64>().ok());
                let state = instance
                    .state()
                    .and_then(|state| state.name())
                    .map(|state| state.as_str())
                    .unwrap_or("unknown");
                if expires.is_some_and(|at| at <= now_epoch) && state != "terminated" {
                    if let Some(resource_id) = instance.instance_id() {
                        results.push(EnvironmentRef {
                            provider: "aws-ec2".into(),
                            resource_id: resource_id.into(),
                        });
                    }
                }
            }
            next_token = page.next_token().map(str::to_owned);
            if next_token.is_none() {
                break;
            }
        }
        Ok(results)
    }
}

#[derive(Default)]
pub struct LocalProvider {
    states: Mutex<HashMap<String, String>>,
}

#[async_trait]
impl LabProvider for LocalProvider {
    async fn validate(&self, lab_slug: &str) -> ProviderResult<()> {
        if lab_slug == "aws-ec2-basics" {
            Ok(())
        } else {
            Err("unknown lab".into())
        }
    }
    async fn estimate(&self, _lab_slug: &str) -> ProviderResult<u64> {
        Ok(0)
    }
    async fn provision(
        &self,
        _owner: &str,
        session_id: &str,
        lab_slug: &str,
        _expires_epoch: i64,
    ) -> ProviderResult<EnvironmentRef> {
        self.validate(lab_slug).await?;
        let resource_id = format!("local-{session_id}");
        self.states
            .lock()
            .map_err(|_| "local provider lock poisoned")?
            .insert(resource_id.clone(), "running".into());
        Ok(EnvironmentRef {
            provider: "local-simulator".into(),
            resource_id,
        })
    }
    async fn inspect(&self, environment: &EnvironmentRef) -> ProviderResult<String> {
        Ok(self
            .states
            .lock()
            .map_err(|_| "local provider lock poisoned")?
            .get(&environment.resource_id)
            .cloned()
            .unwrap_or_else(|| "not-found".into()))
    }
    async fn access(&self, environment: &EnvironmentRef) -> ProviderResult<AccessGrant> {
        Ok(AccessGrant {
            session_id: environment.resource_id.clone(),
            stream_url: "http://localhost:5173/lab-shell".into(),
            token: "local-only".into(),
        })
    }
    async fn evaluate(&self, environment: &EnvironmentRef, task_id: &str) -> ProviderResult<bool> {
        Ok(task_id == "instance-running" && self.inspect(environment).await? == "running")
    }
    async fn reset(&self, environment: &EnvironmentRef) -> ProviderResult<()> {
        self.states
            .lock()
            .map_err(|_| "local provider lock poisoned")?
            .insert(environment.resource_id.clone(), "running".into());
        Ok(())
    }
    async fn stop(&self, environment: &EnvironmentRef) -> ProviderResult<()> {
        self.states
            .lock()
            .map_err(|_| "local provider lock poisoned")?
            .insert(environment.resource_id.clone(), "stopped".into());
        Ok(())
    }
    async fn resume(&self, environment: &EnvironmentRef) -> ProviderResult<()> {
        self.reset(environment).await
    }
    async fn destroy(&self, environment: &EnvironmentRef) -> ProviderResult<()> {
        self.states
            .lock()
            .map_err(|_| "local provider lock poisoned")?
            .insert(environment.resource_id.clone(), "terminated".into());
        Ok(())
    }
    async fn expired_environments(&self, _now_epoch: i64) -> ProviderResult<Vec<EnvironmentRef>> {
        Ok(Vec::new())
    }
}
