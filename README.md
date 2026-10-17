# KloudLab

KloudLab is a hands-on cloud and infrastructure learning platform. Local development uses a Rust API, React/Vite frontend, Cognito authentication, and DynamoDB. The production direction is one AWS production account and one EKS cluster hosting the API and guided student labs.

## Production target

- The API runs on a platform node group and receives AWS access through a dedicated IAM role.
- Guided lab workloads use prebuilt images, per-session namespaces, and a separate tainted node group.
- Students do not receive AWS credentials, Kubernetes credentials, or permission to submit arbitrary manifests/images.
- Cognito authenticates students; DynamoDB stores session state; ECR stores application images.
- Terraform provisions the production VPC, EKS control plane and node groups, Cognito, DynamoDB, ECR, IAM, and remote Terraform state.

A shared EKS cluster provides weaker isolation than separate clusters or accounts. Keep the first exercises controlled and prebuilt, and configure per-session Kubernetes RBAC, quotas, Pod Security, and network policy before admitting students. See [AWS EKS tenant isolation guidance](https://docs.aws.amazon.com/eks/latest/best-practices/tenant-isolation.html).

## Current implementation status

The existing Rust API still has a local simulator and an EC2/SSM lab provider. It does not yet create Kubernetes namespaces or run guided workloads in EKS. Terraform is an infrastructure foundation; it does not yet build/deploy the application, install the AWS Load Balancer Controller, or provide the HTTPS frontend URL needed by hosted Cognito sign-in. Do not apply it as though the online product is complete.

See [production Terraform setup](infra/terraform/PRODUCTION.md) and [local development](docs/local-development.md). `docker-compose.yml` starts DynamoDB Local for local development; production uses the managed DynamoDB table.

## Repository

```text
backend/              Rust API and current local/EC2 lab providers
web/                  React + Vite frontend
infra/terraform/      Production AWS foundation and remote-state bootstrap
scripts/              Local DynamoDB table setup
docs/                 Local setup, data model, and operations notes
.github/workflows/    CI and AWS OIDC identity check
```

## Development checks

- API: `cargo test --manifest-path backend/Cargo.toml`
- Frontend: `cd web && npm install && npm run build`
- Terraform formatting: `terraform -chdir=infra/terraform fmt -check -recursive`
- Terraform validation requires provider initialization and network access: `terraform -chdir=infra/terraform validate`
