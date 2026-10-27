# Infisical Helm modules

- `server` is the self-hosted Infisical control plane. Its cluster, database,
  cache, ingress, and persistence settings belong in that cluster's GitOps
  values overlay.
- `secrets-operator` installs Infisical's Kubernetes operator in clusters
  where workloads need secrets synchronized from Infisical. Configure it with
  machine identity authentication and narrowly scoped access.

The upstream chart versions are pinned in each module's `Chart.yaml`. Keep
credentials and secret values out of Git; only non-secret references and
operator configuration belong in cluster overlays.
