# Production Terraform foundation

Terraform is the only active infrastructure source. The AWS root creates the production VPC, EKS cluster, three baseline managed node groups, Cognito, DynamoDB, ECR, IAM and Karpenter AWS permissions. The separate `karpenter/` root installs Karpenter into that cluster and applies its EC2NodeClass and NodePool after the CRDs exist.

## Capacity layout

| Pool | Initial capacity | Purpose |
|---|---:|---|
| `platform` | 1 × `m8a.medium` | Core platform components and Karpenter controller |
| `backend` | 1 × `m8a.medium` | Rust API and lifecycle services |
| `observability` | 1 × `m8a.medium` | Metrics, logs and traces when those services are added |
| `student-labs` (Karpenter) | 0 | Launches `m8a.large` only for eligible pending lab pods |

AWS lists M8a in Mumbai ([regional instance family list](https://docs.aws.amazon.com/ec2/latest/instancetypes/ec2-instance-regions.html)). `m8a.medium` has 1 vCPU and 4 GiB; `m8a.large` has 2 vCPU and 8 GiB ([EC2 specifications](https://docs.aws.amazon.com/ec2/latest/instancetypes/gp.html)). The M8a family is AMD x86-64, so current x86 images can run on it. Check current Availability Zone offerings and account vCPU quotas before deployment. Karpenter is constrained to on-demand `m8a.large` for the first version, caps the lab pool at 32 vCPU/128 GiB, uses encrypted 40 GiB gp3 node disks, and terminates only empty nodes after two minutes, avoiding disruption to active lab pods. A node is created only when a pod remains pending and tolerates the `workload=student-labs:NoSchedule` taint; deleting the lab pod makes the node eligible for consolidation.

Each baseline managed node group starts with one node. Terraform allows up to two per group, but no baseline-node autoscaler is installed; increase desired capacity through Terraform when measurements call for it. These are small starting sizes: the observability stack and API may not fit comfortably until resource requests are measured. Do not treat the three baseline nodes as validated production capacity.

## 1. Check your AWS account and regional capacity

Use your existing profile, and verify the assumed role is the account/role you intend to maintain:

```sh
aws sts get-caller-identity --profile kloudlab
aws eks describe-cluster-versions --region ap-south-1 --profile kloudlab
aws ec2 describe-instance-type-offerings --region ap-south-1 --location-type availability-zone --filters Name=instance-type,Values=m8a.medium,m8a.large --profile kloudlab
aws service-quotas get-service-quota --service-code ec2 --quota-code L-1216C47A --region ap-south-1 --profile kloudlab
```

The instance offerings command must show `m8a.medium` and `m8a.large` in at least two of the selected AZs. Check the account's Standard On-Demand instance quota; the three baseline nodes consume 3 vCPU and each lab node adds 2 vCPU. EKS support and AWS account quotas can change, so use the CLI output immediately before deployment.

## 2. Create the Terraform state bucket once

Use a globally unique bucket name. This bootstrap root keeps its state locally because the S3 backend must exist before the production root can initialize. Preserve the generated state file securely until the remote roots are initialized.

```sh
cd infra/terraform/state
AWS_PROFILE=kloudlab terraform init
AWS_PROFILE=kloudlab terraform apply -var='state_bucket_name=kloudlab-tfstate-577060405217-ap-south-1'
```

The state bucket has versioning, encryption, public access blocking, and a TLS-only bucket policy. Keep the local bootstrap state backed up; do not commit it.

## 3. Plan and apply the AWS foundation

Copy `terraform.tfvars.example` to `terraform.tfvars`. Replace the operator role, your current public IPv4 CIDR or VPN CIDR, the globally unique Cognito prefix, and GitHub owner/repository. The operator ARN must be the IAM role ARN, not the STS `assumed-role/.../session` ARN printed by `get-caller-identity`. Do not use `0.0.0.0/0` for the EKS endpoint.

```sh
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
AWS_PROFILE=kloudlab terraform init \
  -backend-config='bucket=kloudlab-tfstate-577060405217-ap-south-1' \
  -backend-config='key=kloudlab/prod/infrastructure.tfstate' \
  -backend-config='region=ap-south-1' \
  -backend-config='encrypt=true' \
  -backend-config='use_lockfile=true'
terraform fmt -check -recursive
AWS_PROFILE=kloudlab terraform validate
AWS_PROFILE=kloudlab terraform plan -out=prod.tfplan
```

Review the plan. It creates a new VPC with two AZs, private EKS worker subnets, and one shared NAT gateway to control launch cost. The NAT gateway is a single-AZ dependency; if you require AZ-resilient egress later, change it to one NAT gateway per AZ and review the added recurring cost.

Only after reviewing the plan, apply it:

```sh
AWS_PROFILE=kloudlab terraform apply prod.tfplan
```

This creates billable EKS control-plane, three baseline EC2 nodes, NAT, EBS, CloudWatch and networking resources. Set an AWS Budget and alert before applying. Terraform plan/apply are not run by this guide.

## 4. Install Karpenter and its m8a.large-only NodePool

The add-ons root has a separate state key and reads the cluster created in step 3. It authenticates through the AWS CLI exec plugin; keep `AWS_PROFILE=kloudlab` set for each command.

```sh
cd infra/terraform/karpenter
AWS_PROFILE=kloudlab terraform init \
  -backend-config='bucket=kloudlab-tfstate-577060405217-ap-south-1' \
  -backend-config='key=kloudlab/prod/karpenter.tfstate' \
  -backend-config='region=ap-south-1' \
  -backend-config='encrypt=true' \
  -backend-config='use_lockfile=true'
```

Provide the outputs from the first root as variables. Create `karpenter/terraform.tfvars` (ignored by Git):

```hcl
karpenter_controller_role_arn = "<terraform output karpenter_controller_role_arn>"
karpenter_node_role_name      = "<terraform output karpenter_node_role_name>"
interruption_queue_name       = "<terraform output karpenter_interruption_queue_name>"
```

The first add-ons apply installs the Karpenter chart and its CRDs. Karpenter 1.15.0 documents compatibility with EKS Kubernetes 1.36 ([Karpenter getting started](https://karpenter.sh/docs/getting-started/getting-started-with-karpenter/)). Run it once with a target so Kubernetes can discover the Karpenter custom-resource schemas. Then run the full plan/apply to manage the EC2NodeClass and NodePool:

```sh
AWS_PROFILE=kloudlab terraform plan -target=helm_release.karpenter -out=karpenter-chart.tfplan
AWS_PROFILE=kloudlab terraform apply karpenter-chart.tfplan
AWS_PROFILE=kloudlab terraform plan -out=karpenter-pool.tfplan
AWS_PROFILE=kloudlab terraform apply karpenter-pool.tfplan
```

The pool has no desired node count. To trigger capacity, a lab controller must create a pod with realistic CPU/memory requests, the `workload=student-labs` node selector, and a matching toleration. An example is in `../kubernetes/labs/lab-pod-template.yaml`. The Rust API still uses local and EC2/SSM providers; it does not yet create these Kubernetes workloads or clean up vClusters. Karpenter infrastructure alone does not make lab sessions work.

Check the installation:

```sh
aws eks update-kubeconfig --region ap-south-1 --name kloudlab-prod-eks --profile kloudlab
kubectl get nodes -L workload
kubectl get nodepool student-labs
kubectl get ec2nodeclass student-labs
```

To verify the zero-to-one trigger, create this short-lived smoke pod after Karpenter is ready. It selects and tolerates only the lab pool, so the platform nodes cannot satisfy it. Watch for a `m8a.large` node, then delete the pod; the empty node should be terminated after the two-minute consolidation delay.

```sh
kubectl apply -f - <<'YAML'
apiVersion: v1
kind: Pod
metadata:
  name: karpenter-m8a-smoke
  namespace: default
spec:
  terminationGracePeriodSeconds: 0
  nodeSelector:
    workload: student-labs
  tolerations:
    - key: workload
      operator: Equal
      value: student-labs
      effect: NoSchedule
  containers:
    - name: pause
      image: public.ecr.aws/eks-distro/kubernetes/pause:3.7
      resources:
        requests:
          cpu: 500m
          memory: 256Mi
YAML
kubectl get pod karpenter-m8a-smoke -w
kubectl get nodes -L workload,node.kubernetes.io/instance-type
kubectl delete pod karpenter-m8a-smoke
```

## Current application integration gap

The Rust API does not yet implement a Kubernetes/vCluster provider, session-specific cluster credentials, or restart-safe reconciliation for vClusters. The namespace template in `../kubernetes/labs/session-namespace-template.yaml` needs a controller to render and apply it. NetworkPolicies require an enforcing network plugin and explicit exercise egress rules; creating policy objects alone does not enforce them. Argo CD, the observability stack, an HTTPS API/frontend endpoint, and hosted Cognito callbacks also remain to be deployed. Keep student access closed until those parts are implemented and reviewed.

`docker-compose.yml` remains the local DynamoDB Local workflow. It is not used in AWS production.
