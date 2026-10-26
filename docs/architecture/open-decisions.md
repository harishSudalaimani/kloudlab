# Open decisions and assumptions

These items need evidence or an explicit decision before the related infrastructure is provisioned. Proposed CIDRs and service names are not proof that they are available or compatible.

## Open decisions

| Decision | Current assumption | Needed before |
| --- | --- | --- |
| AWS account and access | Account is unknown. An exact-branch GitHub OIDC role component exists; the account provider, repository, branch, and reviewed policy still need configuration. | IAM stack preview |
| Pulumi state backend | S3 DIY backend with versioning, TLS-only access, public-access blocking, KMS encryption, and protected resources is implemented. Bucket creation, local-state migration, access policy, and restore exercise remain operator work. | Bootstrap approval |
| Network CIDRs | Proposed `10.10.0.0/16`, `10.20.0.0/16`, and `10.30.0.0/16`; stack validation checks configured ranges, but overlap with connected networks is unverified. | Network preview |
| VPC connectivity | Direct same-account, same-region VPC peering and private routes are implemented. Transit Gateway or PrivateLink may be preferable as connectivity grows. Peering routes are non-transitive and do not allow traffic by themselves. | Connectivity preview |
| NAT and VPC endpoints | Development uses one shared NAT gateway per VPC; production validation requires one per AZ. S3 gateway endpoint is implemented; additional endpoints depend on egress and cost review. | Network preview |
| DNS provider | Route 53 is proposed; registrar, hosted zone ownership, and current nameservers are unknown. | DNS changes |
| Domain and certificates | `kloudlab.in` and proposed subdomains are unverified; ACM validation and TLS termination choice are open. | Gateway implementation |
| Database placement | OpenFGA requires durable private PostgreSQL; application database placement and sizing are undecided. | Database implementation |
| EKS/Kubernetes versions | Select supported versions and compatible add-on/Gateway API versions when implementation starts. | Cluster implementation |
| kgateway integration | Verify kgateway release, Gateway API version, AWS load balancer controller design, and single ownership of each load balancer. | Gateway implementation |
| Auth0 tenant settings | Tenant, issuer, audience, callback URLs, and token profile have not been configured. | Authentication implementation |
| OpenFGA model | Initial relations and deployment permissions need a versioned model and tenant isolation review. | Authorization implementation |
| Infisical hosting and edition | Must remain independent of the identity cluster recovery boundary. Hosting mode, license, feature availability, backup target, and bootstrap path remain open. | Secrets implementation |
| Observability sizing | Retention, ingestion, S3 lifecycle, encryption, and expected telemetry volume are not estimated. | Observability implementation |
| Cost and capacity | No workload sizing, AWS budget, or per-cluster instance type is selected. Avoid large defaults. | Before any preview is approved |
| Frontend/API persistence | React Flow and Go/PostgreSQL are proposed; API schemas, migration strategy, and application database ownership remain open. | Application implementation |
| Dependency licenses | Verify each dependency's license, source-availability status, maintenance, and security posture. Auth0 is the explicit managed exception; other commercial services need documented approval. | Dependency adoption |

## Assumptions for the initial foundation

- `ap-south-1` is the target AWS region, subject to account and service availability.
- The three EKS clusters are separate control planes in one region. This improves lifecycle separation but does not provide regional disaster recovery.
- Worker nodes should be private by default. Public subnets are reserved for explicitly required public load balancers.
- Auth0 authenticates users; the Go API validates its tokens. OpenFGA makes resource relationship decisions. Email is not a stable principal ID.
- Editing and deploying are separate capabilities. A generated plan is untrusted until validated, previewed, and approved.
- Pulumi manages cloud infrastructure. Argo CD manages ongoing Kubernetes application releases. Ownership must not overlap.
- No cloud resources have been provisioned by this repository foundation or Phase 2 implementation.

## Dependency review record

The initial module pins the Pulumi Go SDK at `v3.272.0`, using the Go module path documented by Pulumi. The upstream Pulumi repository license is Apache-2.0. The frontend, gateway, controllers, operators, collectors, and storage integrations are not installed or selected here. Before adoption, record each dependency's upstream source, exact version, license, maintenance status, and compatibility evidence in the relevant ADR or dependency inventory. Generate and commit `infra/go.sum` when Go is available in the development environment.

Upstream references used for the foundation:

- [Pulumi Go language and module documentation](https://www.pulumi.com/docs/iac/languages-sdks/go/)
- [Pulumi component resource guidance](https://www.pulumi.com/docs/iac/guides/building-extending/components/build-a-component/)
- [Pulumi v3.272.0 release](https://github.com/pulumi/pulumi/releases/tag/v3.272.0)
- [Pulumi repository license](https://github.com/pulumi/pulumi/blob/master/LICENSE)
- [Go release history](https://go.dev/doc/devel/release)
- [GitHub Actions checkout releases](https://github.com/actions/checkout/releases)
- [GitHub Actions setup-go releases](https://github.com/actions/setup-go/releases)
- [golangci-lint releases](https://github.com/golangci/golangci-lint/releases)
