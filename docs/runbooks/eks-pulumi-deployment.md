# Deploy the EKS clusters with Pulumi

This runbook creates four EKS clusters from the existing network stacks. It assumes the network stacks and VPC connectivity stack have been deployed and their outputs are available in the configured Pulumi backend.

The first cluster is `kloudlab-management`; it will host Argo CD. The three workload clusters follow. Each cluster starts with two `t3.medium` managed nodes across the private subnets. This is the current development sizing hypothesis, not a production capacity decision.

## 1. Set your AWS profile and API allowlist

Run from the repository root. The public EKS API endpoint is enabled for initial operator access, and the stack validation rejects an empty allowlist. The command below obtains your current IPv4 egress address and limits access to that single address. Repeat the config command in each cluster project. If your network address changes, update the CIDR and apply the stack again.

```sh
export AWS_PROFILE=kloudlab
export AWS_REGION=ap-south-1
export EKS_API_CIDR="$(curl -4fsS https://checkip.amazonaws.com | tr -d '\n')/32"
printf 'EKS API allowlist: %s\n' "$EKS_API_CIDR"
```

Use the same Pulumi S3 backend already configured for the network stacks. If needed, log in with:

```sh
pulumi login 's3://kloudlab-pulumi-state?region=ap-south-1'
```

## 2. Create the management cluster first

```sh
cd infra/stacks/cluster-management
pulumi stack init dev --secrets-provider='awskms://alias/kloudlab-pulumi-state?region=ap-south-1'
pulumi config set --path 'kloudlab-cluster:publicAccessCidrs[0]' "$EKS_API_CIDR"
pulumi preview
```

Review the preview for the `kloudlab-management` EKS control plane, IAM roles, managed add-ons, and two-node `t3.medium` node group. Then create it:

```sh
pulumi up
```

When it completes, connect `kubectl` and confirm the nodes are Ready:

```sh
aws eks update-kubeconfig --region "$AWS_REGION" --name kloudlab-management
kubectl get nodes
```

## 3. Create the app cluster

```sh
cd ../cluster-app
pulumi stack init dev --secrets-provider='awskms://alias/kloudlab-pulumi-state?region=ap-south-1'
pulumi config set --path 'kloudlab-cluster:publicAccessCidrs[0]' "$EKS_API_CIDR"
pulumi preview
pulumi up
```

The app stack omits the EKS `kube-proxy` add-on and applies the Cilium bootstrap taint. Install and verify Cilium through the documented Argo CD flow before scheduling application workloads; see [Cilium app-cluster runbook](cilium-app-cluster.md).

## 4. Create the identity cluster

```sh
cd ../cluster-identity
pulumi stack init dev --secrets-provider='awskms://alias/kloudlab-pulumi-state?region=ap-south-1'
pulumi config set --path 'kloudlab-cluster:publicAccessCidrs[0]' "$EKS_API_CIDR"
pulumi preview
pulumi up
```

## 5. Create the observability cluster

```sh
cd ../cluster-observability
pulumi stack init dev --secrets-provider='awskms://alias/kloudlab-pulumi-state?region=ap-south-1'
pulumi config set --path 'kloudlab-cluster:publicAccessCidrs[0]' "$EKS_API_CIDR"
pulumi preview
pulumi up
```

For each stack, stop at `pulumi preview` and inspect the planned changes before running `pulumi up`. If `dev` was already initialized in that project, use `pulumi stack select dev` instead of `pulumi stack init dev`.

## Outputs and access

Each stack exports its cluster name, API endpoint, OIDC issuer URL, cluster security group ID, node role ARN, and node group name. Read them from that stack directory with:

```sh
pulumi stack output
```

The workload cluster control-plane security groups allow API traffic from the management VPC over the existing peering routes. Keep the public CIDR allowlist narrow; do not use `0.0.0.0/0`. Argo CD registration and restricted cross-cluster credentials are a later GitOps bootstrap step; the EKS stacks do not install Argo CD or application workloads.
