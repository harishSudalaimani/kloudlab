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
- [x] Add separate app, identity, observability, and management VPC stacks with explicit stack outputs; each starts with two AZs.
- [x] Implement six direct VPC peerings, DNS resolution, and private routes in a separate Pulumi stack; deployment and service-level security remain pending.
- [ ] Configure internal endpoints and narrow security rules for API-to-OpenFGA and remote telemetry.
- [ ] Configure management-cluster access to each EKS private API endpoint before cluster registration.
- [ ] Establish DNS ownership and validate domain nameserver configuration before any DNS changes.
- [ ] Review and preview every stack after account, role, CIDR, AZ, and backend config are available; request deployment approval only after review.

**Deliverable:** repeatable, reviewable network infrastructure.

## Phase 3 — EKS and cluster foundations

- [x] Implement four EKS cluster stacks with private worker nodes, IAM roles, managed add-ons, and EC2 managed node groups; stack previews and deployment remain pending. Management is kept management-only.
- [x] Record app-cluster Cilium kube-proxy replacement and add its Argo Helm release; EKS bootstrap, node tainting, and live validation remain pending.
- [x] Set two `t3.medium` managed nodes per cluster as the initial development sizing hypothesis; workload requests, burst credits, pod density, subnet capacity, and cost still need live validation before fixing production capacity.
- [ ] Configure Karpenter only in `kloudlab-app`; keep stable managed baseline nodes for system services and its controller.
- [x] Configure private-subnet multi-AZ node placement, restricted public API endpoints, and EKS managed add-ons in the stack code; cluster and workload identity plus live security validation remain pending.
- [ ] Set resource requests/limits, health probes, disruption budgets, quotas, and pod security controls.
- [ ] Verify VPC CNI pod IP capacity, routes, and security policies.
- [ ] Document cluster access and recovery, including an independent procedure to rebuild the management cluster and restore Argo CD from Git.

**Deliverable:** four documented clusters with tested lifecycle and security boundaries.

See [EKS Pulumi deployment runbook](../runbooks/eks-pulumi-deployment.md) for the ordered manual deployment commands. The four clusters are implemented in code but are not marked deployed until their Pulumi updates complete.

## Phase 4 — GitOps

- [ ] Bootstrap Argo CD in `kloudlab-management` with a single declared owner for its installation.
- [ ] Configure least-privilege Argo CD access to all four clusters, including its management cluster, and define a separately bootstrappable management root.
- [x] Add a management root Application that creates cluster-level Applications for app, identity, observability, and management; cluster registration and least-privilege credentials remain pending.
- [ ] Add reviewed GitOps policies for the managed clusters and management-only recovery documentation.
- [ ] Reconcile Karpenter and its `NodePool`/`EC2NodeClass` resources only in `kloudlab-app`.
- [ ] Restrict sync sources and production promotion.
- [ ] Define health checks, rollback, and drift handling.
- [ ] Verify ownership does not overlap with Pulumi-managed resources.

**Deliverable:** reproducible Kubernetes deployments from Git.

## Phase 5 — Gateway and application foundation

- [x] Add ordered Argo CD applications for Gateway API CRDs, kgateway Helm CRDs/control plane, GatewayParameters, and the app-cluster Envoy Gateway; actual rollout remains pending cluster and AWS prerequisites.
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
- [ ] Reconcile the OpenFGA Helm release from the management-hosted Argo CD into the identity cluster; configure datastore, backups, and verify restore.
- [x] Define workspace ownership and architecture owner/editor/viewer relations in OpenFGA.
- [x] Enforce authorization on every protected architecture API operation and fail closed on OpenFGA errors.
- [ ] Keep deployment approval distinct from architecture editing.

**Deliverable:** multi-user canvas access with tested tenant isolation.

## Phase 7 — Secrets management

- [ ] Choose whether to self-host Infisical in `kloudlab-identity`; document edition, licensing, service persistence, recovery, and bootstrap access.
- [ ] Create narrowly scoped identities and per-workload secret access policies.
- [ ] Integrate app workloads with Infisical using machine identities or another supported authentication method, without committing secret material.
- [ ] Back up configuration and required state outside the normal retrieval failure domain.
- [ ] Exercise restore and break-glass procedures.

**Deliverable:** centrally managed secrets with a tested recovery path.

## Phase 8 — Observability

- [x] Instrument API HTTP, OpenFGA/Auth0 HTTP calls, and PostgreSQL operations with OpenTelemetry traces and metrics; emit JSON stdout request logs for OTLP collection.
- [x] Add OpenFGA OTLP trace and Prometheus metric settings and JSON logs in its Helm values.
- [x] Add per-node and cluster-level OpenTelemetry Collector Helm Applications to all four clusters, plus the central gateway and Prometheus, Loki, Tempo, and Grafana Helm Applications.
- [ ] Generate `go.sum` and compile/format the API with an installed Go toolchain.
- [x] Keep telemetry storage and query backends open source; EKS API-server metrics are scraped by the per-cluster Collector when endpoint access and RBAC allow it.
- [ ] Provision the OTLP gateway's private cross-VPC endpoint and DNS; sync gateway client/server credentials and Grafana credentials through Infisical.
- [ ] Provision S3 buckets and EKS workload identities for Loki and Tempo; install the EBS CSI driver and encrypted `gp3` storage.
- [ ] Reconcile the telemetry Helm Applications in Argo CD after their AWS and secret prerequisites exist.
- [ ] Validate host/kubelet/container/Kubernetes object/event/API-server collection and node log paths against the chosen EKS AMI.
- [ ] Configure the API Helm workload to export OTLP/HTTP to the in-cluster agent with service, environment, and cluster resource attributes.
- [ ] Add service, Kubernetes, control-plane, database, OpenFGA, secret retrieval, ingestion, and deployment dashboards/alerts.
- [ ] Verify log/trace correlation and confirm sensitive values are excluded from telemetry.
- [ ] Add independent AWS-level alarms for observability cluster failures.
- [ ] Forward management-cluster telemetry to the observability cluster.

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
