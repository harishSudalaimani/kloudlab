# Argo CD multi-cluster GitOps flow

Pulumi owns the EKS clusters and AWS infrastructure. Argo CD runs only in `kloudlab-management`; it reconciles Applications targeting the three workload clusters and its own cluster.

## Bring up the GitOps control plane

1. Provision `kloudlab-management`, `kloudlab-app`, `kloudlab-identity`, and `kloudlab-observability` with Pulumi. The management cluster keeps kube-proxy during bootstrap; the three workload clusters omit it and wait for Cilium. Follow the [Cilium multi-cluster runbook](cilium-multicluster.md).
2. Install Argo CD on `kloudlab-management` using the Helm bootstrap procedure while its existing kube-proxy is still enabled. Confirm Argo CD is healthy and the repository is accessible.
3. Register `kloudlab-app`, `kloudlab-identity`, and `kloudlab-observability` with management Argo CD under those exact destination names. Use a distinct deploy identity for each cluster with only the API permissions and namespaces required by its reviewed Applications. Do not use a human kubeconfig or a cluster-admin credential. Keep credentials in Argo CD's cluster Secret store or the approved secret manager; never commit bearer tokens or certificate data to Git.
4. Apply the management root Application once, from the management-cluster context:

   ```sh
   kubectl --context kloudlab-management -n argocd apply -f gitops/bootstrap/argocd/root-application.yaml
   ```

The root Application reads only `gitops/bootstrap/argocd/roots/`. It creates a cluster-level Application for each cluster. Those Applications live in the management Argo CD namespace and load only `**/application.yaml` files from their respective cluster paths, so Helm `values.yaml` files are not treated as Kubernetes manifests. Each cluster-level Application is the owner of that cluster's child Application objects; each child Application then deploys to its designated cluster.

## Verify

```sh
argocd app get kloudlab-root
argocd app get kloudlab-app-applications
argocd app get kloudlab-identity-applications
argocd app get kloudlab-observability-applications
argocd app get kloudlab-management-applications
argocd cluster list
```

Check that each cluster is connected and the corresponding cluster-level Application is healthy before relying on its child Applications. The repository currently has application resources for the app and identity clusters; observability and management workload Applications will appear as those slices are added.
