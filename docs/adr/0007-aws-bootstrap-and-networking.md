# ADR 0007: AWS bootstrap and initial network foundation

- Status: proposed implementation; requires account and CIDR review before provisioning
- Date: 2026-10-26

## Decision

Use Pulumi Go with the AWS provider pinned in `infra/go.mod`. Bootstrap a
versioned S3 DIY state backend encrypted with a customer-managed KMS key, then
use that backend and key for later stacks. Federate GitHub Actions through OIDC
to an exact repository-branch subject and attach an explicitly supplied IAM
permissions policy.

Create four VPCs in `ap-south-1` with separate app, identity, observability,
and management stacks. Proposed CIDRs are `10.10.0.0/16`, `10.20.0.0/16`,
`10.30.0.0/16`, and `10.40.0.0/16`, respectively. Start with two AZs and
two public load-balancer subnets plus two private worker subnets per VPC.
Create explicit public and per-AZ private route tables, an Internet Gateway,
development NAT egress, and an S3 gateway endpoint. Production configuration
requires one NAT per AZ. A separate Pulumi stack creates six direct VPC
peerings and private routes across the four VPCs, including cross-peering DNS
resolution. Do not provision Transit Gateway or Network Firewall initially.
Service endpoints, TLS, and narrow security-group rules are configured with
their consumers.
Cloudflare owns DNS; Route 53 is excluded. Consider CloudFront later when the
frontend delivery path is ready.

## Rationale

- S3 versioning, TLS-only access, public-access blocking, KMS encryption, and
  Pulumi protection make accidental state loss less likely while leaving
  account access and recovery operator-controlled.
- An exact OIDC subject removes static AWS credentials from GitHub and avoids
  trust for pull-request refs. An explicit policy input keeps AWS permissions
  visible for review.
- Separate network stacks let each VPC change independently. Per-AZ private
  route tables support AZ-local NAT in production and direct peering routes to
  the other three VPCs.
- One shared NAT gateway in development is a cost choice, not a production
  availability setting.
- Peering establishes direct private routes only. API-to-OpenFGA, remote
  telemetry export, and Argo CD cluster API access still require reachable
  endpoints and explicit security rules.

## Consequences and unresolved checks

- The state backend itself starts on a protected local filesystem and must be
  migrated after its bucket exists. Pulumi DIY backends rely on file-based
  locking and manual access/recovery procedures.
- AWS account ID, AWS access method, state bucket name, GitHub repository and
  branch, exact IAM permissions, OIDC provider existence, available AZs, and
  existing CIDRs are required before deployment.
- Proposed CIDRs `10.10.0.0/16`, `10.20.0.0/16`, `10.30.0.0/16`, and
  `10.40.0.0/16` have not been checked against existing VPCs, VPNs, or
  on-premises ranges. Avoiding overlap now preserves future private routing.
- The `/20` subnets have ample initial address space, but EKS node/pod sizing
  must be checked against VPC CNI allocation before cluster creation.
- The peering stack creates cross-VPC routes in this phase. Service security
  groups, internal endpoints, DNS names, TLS, and authentication still need
  explicit configuration in later phases.
- The owner uses Cloudflare for DNS and GoDaddy as registrar. Verify registrar
  nameserver delegation before making DNS changes; this networking phase makes
  no DNS changes.

## References

- [Pulumi state and backends](https://www.pulumi.com/docs/iac/concepts/state-and-backends/)
- [Pulumi secrets providers](https://www.pulumi.com/docs/iac/concepts/secrets/)
- [Pulumi AWS VPC security group guidance](https://www.pulumi.com/registry/packages/aws/api-docs/ec2/securitygroup/)
- [AWS EKS subnet selection and VPC CNI](https://docs.aws.amazon.com/eks/latest/userguide/cni-subnet-selection.html)
