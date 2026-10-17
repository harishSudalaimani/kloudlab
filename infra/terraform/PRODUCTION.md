# Production Terraform foundation

This directory provisions one production VPC and EKS cluster, with an always-on platform node group and a separately tainted student-lab node group. It also provisions Cognito, the sessions DynamoDB table, ECR repositories, an API IRSA role, and a GitHub Actions OIDC role scoped to image pushes. It does not deploy application pods, install the AWS Load Balancer Controller, or create a public HTTPS frontend/API URL.

Student lab pods must be scheduled only onto nodes with `workload=student-labs:NoSchedule`; platform pods should tolerate only the taints they need. Guided exercises need per-session namespaces and Kubernetes RBAC, quotas, default-deny NetworkPolicies, and admission controls before they are exposed to students. Keep the AWS-provided public EKS API endpoint restricted to your operator/VPN CIDR.

## Bootstrap Terraform state once

Use a unique bucket name. The state bucket is created separately because an S3 backend must exist before Terraform can initialize the production root.

```sh
cd infra/terraform/state
terraform init
terraform apply -var='state_bucket_name=kloudlab-tfstate-577060405217-ap-south-1'
```

This bootstrap state is local. Preserve `terraform.tfstate` securely and back it up; the next step moves the production root state to S3.

## Initialize and inspect production plan

Copy `terraform.tfvars.example` to `terraform.tfvars` and set an EKS Kubernetes version currently supported in `ap-south-1`, the operator IAM role ARN, your public IPv4 CIDR with `/32` (or VPN CIDR), unique Cognito prefix, and real GitHub owner/repo. The example starts with localhost Cognito callbacks so the foundation can be created first; after the HTTPS frontend URL exists, add its callback/logout URLs and run `terraform apply` again. Replace every `REPLACE_...` value before planning. Never put AWS keys in this file.

```sh
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init \
  -backend-config='bucket=kloudlab-tfstate-577060405217-ap-south-1' \
  -backend-config='key=kloudlab/prod/terraform.tfstate' \
  -backend-config='region=ap-south-1' \
  -backend-config='encrypt=true' \
  -backend-config='use_lockfile=true'
terraform fmt -check -recursive
terraform validate
terraform plan -out=prod.tfplan
```

Review the plan before applying it. The production network creates one NAT gateway per Availability Zone for resilient private-node egress. EKS control-plane, NAT, EC2 node groups, EBS and CloudWatch incur ongoing charges. The lab node group starts with one on-demand node so guided workloads can run; node-group autoscaling policy integration is not included yet, so adjust its desired capacity deliberately as usage grows.

## Current application integration gap

The Rust API currently implements EC2/SSM and local lab providers, not an EKS/Kubernetes provider. The Terraform role and cluster are a foundation; they do not make student lab sessions work in EKS. Before deploying the API, migrate the provider to create only approved, prebuilt lab workloads in per-session namespaces, add Kubernetes RBAC and namespace guardrails, and package the API/web apps into the ECR repositories. An HTTPS AWS-provided frontend URL (for example, a CloudFront distribution) and matching Cognito callbacks also need to be established before hosted sign-in works online.

`docker-compose.yml` remains for local development only: it starts DynamoDB Local. It is not part of this production stack.
