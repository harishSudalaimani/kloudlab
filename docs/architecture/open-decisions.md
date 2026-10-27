# Open decisions and assumptions

These items need evidence or an explicit decision before the related infrastructure is provisioned. Proposed CIDRs and service names are not proof that they are available or compatible.

## Open decisions

| Decision | Current assumption | Needed before |
| --- | --- | --- |
| AWS account and access | Account is unknown. An exact-branch GitHub OIDC role component exists; the account provider, repository, branch, and reviewed policy still need configuration. | IAM stack preview |
| Pulumi state backend | S3 DIY backend with versioning, TLS-only access, public-access blocking, KMS encryption, and protected resources is implemented. Bucket creation, local-state migration, access policy, and restore exercise remain operator work. | Bootstrap approval |
| Network CIDRs | Proposed `10.10.0.0/16` (app), `10.20.0.0/16` (identity), `10.30.0.0/16` (observability), and `10.40.0.0/16` (management); stack validation checks configured ranges, but overlap with connected networks is unverified. | Network preview |
| VPC connectivity | Direct same-account, same-region VPC peering and private routes are implemented. Transit Gateway or PrivateLink may be preferable as connectivity grows. Peering routes are non-transitive and do not allow traffic by themselves. | Connectivity preview |
| NAT and VPC endpoints | Development uses one shared NAT gateway per VPC; production validation requires one per AZ. S3 gateway endpoint is implemented; additional endpoints depend on egress and cost review. | Network preview |
| DNS provider | Route 53 is proposed; registrar, hosted zone ownership, and current nameservers are unknown. | DNS changes |
| Domain and certificates | `kloudlab.in` and proposed subdomains are unverified; ACM validation and TLS termination choice are open. | Gateway implementation |
| OpenFGA database configuration | Amazon RDS PostgreSQL is selected by the master specification. Instance sizing, Multi-AZ choice, encryption key, backup retention, and credential bootstrap through Infisical remain to be configured. | Identity database stack |
| EKS/Kubernetes versions | Select supported versions and compatible add-on/Gateway API versions when implementation starts. | Cluster implementation |
| App-cluster service networking | Cilium `1.20.4` Helm release is configured for eBPF kube-proxy replacement with AWS VPC CNI chaining. Confirm EKS/Kubernetes/kernel compatibility and support model; app EKS bootstrap must omit kube-proxy and install VPC CNI/CoreDNS explicitly. | App EKS creation |
| kgateway integration | Argo-managed baseline pins kgateway `v2.4.3` and Gateway API `v1.6.1`; the app EKS Kubernetes version must be confirmed compatible. Select AWS Load Balancer Controller with its IAM setup or EKS Auto Mode, and keep NLB ownership unambiguous. | App-cluster deployment and public endpoint |
| Argo CD control plane | Hosting is decided: dedicated `kloudlab-management` cluster. Management root and four cluster-level Applications are defined. Select the release version, bootstrap and independent recovery procedure, and configure restricted per-cluster credentials. Ensure the version supports multi-source Helm values (2.6 or newer). | GitOps bootstrap |
| Auth0 tenant settings | Tenant, issuer, audience, callback URLs, and token profile have not been configured. | Authentication implementation |
| OpenFGA model | Initial relations and deployment permissions need a versioned model and tenant isolation review. | Authorization implementation |
| OpenFGA private endpoint | Use a private authenticated endpoint from the app VPC to OpenFGA in the identity VPC; `fga.internal.kloudlab.in` is proposed. Select routing, TLS termination, and private DNS behavior before deployment. | Cross-cluster connectivity |
| Infisical hosting and edition | Self-hosting is preferred; co-locating its workload in `kloudlab-identity` is an option, not yet selected. Any placement must keep bootstrap credentials, backups, and restore capability independent of an identity-cluster outage. Verify license, supported authentication, persistence, and required features. | Secrets implementation |
| Observability sizing | Retention, ingestion, S3 lifecycle, encryption, and expected telemetry volume are not estimated. | Observability implementation |
| Cost and capacity | Initial hypothesis: two `t3.medium` managed nodes per cluster; this is not a production guarantee. Validate burst credits, workload demand, observability ingestion, subnet capacity, Karpenter limits, and AWS budget. | Before cluster preview is approved |
| Frontend/API persistence | React Flow and Go/PostgreSQL are proposed; API schemas, migration strategy, and application database ownership remain open. | Application implementation |
| Dependency licenses | Verify each dependency's license, source-availability status, maintenance, and security posture. Auth0, EKS, and private RDS are the selected managed services; document any additional commercial dependency before adoption. | Dependency adoption |

## Assumptions for the initial foundation

- `ap-south-1` is the target AWS region, subject to account and service availability.
- The four EKS clusters are separate control planes in one region. This improves lifecycle separation but does not provide regional disaster recovery.
- The management cluster hosts Argo CD, which reconciles workloads across all four clusters; management stays dedicated and has a recovery path independent of Argo CD.
- Karpenter is limited to `kloudlab-app`; identity, observability, and management use EC2 managed node groups only.
- Worker nodes should be private by default. Public subnets are reserved for explicitly required public load balancers.
- Auth0 authenticates users; the Go API validates its tokens. OpenFGA makes resource relationship decisions. Email is not a stable principal ID.
- Editing and deploying are separate capabilities. A generated plan is untrusted until validated, previewed, and approved.
- Pulumi manages cloud infrastructure. Argo CD manages ongoing Kubernetes application releases. Ownership must not overlap.
- No cloud resources have been provisioned by this repository foundation or Phase 2 implementation.

## Dependency review record

The initial module pins the Pulumi Go SDK at `v3.272.0`, using the Go module path documented by Pulumi. The upstream Pulumi repository license is Apache-2.0. Gateway dependencies are selected and pinned in GitOps (`kgateway` 2.4.3, Gateway API 1.6.1, and Cilium 1.20.4), but are not installed in a cluster. Other controllers, operators, collectors, and storage integrations still need upstream source, exact version, license, maintenance, and compatibility evidence recorded in the relevant ADR or dependency inventory. Generate and commit `infra/go.sum` when Go is available in the development environment.

Upstream references used for the foundation:

- [Pulumi Go language and module documentation](https://www.pulumi.com/docs/iac/languages-sdks/go/)
- [Pulumi component resource guidance](https://www.pulumi.com/docs/iac/guides/building-extending/components/build-a-component/)
- [Pulumi v3.272.0 release](https://github.com/pulumi/pulumi/releases/tag/v3.272.0)
- [Pulumi repository license](https://github.com/pulumi/pulumi/blob/master/LICENSE)
- [Go release history](https://go.dev/doc/devel/release)
- [GitHub Actions checkout releases](https://github.com/actions/checkout/releases)
- [GitHub Actions setup-go releases](https://github.com/actions/setup-go/releases)
- [golangci-lint releases](https://github.com/golangci/golangci-lint/releases)
