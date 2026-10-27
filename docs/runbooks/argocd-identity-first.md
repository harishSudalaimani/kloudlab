# Identity cluster GitOps onboarding

This runbook bootstraps Argo CD access to the workload clusters with Pulumi,
then deploys their Kubernetes workloads through Argo CD. Pulumi owns EKS/AWS
infrastructure and cluster registration credentials; Argo CD owns Helm releases
and Kubernetes workload lifecycle. The PostgreSQL database stack is still
pending and must be provisioned before the stateful services are synced.

## Bootstrap the restricted projects through Argo CD

Push the project manifest and bootstrap Application manifest to the configured
`main` branch. Argo CD reads Git at that revision.

In the local Argo CD UI, create one seed Application with these settings. It
installs the restricted bootstrap AppProject first, then an Argo CD Application
that syncs the identity AppProject from Git:

| Setting | Value |
| --- | --- |
| Application name | `kloudlab-project-bootstrap` |
| Project | `default` |
| Repository URL | `https://github.com/harishSudalaimani/kloudlab.git` |
| Revision | `main` |
| Path | `gitops/management/project-bootstrap` |
| Directory recurse | Off |
| Destination cluster | `in-cluster` |
| Destination namespace | `argocd` |
| Sync policy | Automated, self-heal on, prune off |

The seed Application is the one-time trust root created through the Argo CD UI.
It manages the bootstrap and workload AppProjects and the workload-root
Applications under `gitops/management/project-bootstrap/`.

Keep the local port-forward running. Confirm `kloudlab-project-bootstrap` and
its child project Applications are `Synced` and `Healthy`. In **Settings →
Projects**, confirm `kloudlab-bootstrap`, `kloudlab-identity`, `kloudlab-app`,
and `kloudlab-observability` exist.
`kloudlab-bootstrap` can deploy only Argo CD `Application` and `AppProject`
objects into the management cluster's `argocd` namespace. `kloudlab-identity`
can deploy only to the identity cluster's approved namespaces.

## Prepare the Cilium endpoint

The management VPC has private connectivity to the workload VPCs. Argo CD
reaches the identity API through its private endpoint. Retrieve the endpoint
hostname for Cilium's bootstrap configuration:

```sh
AWS_PROFILE=kloudlab aws eks describe-cluster \
  --name kloudlab-identity \
  --region ap-south-1 \
  --query 'cluster.endpoint' \
  --output text
```

Set `cilium.k8sServiceHost` in `gitops/clusters/identity/values/cilium.yaml` to
the endpoint hostname (without `https://`). Commit and push this change before
manually syncing `kloudlab-identity-cilium`. The identity Cilium Application is
manual so it cannot start with the current `auto` value.

The identity project permits only the KloudLab repository and identity-cluster
destinations in `kube-system`, `kloudlab-identity`, and `opentelemetry`. Its
cluster-scoped allowlist includes Cilium and Infisical CRDs and narrowly named
controller roles. The Secrets Operator values restrict reconciliation to the
identity and telemetry namespaces.

## Identity root Application

The existing `kloudlab-project-bootstrap` seed Application also creates
`kloudlab-root` from
`gitops/management/project-bootstrap/identity-root-application.yaml`. That root
creates the identity, app, and observability workload roots. The bootstrap
project Applications also create the three cluster-specific AppProjects.

## Pulumi cluster access and Argo registration

The Argo CD UI only lists registered clusters. Pulumi creates the cluster
credentials as Secrets in the management cluster's `argocd` namespace.

1. In `infra/stacks/argocd-management`, preview and apply with
   `kloudlab-argocd-management:enableCrossClusterAccess=true`. This creates an
   EKS Pod Identity role for the Argo application controller. Its IAM policy can
   assume only the three KloudLab workload deploy roles. The Pod Identity trust
   is restricted to the `argocd-application-controller` service account in the
   `argocd` namespace on `kloudlab-management`.
