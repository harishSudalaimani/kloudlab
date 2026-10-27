# kgateway on the app cluster

kgateway runs in `kloudlab-app` and is reconciled by Argo CD hosted in `kloudlab-management`. Its control plane and CRD releases use the official kgateway Helm charts. The Gateway API standard CRDs are sourced from the upstream Gateway API release and reconciled by Argo CD because that project publishes the CRDs as release manifests.

## What is installed

Argo CD applies these child applications in sync-wave order:

1. Gateway API standard CRDs `v1.6.1`.
2. kgateway CRDs Helm chart `v2.4.3`.
3. KloudLab `GatewayParameters` for an internet-facing AWS NLB.
4. kgateway controller Helm chart `v2.4.3`, with two replicas and a disruption budget.
5. The `public` Gateway, which causes kgateway to create the Envoy proxy deployment and `LoadBalancer` Service.

The Gateway accepts routes only from namespaces labeled `kloudlab.dev/gateway-access=public`. TLS and hostnames should be added with the domain and certificate configuration; the initial listener is HTTP on port 80.

## Prerequisites

- `kloudlab-app` must be registered as a destination cluster in the management Argo CD instance.
- The app EKS cluster must support the selected kgateway and Gateway API versions. kgateway 2.4 supports Kubernetes 1.32–1.36.
- For the configured NLB annotations, install and grant IAM permissions to AWS Load Balancer Controller in `kloudlab-app`, or deliberately use EKS Auto Mode and its supported NLB settings. The kgateway Service will remain pending until a supported AWS load balancer controller is available.
- The app cluster needs capacity for the two controller replicas and the Envoy proxy.
- Management Argo CD needs repository access to this Git repository and network access to the upstream Gateway API and kgateway chart repositories.

## Bootstrap through management Argo CD

Register the app cluster as `kloudlab-app` in management Argo CD, then apply the management root once after all three workload clusters are registered. Ensure the selected Kubernetes context is the management cluster:

```sh
kubectl config current-context
kubectl --context kloudlab-management -n argocd apply -f gitops/bootstrap/argocd/root-application.yaml
```

The management root creates a cluster-level app root; that root reconciles the child Applications from `gitops/clusters/app/applications/`. The actual kgateway installation and gateway resources are deployed to `kloudlab-app` by those Argo applications.

## Check status

From the management Argo CD context:

```sh
argocd app get kloudlab-root
argocd app get kloudlab-app-applications
argocd app get gateway-api-crds
argocd app get kgateway-crds
argocd app get kgateway-parameters
argocd app get kgateway
argocd app get kgateway-public-gateway
```

From the app-cluster context:

```sh
kubectl get gatewayclass kgateway
kubectl -n kgateway-system get gateway,gatewayparameters,deployments,services
kubectl -n kgateway-system get events --sort-by=.lastTimestamp
```

The Gateway's `status` should report programmed/accepted conditions, and its proxy Service should receive an AWS load balancer hostname. Application routes are added as Gateway API `HTTPRoute` resources in app namespaces after labeling those namespaces for public route attachment.
