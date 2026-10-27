# KloudLab repository structure

This is the canonical target layout for the updated four-cluster architecture. Pulumi Go owns AWS resources, GitHub Actions validates and publishes artifacts, and Argo CD is hosted in `kloudlab-management` to reconcile Kubernetes releases across all four clusters, including management workloads. Its initial installation and recovery remain independently bootstrappable. Karpenter belongs only to `kloudlab-app`. Directories for unimplemented features are added with their first working slice; this tree is a reference, not a claim that every listed subsystem exists today.

Argo CD's bootstrap configuration lives under `gitops/bootstrap/argocd`; its workload configuration lives under `gitops/clusters/management/applications/argocd`. OpenFGA's `Application` and values live in the identity cluster path and reference the official chart. `gitops/clusters/identity/platform/infisical` is reserved for a self-hosted Infisical deployment if identity-cluster placement is selected; app-side secret integration belongs under `gitops/clusters/app/platform/infisical`. The shared `gitops/charts/kloudlab-app` chart is for KloudLab-owned templates. OpenFGA uses the selected private Amazon RDS PostgreSQL datastore. The management cluster must have a documented recovery path independent of Argo CD itself.

```text
kloudlab/
├── apps/
│   ├── frontend/
│   │   ├── src/
│   │   ├── public/
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── package.json
│   └── api/
│       ├── cmd/api/main.go
│       ├── internal/
│       │   ├── auth/
│       │   ├── authorization/model.fga
│       │   ├── organizations/
│       │   ├── projects/
│       │   ├── canvas/
│       │   ├── catalog/
│       │   ├── validation/
│       │   ├── infrastructure/
│       │   ├── deployments/
│       │   ├── audit/
│       │   └── observability/
│       ├── migrations/
│       ├── tests/
│       ├── Dockerfile
│       ├── go.mod
│       └── go.sum
│
├── infra/
│   ├── go.mod
│   ├── go.sum
│   ├── components/
│   │   ├── network/
│   │   ├── eks/
│   │   ├── karpenter/          # instantiated only by cluster-app
│   │   ├── iam/
│   │   ├── ecr/
│   │   ├── dns/
│   │   ├── database/
│   │   ├── secrets/
│   │   └── observability/
│   ├── stacks/
│   │   ├── bootstrap/
│   │   ├── network-app/
│   │   ├── network-identity/
│   │   ├── network-observability/
│   │   ├── network-management/
│   │   ├── network-connectivity/
│   │   ├── cluster-app/
│   │   ├── cluster-identity/
│   │   ├── cluster-observability/
│   │   ├── cluster-management/
│   │   ├── database/
│   │   ├── ecr/
│   │   └── shared-dns/
│   └── config/
│
├── gitops/
│   ├── bootstrap/
│   │   └── argocd/
│   │       ├── root-application.yaml
│   │       ├── application.yaml
│   │       ├── values.yaml
│   │       └── roots/
│   │           ├── app.yaml
│   │           ├── identity.yaml
│   │           ├── observability.yaml
│   │           └── management.yaml
│   ├── clusters/
│   │   ├── app/
│   │   │   ├── values/
│   │   │   │   ├── cilium.yaml
│   │   │   │   └── kgateway.yaml
│   │   │   ├── applications/
│   │   │   │   ├── cilium/application.yaml
│   │   │   │   ├── karpenter/
│   │   │   │   │   ├── application.yaml
│   │   │   │   │   ├── values.yaml
│   │   │   │   │   └── resources/
│   │   │   │   │       ├── ec2-node-class.yaml
│   │   │   │   │       └── node-pool.yaml
│   │   │   │   ├── kgateway/
│   │   │   │   │   ├── gateway-api-crds/application.yaml
│   │   │   │   │   ├── kgateway-crds/application.yaml
│   │   │   │   │   ├── kgateway-parameters/application.yaml
│   │   │   │   │   ├── kgateway/application.yaml
│   │   │   │   │   └── kgateway-public-gateway/application.yaml
│   │   │   │   ├── cert-manager/
│   │   │   │   ├── frontend/
│   │   │   │   └── api/
│   │   │   └── platform/
│   │   │       ├── infisical/
│   │   │       └── policies/
│   │   ├── identity/
│   │   │   ├── applications/openfga/
│   │   │   └── platform/
│   │   │       ├── infisical/
│   │   │       └── policies/
│   │   ├── observability/
│   │   │   └── applications/
│   │   │       ├── opentelemetry/
│   │   │       ├── prometheus/
│   │   │       ├── loki/
│   │   │       ├── tempo/
│   │   │       └── grafana/
│   │   └── management/
│   │       └── applications/argocd/
│   └── charts/
│       ├── kloudlab-app/
│       │   ├── Chart.yaml
│       │   ├── values.yaml
│       │   ├── values.schema.json
│       │   └── templates/
│       └── kloudlab-kgateway/
│           ├── Chart.yaml
│           ├── values.yaml
│           └── templates/
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── infrastructure-preview.yml
│       ├── infrastructure-deploy.yml
│       ├── app-build-publish.yml
│       └── gitops-promotion.yml
│
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── security/
│   ├── operations/
│   ├── disaster-recovery/
│   └── runbooks/
│       ├── argocd-management-gitops.md
│       ├── cilium-app-cluster.md
│       └── kgateway-helm-argocd.md
│
├── scripts/
├── .gitignore
├── .editorconfig
├── Makefile
└── README.md
```

## Architecture and migration rules

- The four clusters are `kloudlab-app`, `kloudlab-identity`, `kloudlab-observability`, and `kloudlab-management`, each with a dedicated VPC. The management cluster hosts Argo CD and remains dedicated to management workloads.
- Argo CD has least-privilege access to all four cluster APIs and a bootstrap/recovery procedure that does not depend on the hosted Argo CD instance.
- Karpenter's controller, IAM, queue, Helm release, `NodePool`, and `EC2NodeClass` resources belong only to `kloudlab-app`. The other clusters use managed node groups only.
- Initial managed capacity is a sizing hypothesis of two `t3.medium` nodes per cluster, to be validated against workload demands, burst behavior, subnet capacity, and cost.
- Pulumi owns AWS resources such as EKS, VPCs, ECR, and RDS. Argo CD owns ongoing Kubernetes releases. Never let both systems own the same live object.
- Keep `apps/api/cmd/api` as the executable entry point; move domain and integration code into `apps/api/internal/` packages as those boundaries are implemented.
- Add tests, Dockerfiles, workflows, and platform directories with their first functioning implementation rather than creating empty files.
- Four clusters in one AWS region improve responsibility and lifecycle separation but do not provide regional disaster recovery.
- Migrate existing stacks and workflows only with their references and documentation updated in the same change.
