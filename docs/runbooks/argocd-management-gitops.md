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
   export AWS_REGION=ap-south-1
   cd infra/stacks/argocd-management
   pulumi stack select dev
   pulumi preview
   pulumi up
   ```

   Initialize the `dev` stack once with the S3 backend and KMS secrets provider if it does not already exist.

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

3. Provision `kloudlab-app`, `kloudlab-identity`, and `kloudlab-observability`
   with Pulumi. The three workload clusters omit kube-proxy and hold normal
   scheduling until their Cilium agents become ready. Register each with
   management Argo CD under its exact destination name. Use a distinct deploy
   identity for each cluster with only the API permissions and namespaces
   required by its reviewed Applications. Do not use a human kubeconfig or a
   cluster-admin credential. Keep credentials in Argo CD's cluster Secret store
   or the approved secret manager; never commit bearer tokens or certificate
   data to Git.

4. Push the root Application, root definitions, cluster Applications, and chart modules to the configured Git revision. After all workload clusters are registered in Argo CD, enable root Application creation through the Pulumi stack:

   ```sh
   cd infra/stacks/argocd-management
   pulumi config set kloudlab-argocd-management:bootstrapRootApplication true
   pulumi preview
   pulumi up
   ```

Pulumi owns the root Application resource; Argo CD owns the child Applications and workload releases. The root reads only `gitops/management/roots/` and creates a cluster-level Application for each cluster. Those Applications load only `**/application.yaml` files from their respective cluster paths, so Helm `values.yaml` files are not treated as Kubernetes manifests. Each cluster-level Application owns that cluster's child Application objects; each child then deploys to its designated cluster. Leave `bootstrapRootApplication` enabled after turning it on so Pulumi continues to track the root resource.

## Verify

```sh
argocd app get kloudlab-root
argocd app get kloudlab-app-applications
argocd app get kloudlab-identity-applications
argocd app get kloudlab-observability-applications
argocd app get kloudlab-management-applications
argocd cluster list
```

Check that each cluster is connected and the corresponding cluster-level Application is healthy before relying on its child Applications. Argo CD deploys Cilium from the management cluster's GitOps Application; keep kube-proxy enabled until Cilium is ready on both nodes and reports `KubeProxyReplacement: True`. Additional applications can be enabled as their infrastructure and prerequisites are ready.
