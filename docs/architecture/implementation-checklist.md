# Phased implementation checklist

Each phase should end with a reviewable artifact and validation evidence. Cloud provisioning is a separate approval step; this checklist does not authorize AWS changes.

## Phase 1 — Architecture and repository foundation

- [x] Inspect the repository and available local tooling.
- [x] Record system boundaries and a proposed repository tree.
- [x] Record the six initial architecture decisions and open assumptions.
- [x] Add an initial Pulumi Go module and typed reusable component contracts.
- [x] Establish shared region, naming, environment, and tag conventions.
- [x] Define versioned canvas and catalog component JSON schemas.
- [x] Add CI for Go formatting, linting, and tests.
- [ ] Run the checks with an installed Go toolchain and commit the generated dependency checksums (`go.sum`).
- [ ] Review the architecture records and resolve decisions that block the first infrastructure change.

**Deliverable:** reviewed architecture documents and a repository foundation with CI. Phase 2 adds resource stacks; none have been applied to AWS.

## Phase 2 — AWS bootstrap and networking

- [x] Implement the protected, versioned S3/KMS Pulumi backend; document bootstrap, access, migration, and recovery. Provision and restore-test it after deployment approval.
- [x] Implement exact-branch GitHub OIDC trust and a required reviewed deployment permissions policy. Configure account/repo/branch/policy and provision after approval.
- [ ] Check proposed CIDRs against all connected VPC, VPN, and on-premises ranges.
- [x] Implement reusable VPC, subnet, route, endpoint, and explicit security-group rule components.
- [x] Add separate app, identity, and observability network stacks, connectivity stack, and explicit stack outputs.
- [ ] Establish DNS ownership and validate domain nameserver configuration before any DNS changes.
- [ ] Review and preview every stack after account, role, CIDR, AZ, and backend config are available; request deployment approval only after review.

**Deliverable:** repeatable, reviewable network infrastructure.

## Phase 3 — EKS and cluster foundations

- [ ] Implement three EKS clusters with private worker nodes and EC2 managed node groups.
- [ ] Select instance types and scaling limits from workload sizing.
- [ ] Configure multi-AZ placement, cluster API restrictions, EKS workload identity, and add-ons.
- [ ] Set resource requests/limits, health probes, disruption budgets, quotas, and pod security controls.
- [ ] Verify VPC CNI pod IP capacity, routes, and security policies.
- [ ] Document cluster access and recovery.

**Deliverable:** three documented clusters with tested lifecycle and security boundaries.

## Phase 4 — GitOps

- [ ] Bootstrap Argo CD with a single declared owner for its installation.
- [ ] Add separate reviewed GitOps roots for each cluster.
- [ ] Restrict sync sources and production promotion.
- [ ] Define health checks, rollback, and drift handling.
- [ ] Verify ownership does not overlap with Pulumi-managed resources.

**Deliverable:** reproducible Kubernetes deployments from Git.

## Phase 5 — Gateway and application foundation

- [ ] Verify supported kgateway, Gateway API, and AWS load balancer integration versions.
- [ ] Configure TLS, DNS, timeouts, request limits, security headers, and health checks.
- [x] Build the React/TypeScript React Flow editor with a component catalog, editable canvas, local validation, undo/redo, and browser-local drafts.
- [x] Build the Go API and PostgreSQL persistence for versioned canvas documents.
- [x] Implement browser-side config and connection checks against the v1 canvas and component contracts.
- [x] Add JSON import/export and a browser-local architecture library.

**Deliverable:** website with a functional, saved architecture canvas.

## Phase 6 — Authentication and authorization

- [x] Add Auth0 Authorization Code with PKCE to the frontend; tenant setup remains deployment configuration.
- [x] Validate access token signature, issuer, audience, expiry, and required claims in the API.
- [x] Add a Helm chart wrapper for private OpenFGA using the official chart; its PostgreSQL dependency is external.
- [x] Authenticate API-to-OpenFGA calls with a pre-shared bearer token.
- [ ] Implement the private RDS PostgreSQL identity database stack in Pulumi and configure Infisical credential delivery.
- [ ] Configure `fga.internal.kloudlab.in` (or approved equivalent), private cross-cluster routing, and TLS between the app and identity clusters.
- [ ] Reconcile the OpenFGA Helm release through Argo CD in the identity cluster; configure datastore, backups, and verify restore.
- [x] Define workspace ownership and architecture owner/editor/viewer relations in OpenFGA.
- [x] Enforce authorization on every protected architecture API operation and fail closed on OpenFGA errors.
- [ ] Keep deployment approval distinct from architecture editing.

**Deliverable:** multi-user canvas access with tested tenant isolation.

## Phase 7 — Secrets management

- [ ] Choose and document Infisical hosting, edition, licensing, recovery, and bootstrap access.
- [ ] Create narrowly scoped identities and per-workload secret access policies.
- [ ] Integrate Kubernetes workloads without committing secret material.
- [ ] Back up configuration and required state outside the normal retrieval failure domain.
- [ ] Exercise restore and break-glass procedures.

**Deliverable:** centrally managed secrets with a tested recovery path.

## Phase 8 — Observability

- [ ] Instrument the Go API with OpenTelemetry.
- [ ] Deploy authenticated, encrypted collectors in each cluster and a central gateway.
- [ ] Deploy Prometheus, Loki, Tempo, and restricted Grafana.
- [ ] Configure S3 storage, encryption, retention, and lifecycle policies where supported.
- [ ] Add service, Kubernetes, database, OpenFGA, secret retrieval, ingestion, and deployment dashboards/alerts.
- [ ] Add independent AWS-level alarms for observability cluster failures.
- [ ] Verify sensitive values are excluded from telemetry.

**Deliverable:** correlated telemetry with documented retention and alerts.

## Phase 9 — Architecture generation

- [ ] Implement and version canvas component schemas and validators.
- [ ] Generate a structured infrastructure plan from valid canvases.
- [ ] Add Pulumi Go generation incrementally with deterministic output.
- [ ] Show reviewable plans and previews before provisioning.
- [ ] Separate generation, approval, and execution permissions.

**Deliverable:** validated canvases that produce reviewable infrastructure plans.

## Phase 10 — Deployment and production readiness

- [ ] Add explicit approval gates, quotas, budgets, audit trails, and rollback.
- [ ] Test authorization failures, outages, backup/restore, and recovery.
- [ ] Complete security, dependency/image scanning, and load testing.
- [ ] Publish operator runbooks and incident procedures.
- [ ] Review production readiness and obtain explicit deployment approval.

**Deliverable:** controlled path from architecture design to approved deployment.
