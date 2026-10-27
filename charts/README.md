# KloudLab Helm chart modules

Each directory here is a versioned Helm module. KloudLab-owned templates live
in the module. Upstream projects stay the source of truth for their templates;
our modules declare an exact upstream chart dependency and carry only KloudLab
defaults. `cert-manager` is the exception: its official chart is kept directly
at `charts/cert-manager` as a standalone chart because cert-manager advises
against embedding it as a dependency of another chart. Cluster-specific
settings stay in `gitops/clusters/<cluster>/` and are passed as values by Argo
CD.

Use Argo CD to own application releases. Bootstrap Argo CD directly with the
Helm CLI from `charts/argocd`; Pulumi owns AWS infrastructure, including the
Argo controller's EKS Pod Identity role. A release must have exactly one
lifecycle owner. Pulumi and Argo CD must not both manage the same Helm release.

Upstream chart versions are pinned in each module's `Chart.yaml`. Run
`helm dependency update charts/<module>` when changing a pin and commit the
resulting `Chart.lock`; dependency archives are build outputs and are not
committed. Argo CD's repo-server and the Pulumi runner need network access to
the upstream Helm repositories or OCI registries when they render or install
these modules. For a future restricted-egress or offline deployment, publish
the modules and dependencies to an internal OCI registry.

Current modules:

- `argocd`: Argo CD bootstrap chart, installed directly with Helm on the
  management cluster.
- `cilium`: Cilium datapath, installed by Argo CD.
- `kgateway/controller` and `kgateway/crds`: kgateway upstream charts.
- `kgateway/gateway-api-crds`: pinned Gateway API standard CRD bundle.
- `kgateway/resources`: KloudLab Gateway API resources.
- `aws-load-balancer-controller`: upstream EKS controller wrapper for Gateway NLBs.
- `cert-manager-resources`: KloudLab Cloudflare DNS-01 issuer and Gateway certificate.
- `openfga`: OpenFGA upstream chart.
- `infisical/{server,secrets-operator}`: Infisical self-hosted server and
  Kubernetes Secrets Operator upstream charts.
- `cert-manager`: standalone copy of the official v1.21.2 chart for later
  platform rollout.
- `external-dns`: pinned module for later platform rollout.
- `observability/{prometheus,grafana,loki,tempo,opentelemetry-collector}`:
  observability upstream charts.
- `observability/storage`: KloudLab encrypted gp3 StorageClass.
- `kloudlab-app`: KloudLab application resources.

`charts/cert-manager/Chart.yaml` and `charts/cert-manager/values.yaml` are the
official chart files from cert-manager v1.21.2. Update this module from the
official Jetstack chart release as a whole, and install it as its own Argo CD
Application and Helm release.
