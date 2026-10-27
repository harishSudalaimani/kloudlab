# KloudLab repository structure

This is the canonical target layout for future work. Pulumi provisions AWS resources, GitHub Actions validates and publishes artifacts, and Argo CD reconciles Kubernetes releases from Git. Karpenter belongs only to the application cluster. Directories for unimplemented features are added when their first working slice is ready; this tree is a reference, not a claim that every listed subsystem exists today.

The OpenFGA Argo CD `Application` and cluster-specific values are placed under the identity cluster's GitOps application path. Argo CD references the official OpenFGA chart; the shared `gitops/charts/kloudlab` chart is reserved for KloudLab-owned templates. Its RDS database belongs to the Pulumi database stack. The API's current authorization and HTTP handlers are still in the initial `apps/api/cmd/api` implementation and can be separated into `internal/` packages incrementally.

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
│       ├── cmd/
│       │   └── api/
│       │       └── main.go
│       ├── internal/
│       │   ├── auth/
│       │   ├── authorization/
│       │   │   └── model.fga
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
│   │   │   ├── component.go
│   │   │   ├── vpc.go
│   │   │   ├── subnets.go
│   │   │   ├── routing.go
│   │   │   ├── endpoints.go
│   │   │   └── outputs.go
│   │   ├── eks/
│   │   │   ├── component.go
│   │   │   ├── cluster.go
│   │   │   ├── nodegroups.go
│   │   │   ├── access.go
│   │   │   ├── addons.go
│   │   │   └── outputs.go
│   │   ├── karpenter/
│   │   │   ├── component.go
│   │   │   ├── controller_iam.go
│   │   │   ├── node_role.go
│   │   │   ├── interruption_queue.go
│   │   │   ├── discovery.go
│   │   │   └── outputs.go
│   │   ├── iam/
│   │   │   ├── github_oidc.go
│   │   │   ├── workload_identity.go
│   │   │   └── policies.go
│   │   ├── database/
│   │   │   ├── postgres.go
│   │   │   ├── networking.go
│   │   │   ├── backups.go
│   │   │   └── outputs.go
│   │   ├── registry/
│   │   │   ├── ecr.go
│   │   │   ├── lifecycle.go
│   │   │   └── outputs.go
│   │   ├── dns/
│   │   │   ├── route53.go
│   │   │   ├── certificates.go
│   │   │   └── outputs.go
│   │   ├── secrets/
│   │   │   ├── infisical_support.go
│   │   │   ├── encryption.go
│   │   │   └── outputs.go
│   │   └── observability/
│   │       ├── storage.go
│   │       ├── buckets.go
│   │       └── outputs.go
│   │
│   ├── stacks/
│   │   ├── bootstrap/
│   │   │   ├── main.go
│   │   │   └── Pulumi.yaml
│   │   ├── network-app/
│   │   │   ├── main.go
│   │   │   └── Pulumi.yaml
│   │   ├── network-identity/
│   │   │   ├── main.go
│   │   │   └── Pulumi.yaml
│   │   ├── network-observability/
│   │   │   ├── main.go
│   │   │   └── Pulumi.yaml
│   │   ├── cluster-app/
│   │   │   ├── main.go
│   │   │   ├── config.go
│   │   │   └── Pulumi.yaml
│   │   ├── cluster-identity/
│   │   │   ├── main.go
│   │   │   ├── config.go
│   │   │   └── Pulumi.yaml
│   │   ├── cluster-observability/
│   │   │   ├── main.go
│   │   │   ├── config.go
│   │   │   └── Pulumi.yaml
│   │   ├── database/
│   │   │   ├── main.go
│   │   │   └── Pulumi.yaml
│   │   ├── registry/
│   │   │   ├── main.go
│   │   │   └── Pulumi.yaml
│   │   └── shared-dns/
│   │       ├── main.go
│   │       └── Pulumi.yaml
│   │
│   └── config/
│       ├── common.go
│       ├── naming.go
│       ├── tags.go
│       └── validation.go
│
├── gitops/
│   ├── bootstrap/
│   │   ├── argocd/
│   │   │   ├── values.yaml
│   │   │   └── application.yaml
│   ├── clusters/
│   │   ├── app/
│   │   │   ├── applications/
│   │   │   │   ├── karpenter/
│   │   │   │   │   ├── application.yaml
│   │   │   │   │   └── values.yaml
│   │   │   │   ├── kgateway/
│   │   │   │   │   ├── application.yaml
│   │   │   │   │   └── values.yaml
│   │   │   │   ├── frontend/
│   │   │   │   │   └── application.yaml
│   │   │   │   └── api/
│   │   │   │       └── application.yaml
│   │   │   └── platform/
│   │   │       ├── cert-manager/
│   │   │       └── policies/
│   │   ├── identity/
│   │   │   └── applications/
│   │   │       └── openfga/
│   │   │           ├── application.yaml
│   │   │           └── values.yaml
│   │   └── observability/
│   │       └── applications/
│   │           ├── opentelemetry/
│   │           ├── prometheus/
│   │           ├── loki/
│   │           ├── tempo/
│   │           └── grafana/
│   └── charts/
│       └── kloudlab/
│           ├── Chart.yaml
│           ├── values.yaml
│           └── templates/
│
├── .github/
│   └── workflows/
│       ├── ci-frontend.yaml
│       ├── ci-api.yaml
│       ├── pulumi-preview.yaml
│       ├── pulumi-deploy.yaml
│       ├── build-push-ecr.yaml
│       └── security-scan.yaml
│
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── security/
│   ├── operations/
│   └── runbooks/
│
├── scripts/
├── .gitignore
├── .editorconfig
├── Makefile
└── README.md
```

## Migration rules

- Keep `apps/api/cmd/api` as the executable entry point; move domain and integration code into `apps/api/internal/` packages as those boundaries are implemented.
- Keep each Pulumi component small and typed. Add Karpenter code only to the application cluster path and never instantiate it for identity or observability.
- Keep Pulumi ownership for AWS resources such as RDS, ECR, networking, and EKS. Argo CD owns Kubernetes releases. Cluster application directories hold `application.yaml` manifests and their Helm values files.
- Add tests, Dockerfiles, workflows, and platform directories with their first functioning implementation rather than creating empty files.
- Migrate existing stacks and workflows only with their references and documentation updated in the same change.
