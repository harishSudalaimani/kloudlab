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

4. Follow the [one-cluster-at-a-time Argo CD rollout](argocd-rollout-sequence.md) to create the project seed from Argo CD's built-in `default` project, then manage roots with `kloudlab-management`. Sync management first, followed by identity, app, and observability. Pulumi remains responsible for AWS/EKS infrastructure, the initial Argo CD installation, and registered cluster credentials; Argo CD manages Kubernetes Applications and releases.

## Verify

```sh
argocd app get kloudlab-root
argocd app get kloudlab-app-applications
argocd app get kloudlab-identity-applications
argocd app get kloudlab-observability-applications
argocd app get kloudlab-management-applications
argocd cluster list
```

Check that each cluster is connected and the corresponding cluster root is healthy before syncing it. Argo CD deploys Cilium from the management cluster's GitOps Application; keep kube-proxy enabled until Cilium is ready on both nodes and reports `KubeProxyReplacement: True`. Additional applications can be enabled as their infrastructure and prerequisites are ready.