2. Run `pulumi up` once in each workload stack: `cluster-identity`,
   `cluster-app`, and `cluster-observability`. Each creates one EKS access role,
   access entry, and access-policy association for its own cluster. The role
   trusts only the management Argo role.
3. After all three workload stacks have exported their role, API endpoint, and
   CA data, set `kloudlab-argocd-management:registerWorkloadClusters=true` in
   the Argo CD management stack and run `pulumi up` there again. It creates
   project-scoped Argo cluster Secrets named `cluster-kloudlab-identity`,
   `cluster-kloudlab-app`, and `cluster-kloudlab-observability`.
4. Confirm those names appear in **Settings → Clusters** and show a successful
   connection. The existing Applications use those exact destination names.

Each workload role currently has the AWS `AmazonEKSClusterAdminPolicy` scoped
to its own EKS cluster. Cilium requires cluster-scoped API access, so this lets
Argo manage any resource within that one cluster. Argo's project-scoped cluster
Secrets and AppProjects restrict which Git project can target each cluster, but
they do not reduce the controller's Kubernetes API permissions. Review the
Pulumi preview before applying these grants.

The Argo Helm release is ordered after its Pod Identity association, and the
values add `AWS_REGION` to the controller. This rolls the controller after the
association exists so new pods receive the Pod Identity environment and token
mount.

The root creates `kloudlab-identity-applications`, which reads only
`application.yaml` files under `gitops/clusters/identity/applications`. The
leaf Applications are visible in Argo CD; sync the workloads manually in the
order below.

## Deploy order and prerequisites

1. **Cilium:** after Argo CD reports the identity cluster connected, set the
   EKS API hostname as described above, push the change, and sync
   `kloudlab-identity-cilium`. Verify Cilium is healthy before proceeding.
2. **Database and Redis:** provision the identity PostgreSQL database through
   the planned Pulumi database stack and provide a Redis endpoint. The current
   repository does not yet implement the RDS stack. Keep separate databases and
   users for Infisical and OpenFGA even if they share an RDS instance.
3. **Infisical server:** choose its private HTTPS hostname and provision the
   private endpoint/DNS before syncing it. The identity VPC service address is
   not reachable from other clusters through VPC peering by itself. Securely
   create the initial `infisical-secrets` Kubernetes Secret in
   `kloudlab-identity`, then sync `kloudlab-infisical-server`. It must contain
   `AUTH_SECRET`, `ENCRYPTION_KEY`, `SITE_URL`, `DB_CONNECTION_URI`,
   `DB_ROOT_CERT`, and `REDIS_URL`. `SITE_URL` must match the selected HTTPS
   hostname. Do not put secret values in this repository. Back up the database
   and `ENCRYPTION_KEY` outside the identity cluster.
4. **Secrets Operator:** sync `kloudlab-infisical-secrets-operator`. After the
   Infisical UI is initialized, configure its Kubernetes-auth machine identity
   and commit the non-secret `InfisicalConnection`, `InfisicalAuth`, and
   `InfisicalStaticSecret` resources. The credentials used to bootstrap
   Infisical itself must come from a separate secure bootstrap process.
5. **OpenFGA:** use Infisical to sync `kloudlab-openfga-datastore` with the
   `uri` key and `kloudlab-openfga-auth` with `keys` and `token`; then sync the
   OpenFGA Application. Its chart already disables public ingress and bundled
   databases. A private API-to-OpenFGA endpoint is still required before the app
   cluster can call it.
6. **Telemetry agents:** sync the identity node agent and cluster collector
   after `kloudlab-otel-gateway-client` exists in `opentelemetry` and the
   observability gateway is reachable over the private network.

Do not sync the Infisical server before the bootstrap Secret and external data
services exist. Do not sync OpenFGA before both OpenFGA Secrets exist. These
Applications are intentionally manual until those prerequisites are ready.

The Secrets Operator chart is pinned to `0.11.13`. Infisical's current operator
documentation lists tested Kubernetes versions through 1.33; this repository's
EKS stacks target 1.36. Confirm upstream compatibility for the pinned operator
before syncing it.
