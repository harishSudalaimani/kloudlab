# Argo CD management and cluster onboarding

Pulumi provisions the four EKS clusters, AWS resources, and the restricted
Argo application-controller Pod Identity role. Install Argo CD itself directly
with Helm from `charts/argocd`; see
[`argocd-bootstrap-helm.md`](argocd-bootstrap-helm.md).

The repository intentionally has no aggregate root Application. This keeps a
fresh Argo CD installation idle until a cluster is deliberately registered and
its Applications are added. Individual cluster Application definitions remain
under `gitops/clusters/<cluster>/applications/` for reviewed, one-at-a-time
deployment.

For identity onboarding, `gitops/management/bootstrap/identity.yaml` is the
single seed Application. Apply it once after pushing the manifests to `main`.
Argo CD then manages the `kloudlab-identity` AppProject and the identity
Application definitions from Git. Those leaf Applications have manual sync
policies, so their workloads remain stopped until infrastructure prerequisites
are ready and each Application is deliberately synced.

The workload deployer IAM roles trust the management controller role through an
account principal constrained by `aws:PrincipalArn`. This avoids a stale IAM
principal ID if the management controller role is deleted and recreated. If
that role is recreated, update each workload cluster stack so the deployer
trust policies are reconciled before retrying Argo cluster connections.

## Onboard a cluster

For the next cluster only:

1. Confirm its EKS API endpoint is reachable from `kloudlab-management` and its
   dedicated deploy role is provisioned by that cluster's Pulumi stack.
2. Register the cluster in Argo CD using the reviewed restricted IAM
   credentials. Do not use a human kubeconfig or cluster-admin credential.
3. Create or select the matching AppProject from `gitops/management/projects/`.
4. Create only the first required Application from that cluster's
   `applications/` directory. Review its diff before syncing.
5. Confirm health before moving on to the next Application or cluster.

Start with management, then identity, app, and observability. Keep kube-proxy
enabled in every cluster. Do not apply a cluster-wide root that recursively
creates all Applications.

## Verify the current control plane

```sh
kubectl --context kloudlab-management -n argocd get pods
kubectl --context kloudlab-management -n argocd get applications
argocd cluster list
```
