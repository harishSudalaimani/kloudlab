# KloudLab

KloudLab is a hands-on cloud learning platform. Local development uses a Rust API, React/Vite frontend, and DynamoDB Local. Production is planned for one AWS account and one EKS cluster hosting the platform API and guided Kubernetes labs.

## Production infrastructure

Terraform is the only infrastructure-as-code tool in this repository. It targets `ap-south-1` and provisions a new VPC, EKS, Cognito, DynamoDB, ECR, IAM, and Karpenter. See [Production Terraform](infra/terraform/PRODUCTION.md) for the staged setup and manual commands.

The baseline is three on-demand managed node groups with one `m8a.medium` each: platform, backend, and observability. Karpenter starts with zero lab nodes and can create on-demand `m8a.large` instances when matching student-lab pods are pending. Its first NodePool is capped at 32 vCPU/128 GiB. AWS lists M8a for Mumbai; check per-AZ offerings and your account quota before planning a deployment. [AWS lists M8a in `ap-south-1`](https://docs.aws.amazon.com/ec2/latest/instancetypes/ec2-instance-regions.html), and its specifications show `m8a.medium` as 1 vCPU/4 GiB and `m8a.large` as 2 vCPU/8 GiB ([instance specifications](https://docs.aws.amazon.com/ec2/latest/instancetypes/gp.html)).

This is an infrastructure foundation, not a finished online service. The Rust API still uses local/EC2 providers and does not provision vClusters. See the production guide for work that must be completed before student traffic is enabled.

`docker-compose.yml` stays for local development; it runs DynamoDB Local. See [local development](docs/local-development.md).

## Repository

```text
backend/                  Rust API and current local/legacy EC2 providers
web/                      React + Vite frontend
infra/terraform/          Active production Terraform and state bootstrap
infra/terraform/karpenter/ Karpenter Helm release and dynamic m8a.large pool
infra/kubernetes/labs/    Per-session isolation and scheduling templates
scripts/                  Local DynamoDB table setup
.github/workflows/        CI and AWS OIDC identity check
```

## Local checks

```sh
cargo test --manifest-path backend/Cargo.toml
cd web && npm install && npm run build
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform/karpenter fmt -check -recursive
```

Terraform validation requires initialized providers and AWS/Kubernetes access for the Karpenter add-ons root. Local formatting checks do not contact AWS.
