# Argo CD multi-cluster GitOps flow

Pulumi owns the EKS clusters and AWS infrastructure. Argo CD runs only in `kloudlab-management`; it reconciles Applications targeting the three workload clusters and its own cluster.

## Bring up the GitOps control plane

1. Confirm the management cluster has kube-proxy while Argo CD is bootstrapped:

   ```sh
   kubectl --context kloudlab-management -n kube-system get ds kube-proxy
   ```

2. Install Argo CD from the Argo Helm chart using the dedicated Pulumi stack,
   referenced through `charts/argocd`; its upstream chart version is pinned in
   `charts/argocd/Chart.yaml`. The stack uses the
   local kubeconfig context `kloudlab-management`; the kubeconfig's AWS exec
   plugin uses the selected `AWS_PROFILE` to authenticate. Do not also install
   this Helm release manually.

   ```sh
   export AWS_PROFILE=kloudlab
   cd infra/stacks/argocd-management
   pulumi stack init dev --secrets-provider='awskms://alias/kloudlab-pulumi-state?region=ap-south-1'
   pulumi preview
   pulumi up
   ```

   Verify it is ready and access the UI locally:

   ```sh
   kubectl --context kloudlab-management -n argocd get pods
   kubectl --context kloudlab-management -n argocd port-forward svc/argocd-server 8080:443
   ```

   Open `https://localhost:8080`. Retrieve the one-time bootstrap password in
   another terminal:

   ```sh
   kubectl --context kloudlab-management -n argocd get secret \
     argocd-initial-admin-secret \
     -o jsonpath='{.data.password}' | base64 --decode
   echo
   ```

   Change it after the first login; do not commit or share it.

3. The management Cilium Application loads its Helm values from the repository's
   `main` branch. Push the Cilium Application and values to that branch before
   syncing. Until the other clusters exist and are registered, apply only the
   management Cilium Application:

   ```sh
   kubectl --context kloudlab-management apply \
     -f gitops/clusters/management/applications/cilium/application.yaml
   ```

   Wait for `kloudlab-management-cilium` to sync and become healthy. Verify
   Cilium is ready on both management nodes and reports
   `KubeProxyReplacement: True` using the [Cilium multi-cluster runbook](cilium-multicluster.md).
   Keep kube-proxy enabled until those checks pass.

4. Provision `kloudlab-app`, `kloudlab-identity`, and `kloudlab-observability`
   with Pulumi. The three workload clusters omit kube-proxy and hold normal
   scheduling until their Cilium agents become ready. Register each with
   management Argo CD under its exact destination name. Use a distinct deploy
   identity for each cluster with only the API permissions and namespaces
   required by its reviewed Applications. Do not use a human kubeconfig or a
   cluster-admin credential. Keep credentials in Argo CD's cluster Secret store
   or the approved secret manager; never commit bearer tokens or certificate
   data to Git.

5. After all workload clusters are registered, apply the management root Application once, from the management-cluster context. Pulumi installs Argo CD; this root Application configures which cluster Applications that Argo CD reconciles:

   ```sh
   kubectl --context kloudlab-management -n argocd apply -f gitops/management/root-application.yaml
   ```

The root Application reads only `gitops/management/roots/`. It creates a cluster-level Application for each cluster. Those Applications live in the management Argo CD namespace and load only `**/application.yaml` files from their respective cluster paths, so Helm `values.yaml` files are not treated as Kubernetes manifests. Each cluster-level Application is the owner of that cluster's child Application objects; each child Application then deploys to its designated cluster. Do not apply this multi-cluster root until all three workload clusters are registered.

## Verify

```sh
argocd app get kloudlab-root
argocd app get kloudlab-app-applications
argocd app get kloudlab-identity-applications
argocd app get kloudlab-observability-applications
argocd app get kloudlab-management-applications
argocd cluster list
```

Check that each cluster is connected and the corresponding cluster-level Application is healthy before relying on its child Applications. Cilium is the first management and workload-cluster application; additional applications can be enabled as their infrastructure and prerequisites are ready.
