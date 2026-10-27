# KloudLab

KloudLab is an architecture design platform in its infrastructure foundation phase. The product is intended to let users compose, validate, save, and later generate cloud-native architectures. The React frontend now provides a local architecture editor with browser drafts and JSON import/export. Phase 2 contains Pulumi implementations for protected state bootstrap, GitHub OIDC trust, and three VPCs with private connectivity. The infrastructure code is not deployed and no AWS resources have been provisioned.

## Repository layout

```text
.
├── apps/
│   ├── frontend/                 # React + TypeScript architecture editor
│   └── api/                      # Go API, Auth0 validation, PostgreSQL, OpenFGA checks
├── infra/
│   ├── go.mod                    # Shared Pulumi Go module
│   ├── components/               # Reusable AWS resources and component contracts
│   │   ├── database/
│   │   ├── dns/
│   │   ├── eks/
│   │   ├── iam/
│   │   ├── network/
│   │   ├── observability/
│   │   └── secrets/
│   ├── config/                   # Naming, tags, and common configuration
│   └── stacks/                   # State, OIDC, and independent network Pulumi projects
├── gitops/
│   ├── bootstrap/                # Argo CD bootstrap configuration (planned)
│   ├── clusters/{app,identity,observability}/
│   └── applications/
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── operations/               # Phase 2 bootstrap and recovery runbook
│   └── security/
└── .github/workflows/            # Go CI and network preview
```

The app, identity, and observability network stacks are configured with proposed CIDRs. Review connected networks and account settings before preview. VPC peering creates routes only; service security rules and workload traffic will be designed alongside EKS and its consumers.

## Architecture decisions and plan

- [System boundaries and proposed repository tree](docs/architecture/system-boundaries.md)
- [Phased implementation checklist](docs/architecture/implementation-checklist.md)
- [Open decisions and assumptions](docs/architecture/open-decisions.md)
- [Architecture decision records](docs/adr/README.md)
- [Canvas document schema v1](docs/architecture/canvas-v1.schema.json)
- [Catalog component schema v1](docs/architecture/catalog-component-v1.schema.json)

The `infra/config` package validates project/environment/region labels, CIDR overlap, resource prefixes, and standard tags without allowing custom tags to replace ownership keys.

## Frontend

The editor is in `apps/frontend`. It includes a component catalog, drag-and-drop canvas, typed connections, configuration inspector, browser-side validation, undo/redo, Auth0 sign-in, and versioned JSON import/export. Canvas drafts are stored in browser storage per Auth0 subject. Saving is enabled after validation errors are resolved. Explicit save, create, open, and delete operations go through the Go API and OpenFGA. The backend validates access tokens and checks resource permissions on each operation.

KloudLab's canvas is built with the open-source React Flow library. The design approach treats architectures as components connected by explicit relationships, drawing inspiration from [Meshery's design model](https://docs.meshery.io/concepts/logical/designs/). Cloud infrastructure and Kubernetes are hosting options; the catalog marks hosting platforms separately from open-source components. Auth0 remains the project's existing managed identity integration.

```sh
cp apps/frontend/.env.example apps/frontend/.env.local
cd apps/frontend
pnpm install --frozen-lockfile
pnpm dev
```

Set the Auth0 domain, SPA client ID, and API audience in `apps/frontend/.env.local`. Start PostgreSQL, OpenFGA with `apps/api/openfga/model.fga`, and the API using the environment documented in `apps/api/README.md`, including `OPENFGA_API_TOKEN`; Vite proxies `/api` to `localhost:8080`. The API requires Go 1.26. Use **Export** to keep a portable JSON copy. Build the frontend with `pnpm build`.

## Infrastructure module

The Pulumi Go module is in `infra/`; the AWS provider is pinned in `infra/go.mod`. Phase 2 stacks are implemented but require AWS account access, state bucket configuration, a reviewed OIDC permissions policy, CIDR confirmation, and stack previews before deployment.

Use Go 1.26 or newer and the Pulumi CLI. CI runs formatting, linting, and Go tests. No local Go toolchain is available in the current environment, so those checks have not been run for the Phase 2 code. See the [Phase 2 bootstrap and network runbook](docs/operations/phase-2-bootstrap.md) before setting up AWS state or credentials.

The [network preview workflow](.github/workflows/network-preview.yml) runs only when manually dispatched from `main` and assumes a branch-restricted GitHub OIDC role. It previews the three network stacks and connectivity stack; it has no `up` command. Configure the AWS role and Pulumi S3 backend variables only after reviewing the account policy. Do not run `pulumi up` until a stack preview is reviewed and deployment is explicitly approved.

## Technology and licensing notes

React, TypeScript, Go, Pulumi Go SDK, Kubernetes, and the planned open-source components are subject to dependency, license, maintenance, and compatibility review before their use is promoted beyond these proposed contracts. Auth0 is an explicitly selected managed authentication exception. See [open decisions](docs/architecture/open-decisions.md).
