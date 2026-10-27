# Bootstrap Argo CD with Helm

Pulumi owns EKS and AWS infrastructure. It provisions the Argo application
controller's restricted EKS Pod Identity role; it does not install Argo CD or
register workload clusters. Install Argo CD directly from the pinned local
chart and connect clusters afterward, one at a time.

## Prerequisites

- `kloudlab-management` is healthy and accessible through the current AWS
  profile.
- The EKS Pod Identity Agent is running in the management cluster.
- `infra/stacks/argocd-management` has provisioned the application-controller
  role and Pod Identity association with
  `kloudlab-argocd-management:enableCrossClusterAccess=true`.

Update the kubeconfig and confirm the target context:

```sh
export AWS_PROFILE=kloudlab
export AWS_REGION=ap-south-1

aws eks update-kubeconfig \
  --name kloudlab-management \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --alias kloudlab-management

kubectl --context kloudlab-management get nodes
```

The IAM role is AWS infrastructure, so Pulumi may be used to provision it. The
refactored stack also removes its former Argo Helm release and cluster
registration Secrets from Pulumi state. Push the reviewed changes first, then
preview and apply this stack update before installing the chart directly. The
preview should retain the IAM role and Pod Identity association while removing
the old Pulumi-managed Argo release and registration Secrets. It does not
install Argo CD or create Kubernetes Application objects:

```sh
cd ~/Documents/kloudlab/infra/stacks/argocd-management
pulumi stack select dev
pulumi config set kloudlab-argocd-management:enableCrossClusterAccess true
pulumi preview
pulumi up
```

If reusing an existing management cluster, inspect its Argo Applications before
installing the chart. Existing Application CRs can survive an Argo CD uninstall;
remove stale roots before the new controller starts so they cannot reconcile
the old deployment set.

## Install the chart directly

From the repository root, build the pinned dependency and install the local
KloudLab wrapper chart:

```sh
cd ~/Documents/kloudlab
helm dependency build charts/argocd
helm upgrade --install argocd charts/argocd \
  --namespace argocd \
  --create-namespace \
  --values charts/argocd/values.yaml \
  --wait \
  --timeout 10m
```

The Argo CD upstream chart version is pinned in `charts/argocd/Chart.yaml` and
`Chart.lock`. The chart configures the server for HTTP behind the planned
management Gateway. For local access, port-forward the service:

```sh
kubectl --context kloudlab-management -n argocd get pods
kubectl --context kloudlab-management -n argocd port-forward svc/argocd-server 8080:80
```

Open `http://localhost:8080`. Retrieve the initial admin password in another
terminal and change it after first login:

```sh
kubectl --context kloudlab-management -n argocd get secret \
  argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 --decode
echo
```

## Add clusters and applications deliberately

No root Application is installed by the Helm command. Connect only the next
cluster after reviewing its EKS access role and Argo project. Then create or
sync only that cluster's reviewed Applications under
`gitops/clusters/<cluster>/applications/`. The old aggregate root manifests
have been removed so an Argo CD restart cannot activate every cluster at once.

Keep the EKS-managed AWS VPC CNI, CoreDNS, and kube-proxy add-ons enabled. Argo
CD manages the cluster's platform and application workloads; Pulumi manages
the EKS baseline add-ons.
