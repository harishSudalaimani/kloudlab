# Identity cluster GitOps onboarding

This runbook onboards the identity cluster first. It creates the identity
AppProject, then the cluster registration and workload Applications are handled
as separate steps. Do not enable the identity workload root until the cluster is
registered and its Cilium API endpoint value has been checked.

## Bootstrap the identity AppProject through Argo CD

Push the project manifest and bootstrap Application manifest to the configured
`main` branch. Argo CD reads Git at that revision.

In the local Argo CD UI, create an Application with these settings. This
Application only installs the AppProject; it does not install identity
workloads:

| Setting | Value |
| --- | --- |
| Application name | `kloudlab-identity-projects` |
| Project | `default` |
| Repository URL | `https://github.com/harishSudalaimani/kloudlab.git` |
| Revision | `main` |
| Path | `gitops/management/projects` |
| Directory recurse | Off |
| Directory include | `identity.yaml` |
| Destination cluster | `in-cluster` |
| Destination namespace | `argocd` |
| Sync policy | Automated, self-heal on, prune off |

The matching manifest is [identity-project.yaml](../../gitops/management/project-bootstrap/identity-project.yaml).

Keep the local port-forward running. Confirm the `kloudlab-identity-projects`
Application is `Synced` and `Healthy`; then, in **Settings → Projects**, confirm
`kloudlab-identity` exists. The bootstrap Application stays in the existing
`default` project and reads only the identity project manifest from Git.

## Before registering and deploying the identity cluster

The expected Argo CD destination name is `kloudlab-identity`. Registering a
local kubeconfig context alone does not register the cluster with Argo CD. The
Argo CD application controller needs AWS workload credentials and an EKS access
entry for a restricted deploy role. Do not use `argocd cluster add` with the
default manager role for this setup; it grants broad cluster-admin access.

The management VPC has private connectivity to the workload VPCs. Use the
identity cluster's private EKS API endpoint for Argo CD. Retrieve the endpoint
hostname when preparing the Cilium values:

```sh
AWS_PROFILE=kloudlab aws eks describe-cluster \
  --name kloudlab-identity \
  --region ap-south-1 \
  --query 'cluster.endpoint' \
  --output text
```

Set `k8sServiceHost` in `gitops/clusters/identity/values/cilium.yaml` to that
endpoint hostname (without `https://`) before enabling the identity workload
Applications. The current value is `auto`; the EKS clusters do not provide the
`kube-public/cluster-info` ConfigMap that Cilium's automatic discovery relies
on in this configuration.

The identity project currently permits only the KloudLab Git repository,
`kloudlab-identity` destinations in `kube-system`, `kloudlab-identity`, and
`opentelemetry`, plus the Argo CD namespace needed for its root Application.
Cluster-scoped permissions are limited to namespaces, CRDs, and cluster RBAC.
The allowlists are based on the configured Cilium, OpenFGA, and OpenTelemetry
Collector workloads. Their upstream Helm dependencies are not present in the
local chart cache, so render those pinned dependencies and review the resource
inventory before enabling the workload Applications.

After the project is confirmed, the next onboarding step is the identity EKS
access entry and restricted Argo CD cluster credential. Once Argo CD reports the
cluster connected and the Cilium endpoint is set, enable the identity root
Application. Its Applications deploy Cilium first, then OpenFGA and the
OpenTelemetry cluster collector and node agent.
