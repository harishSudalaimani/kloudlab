# EKS add-on plan

Pulumi manages AWS infrastructure and AWS-managed EKS add-ons. Argo CD manages
Kubernetes platform software from Helm charts. The add-ons below are the
baseline for KloudLab's four clusters; optional integrations are only added
when a workload needs them.

## Required baseline

| Add-on | App | Identity | Observability | Management | Owner and purpose |
| --- | --- | --- | --- | --- | --- |
| Amazon VPC CNI (`vpc-cni`) | Yes | Yes | Yes | Yes | EKS add-on via Pulumi; assigns VPC pod IPs. |
| CoreDNS (`coredns`) | Yes | Yes | Yes | Yes | EKS add-on via Pulumi; cluster DNS. |
| kube-proxy | Yes | Yes | Yes | Yes | EKS add-on via Pulumi; provides Kubernetes Service routing. |
| Metrics Server (`metrics-server`) | Yes | Yes | Yes | Yes | EKS community add-on via Pulumi; serves the resource Metrics API for `kubectl top` and HPA/VPA. |
| EKS Pod Identity Agent (`eks-pod-identity-agent`) | Yes | Yes | Yes | Yes | EKS add-on via Pulumi; lets explicitly associated service accounts receive AWS credentials. |
| EBS CSI (`aws-ebs-csi-driver`) | Yes | Yes | Yes | Yes | EKS add-on via Pulumi with a per-cluster Pod Identity role; provisions EBS volumes only when a PVC requests them. |
| gp3 StorageClass | No | No | Yes | No | Local Helm chart through Argo CD; encrypted, expandable EBS volumes. |

VPC CNI, CoreDNS, and kube-proxy are present in the Pulumi EKS component in all
four clusters. Metrics Server, EKS Pod Identity Agent, and EBS CSI are enabled
in all four cluster Pulumi projects. EBS CSI does not create billable volumes by
itself; the observability cluster currently requests EBS-backed Prometheus and
Alertmanager volumes.

## Optional components, installed only when needed

| Component | Install method | When KloudLab needs it |
| --- | --- | --- |
| AWS Load Balancer Controller | Helm via Argo CD; per-cluster IAM role/Pod Identity association via Pulumi | App cluster for application ingress and management cluster for the Argo CD Gateway NLB. |
| Karpenter | Helm via Argo CD; controller role, node role, SQS interruption queue and discovery tags via Pulumi | App cluster, when replacing or extending the baseline managed node group with autoscaled capacity. |
| cert-manager | Helm via Argo CD | When KloudLab automates certificate issuance in Kubernetes. |
| EFS/FSx/S3 CSI drivers and CSI snapshot controller | EKS add-on or Helm, selected per driver | Only if a workload needs shared file storage, filesystem/object mounts, or CSI volume snapshots. Current architecture does not need them. |

OpenTelemetry Collector, kgateway, Argo CD, OpenFGA, Prometheus, Loki,
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
AWS state. Review previews to confirm kube-proxy remains managed.

## Enable the baseline add-ons in each cluster

Pod Identity requires the nodes to reach the EKS Auth API. The clusters can
reach it through their NAT route or through the EKS Auth interface endpoint
(`com.amazonaws.<region>.eks-auth`) if configured. The endpoint is optional
when NAT egress is available and adds cost when deployed in private subnets.
Each EBS CSI controller receives its own Pod Identity role and association.

Run one cluster stack at a time. These settings enable Metrics Server, the EKS
Pod Identity Agent, and EBS CSI. Keep kube-proxy enabled in every cluster.

```sh
cd infra/stacks/cluster-management
pulumi stack select dev
pulumi config set kloudlab-cluster:enableMetricsServer true
pulumi config set kloudlab-cluster:enablePodIdentityAgent true
pulumi config set kloudlab-cluster:enableEBSCSIDriver true
pulumi preview
pulumi up
```

Repeat the same commands from `infra/stacks/cluster-app`,
`infra/stacks/cluster-identity`, and `infra/stacks/cluster-observability`, one
stack at a time. In each preview, expect Metrics Server, Pod Identity Agent,
EBS CSI, and that cluster's EBS CSI role/association. Keep kube-proxy in the
managed add-on set.

After the observability add-on is `ACTIVE`, sync the Argo application for the
`gp3` StorageClass, then Prometheus and Loki. The StorageClass uses the EBS CSI
provisioner, encryption, `WaitForFirstConsumer`, volume expansion, and a
`Retain` reclaim policy. Each additional AWS workload (for example Karpenter or
AWS Load Balancer Controller) still needs its own narrowly scoped IAM role and
Pod Identity association; installing the agent alone grants no AWS permissions.

Verify the add-ons in each cluster:

```sh
aws eks list-addons --cluster-name kloudlab-management --region "$AWS_REGION" --output table
kubectl --context kloudlab-management -n kube-system get pods | rg 'metrics-server|eks-pod-identity-agent|ebs-csi'
kubectl --context kloudlab-app -n kube-system get pods | rg 'metrics-server|eks-pod-identity-agent|ebs-csi'
kubectl --context kloudlab-identity -n kube-system get pods | rg 'metrics-server|eks-pod-identity-agent|ebs-csi'
kubectl --context kloudlab-observability -n kube-system get pods | rg 'metrics-server|eks-pod-identity-agent|ebs-csi'
kubectl --context kloudlab-observability get storageclass gp3
```

The EBS CSI controller uses the AWS recommended `AmazonEBSCSIDriverPolicyV2`
through an EKS Pod Identity association for `ebs-csi-controller-sa`.
