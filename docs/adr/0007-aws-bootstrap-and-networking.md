# ADR 0007: AWS bootstrap and initial network foundation

- Status: proposed implementation; requires account and CIDR review before provisioning
- Date: 2026-10-26

## Decision

Use Pulumi Go with the AWS provider pinned in `infra/go.mod`. Bootstrap a
versioned S3 DIY state backend encrypted with a customer-managed KMS key, then
use that backend and key for later stacks. Federate GitHub Actions through OIDC
to an exact repository-branch subject and attach an explicitly supplied IAM
permissions policy.

Create three VPCs in `ap-south-1` with separate app, identity, and observability
stacks. Each VPC has public load-balancer subnets, private workload subnets,
explicit public and per-AZ private route tables, NAT egress, and an S3 gateway
endpoint. Development starts with a single NAT gateway per VPC; production
configuration requires one per AZ. A separate stack owns the three direct VPC
peerings and private routes. Security groups are built from separately managed
explicit rules as workload requirements become known.

## Rationale

- S3 versioning, TLS-only access, public-access blocking, KMS encryption, and
  Pulumi protection make accidental state loss less likely while leaving
  account access and recovery operator-controlled.
- An exact OIDC subject removes static AWS credentials from GitHub and avoids
  trust for pull-request refs. An explicit policy input keeps AWS permissions
  visible for review.
- Separate network stacks let each VPC change independently. A connectivity
  stack avoids cross-stack resource ownership and makes peering routes visible.
- Per-AZ private route tables support AZ-local NAT in production and give later
  peering routes a clear destination table.
- One shared NAT gateway in development is a cost choice, not a production
  availability setting.
- VPC peering suits three initial VPCs; it is non-transitive and may be replaced
  by Transit Gateway or PrivateLink if connectivity grows.

## Consequences and unresolved checks

- The state backend itself starts on a protected local filesystem and must be
  migrated after its bucket exists. Pulumi DIY backends rely on file-based
  locking and manual access/recovery procedures.
- AWS account ID, AWS access method, state bucket name, GitHub repository and
  branch, exact IAM permissions, OIDC provider existence, and connected CIDRs
  are required before deployment.
- Proposed CIDRs `10.10.0.0/16`, `10.20.0.0/16`, and `10.30.0.0/16` have not
  been checked against account networks, VPNs, or on-premises routes.
- The `/20` subnets have ample initial address space, but EKS node/pod sizing
  must be checked against VPC CNI allocation before cluster creation.
- Peering establishes routes only. Security groups, private DNS, service
  authentication, and the requested app-to-identity and cluster-to-observability
  traffic still need explicit designs in later phases.
- `kloudlab.in` nameservers and Route 53 ownership are unknown; DNS changes are
  excluded until verified.

## References

- [Pulumi state and backends](https://www.pulumi.com/docs/iac/concepts/state-and-backends/)
- [Pulumi secrets providers](https://www.pulumi.com/docs/iac/concepts/secrets/)
- [Pulumi AWS VPC security group guidance](https://www.pulumi.com/registry/packages/aws/api-docs/ec2/securitygroup/)
- [AWS EKS subnet selection and VPC CNI](https://docs.aws.amazon.com/eks/latest/userguide/cni-subnet-selection.html)
