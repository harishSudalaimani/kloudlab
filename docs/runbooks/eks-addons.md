# EKS add-on plan

Pulumi manages AWS infrastructure and AWS-managed EKS add-ons. Argo CD manages
Kubernetes platform software from Helm charts. The add-ons below are the
baseline for KloudLab's four clusters; optional integrations are only added
when a workload needs them.

## Required baseline

| Add-on | App | Identity | Observability | Management | Owner and purpose |
| --- | --- | --- | --- | --- | --- |
| Amazon VPC CNI (`vpc-cni`) | Yes | Yes | Yes | Yes | EKS add-on via Pulumi; assigns VPC pod IPs. Cilium chains to it. |
| CoreDNS (`coredns`) | Yes | Yes | Yes | Yes | EKS add-on via Pulumi; cluster DNS. |
| kube-proxy | No after Cilium is healthy | No after Cilium is healthy | No after Cilium is healthy | No after Cilium is healthy | EKS add-on only during management bootstrap; Cilium replaces service routing. |
| EKS Pod Identity Agent (`eks-pod-identity-agent`) | Yes | Yes | Yes | Yes | EKS add-on via Pulumi; lets explicitly associated service accounts receive AWS credentials. |
| EBS CSI (`aws-ebs-csi-driver`) | No for current workloads | No for current workloads | Yes | No for current workloads | EKS add-on via Pulumi; encrypted gp3 PVCs for Prometheus and Loki. |
| gp3 StorageClass | No | No | Yes | No | Local Helm chart through Argo CD; encrypted, expandable EBS volumes. |

VPC CNI and CoreDNS are present in the Pulumi EKS component. Management keeps
kube-proxy only until Argo CD has installed Cilium and Cilium is ready on every
node. The app, identity, and observability clusters are created without
kube-proxy and hold ordinary workloads until Cilium is ready.

## Optional components, installed only when needed

| Component | Install method | When KloudLab needs it |
| --- | --- | --- |
| AWS Load Balancer Controller | Helm via Argo CD; AWS role/Pod Identity association via Pulumi | App cluster, to provision the NLB used by kgateway. |
| Karpenter | Helm via Argo CD; controller role, node role, SQS interruption queue and discovery tags via Pulumi | App cluster, when replacing or extending the baseline managed node group with autoscaled capacity. |
| cert-manager | Helm via Argo CD | When KloudLab automates certificate issuance in Kubernetes. |
| Metrics Server | Helm via Argo CD | Only if HPA or `kubectl top` needs the resource metrics API. OTel and Prometheus do not require it. |
| EFS/FSx/S3 CSI drivers and CSI snapshot controller | EKS add-on or Helm, selected per driver | Only if a workload needs shared file storage, filesystem/object mounts, or CSI volume snapshots. Current architecture does not need them. |

OpenTelemetry Collector, Cilium, kgateway, Argo CD, OpenFGA, Prometheus, Loki,
Tempo, and Grafana are platform software installed with Helm and reconciled by
Argo CD; they are not EKS add-ons. Do not add CloudWatch or ADOT to this stack.

## Verify the already-created management cluster

Run from a machine with the `kloudlab` AWS profile and cluster access:

```sh
export AWS_PROFILE=kloudlab
export AWS_REGION=ap-south-1

aws eks list-addons \
  --cluster-name kloudlab-management \
  --region "$AWS_REGION" \
  --output table

aws eks describe-addon \
  --cluster-name kloudlab-management \
  --addon-name vpc-cni \
  --region "$AWS_REGION" \
  --query 'addon.{name:addonName,status:status,version:addonVersion}'

aws eks describe-addon \
  --cluster-name kloudlab-management \
  --addon-name coredns \
  --region "$AWS_REGION" \
  --query 'addon.{name:addonName,status:status,version:addonVersion}'

kubectl --context kloudlab-management -n kube-system get pods -o wide
```

The Pulumi component currently requests `vpc-cni`, `coredns`, and
`kube-proxy` for management. If AWS lists only `vpc-cni`, compare the active
stack and AWS state before proceeding:

```sh
cd infra/stacks/cluster-management
pulumi stack select dev
pulumi refresh --preview-only
pulumi preview
```

Do not create duplicate add-ons manually; reconcile the Pulumi stack to the
AWS state. Once Cilium is healthy on management, set
`kloudlab-cluster:manageKubeProxy` to `false` and review that the preview only
removes the kube-proxy add-on.

## Install Pod Identity and storage in stages

The nodes are private, so the EKS Auth PrivateLink endpoint must exist in each
cluster VPC before enabling Pod Identity. The network component now creates
`com.amazonaws.<region>.eks-auth` in private subnets. Update each network stack
through Pulumi before enabling the agent:

```sh
for stack in management app identity observability; do
  (
    cd "infra/stacks/network-$stack"
    pulumi stack select dev
    pulumi preview
    pulumi up
  )
done
```

Review each preview for the EKS Auth interface endpoint and its security group.
It adds a billable interface endpoint in each private subnet/AZ. The management
node role already includes `AmazonEKSWorkerNodePolicy`, which supplies the
agent's EKS Auth permission.

First install Cilium and verify every node is ready using the
[Cilium runbook](cilium-multicluster.md). Then enable Pod Identity in each EKS
stack. Run one stack at a time and review every preview:

```sh
for stack in management app identity observability; do
  (
    cd "infra/stacks/cluster-$stack"
    pulumi stack select dev
    pulumi config set kloudlab-cluster:enablePodIdentityAgent true
    if [ "$stack" = management ]; then
      pulumi config set kloudlab-cluster:manageKubeProxy false
    fi
    if [ "$stack" = observability ]; then
      pulumi config set kloudlab-cluster:enableEBSCSIDriver true
    fi
    pulumi preview
    pulumi up
  )
done
```

The app, identity, and observability clusters must already exist before their
commands run. In each preview, check that Pod Identity Agent is added; check
that EBS CSI and its dedicated controller role are added only for observability;
and check that management kube-proxy is removed only after Cilium is healthy.
If Cilium is not yet healthy in management, omit the `manageKubeProxy` change
until it is.

After the observability add-on is `ACTIVE`, sync the Argo application for the
`gp3` StorageClass, then Prometheus and Loki. The StorageClass uses the EBS CSI
provisioner, encryption, `WaitForFirstConsumer`, volume expansion, and a
`Retain` reclaim policy. Each additional AWS workload (for example Karpenter or
AWS Load Balancer Controller) still needs its own narrowly scoped IAM role and
Pod Identity association; installing the agent alone grants no AWS permissions.

Verify the agents and storage driver:

```sh
aws eks list-addons --cluster-name kloudlab-observability --region "$AWS_REGION" --output table
kubectl --context kloudlab-management -n kube-system get ds eks-pod-identity-agent
kubectl --context kloudlab-observability -n kube-system get ds eks-pod-identity-agent
kubectl --context kloudlab-observability -n kube-system get pods | rg 'ebs-csi'
kubectl --context kloudlab-observability get storageclass gp3
```

The EBS CSI controller uses the AWS recommended `AmazonEBSCSIDriverPolicyV2`
through an EKS Pod Identity association for `ebs-csi-controller-sa`.
