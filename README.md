# KloudLab

KloudLab is a visual workspace for designing cloud-native architectures. Add
components to a canvas, connect their typed ports, validate the design, and
save or export it. The starter canvas maps KloudLab's own platform and delivery
flow.

## Platform

| Cluster | Main workloads |
| --- | --- |
| `kloudlab-management` | Argo CD and platform controllers |
| `kloudlab-app` | Frontend, API, OpenFGA, and Karpenter |
| `kloudlab-observability` | OpenTelemetry, Prometheus, Loki, Tempo, and Grafana |

Pulumi Go manages AWS networking, EKS, IAM, and storage. GitHub Actions checks
the infrastructure code and builds API/frontend images for ECR; the image
workflow commits new tags to GitOps, and Argo CD rolls them out. Cloudflare
provides DNS, cert-manager issues TLS certificates, and Auth0 plus OpenFGA
handle authentication and authorization.

## Run the frontend

Requires Node.js 20.19+ and pnpm 12.14.0.

```sh
cd apps/frontend
cp .env.example .env.local
# Set the Auth0 domain, SPA client ID, and API audience in .env.local
pnpm install --frozen-lockfile
pnpm dev
```

The browser keeps local canvas drafts. Authenticated workspace saves require the
Go API, PostgreSQL, OpenFGA, and Auth0; see the [API setup](apps/api/README.md).
Build the frontend with `pnpm build` from `apps/frontend`.

## Workflows and docs

- [Go CI](.github/workflows/go.yml) formats, lints, and tests the Pulumi Go module.
- [Image publishing](.github/workflows/images.yml) builds API/frontend images,
  publishes them to ECR, and updates GitOps tags.
- [Network preview](.github/workflows/network-preview.yml) manually previews
  the three VPC stacks and optional connectivity changes; it does not apply them.
- [Architecture decisions](docs/architecture/open-decisions.md) · [ADRs](docs/adr/README.md)
- [Infrastructure setup](docs/operations/phase-2-bootstrap.md) · [Runbooks](docs/runbooks/argocd-rollout-sequence.md)
- [Current platform handoff](docs/HANDOFF.md)
