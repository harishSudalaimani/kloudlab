# Argo CD rollout, one cluster at a time

Bootstrap Argo CD directly with Helm on `kloudlab-management` using
[`argocd-bootstrap-helm.md`](argocd-bootstrap-helm.md). There is no Pulumi
Helm release and no aggregate root Application. This keeps the new Argo
control plane idle until each cluster and Application is intentionally added.

For each cluster, complete these steps before moving to the next:

1. Confirm its EKS cluster and dedicated Argo deploy role are healthy.
2. Register only that cluster in Argo CD with restricted IAM credentials.
3. Create its AppProject from `gitops/management/projects/`.
4. Create one Application from the cluster's `gitops/clusters/<name>/applications/`
   directory, review its diff, and sync it when prerequisites are ready.
5. Verify health before adding the next Application.

Use this order:

1. **Management:** Cilium first, then management platform services as needed.
2. **Identity:** Cilium, data services and Infisical prerequisites, Infisical,
   OpenFGA, and telemetry agents.
3. **App:** Cilium, kgateway and its prerequisites, application workloads, and
   telemetry agents.
4. **Observability:** Cilium, storage, Prometheus/Loki/Tempo/Grafana, and
   telemetry agents.

Keep kube-proxy enabled in a cluster until its Cilium installation is healthy
on every node. Review each Application's values and prerequisites before
creating it; do not create a recursive root that activates every component in
that cluster at once.
