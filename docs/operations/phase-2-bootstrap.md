# Phase 2 bootstrap and network runbook

This runbook prepares the AWS network foundation. The stack code is reviewable
without AWS access. `pulumi up` is intentionally an operator step after account,
CIDR, cost, and deployment approval; no command here has been run against AWS.

## Resources implemented

- `bootstrap-state` creates a private, versioned S3 state bucket, blocks public
  access, enforces TLS, encrypts objects with a rotating customer-managed KMS
  key, and protects the bucket, key, and alias from deletion.
- `github-oidc` creates GitHub's OIDC provider and an IAM role restricted to
  exact `owner/repo` branch subjects. The permissions policy is required input
  so the role cannot silently inherit broad administrator access.
- `network-app`, `network-identity`, `network-observability`, and
  `network-management` create DNS-enabled VPCs, three public and three private
  subnets, explicit route tables, configurable NAT, and a private-subnet S3
  gateway endpoint.
- `network-connectivity` creates six direct same-account VPC peerings and
  routes between private route tables. Peering does not enable transitive
  routing and does not grant traffic by itself.
- The reusable security-group helper creates explicit, separately managed
  IPv4 rules. No service traffic rules are guessed before the EKS and workload
  ports are selected.

The sample VPC CIDRs are `10.10.0.0/16` (app), `10.20.0.0/16` (identity),
`10.30.0.0/16` (observability), and `10.40.0.0/16` (management).
Each network stack checks its CIDR against the configured peer and connected
CIDRs and rejects overlap. These values remain proposals until checked against
all VPCs, VPNs, and on-premises ranges that may be connected later. The /16 is
split into six /20 subnets, three per subnet class, in the configured AZ order.
Confirm the selected subnet size against expected EKS node and pod counts;
AWS VPC CNI pod addresses consume subnet addresses.

Development defaults to one shared NAT gateway per VPC to limit hourly NAT
charges. Production config rejects that mode and requires a NAT gateway per AZ.
Both modes incur AWS charges. The S3 gateway endpoint avoids routing S3 traffic
through NAT; other services use NAT until their endpoint and egress needs are
reviewed.

## Operator inputs required

Before provisioning, confirm the AWS account and role, whether the GitHub OIDC
provider already exists in that account, the globally unique state bucket
name, connected network CIDRs, available AZs in `ap-south-1`, the exact GitHub
repository and protected branch, and a reviewed least-privilege permissions
policy. Update stack config where actual account topology differs from the
sample values. The owner reports GoDaddy as registrar and Cloudflare as DNS
provider; verify the nameserver delegation before adding records. This network
phase makes no DNS changes.

Each network stack defaults `cidrInventoryReviewed` to `false`, which blocks
the program until the operator confirms the connected-range inventory. Set it
to `true` in all four stack configs only after the ranges have been checked.

The state bucket stack must be bootstrapped first from a protected local state
directory. Keep that directory private and backed up until migration completes.
The local DIY backend defaults to passphrase-based secret encryption. Set
`PULUMI_CONFIG_PASSPHRASE` from a password manager for the bootstrap session;
do not commit the passphrase or place it in a command argument.
Use an operator identity with only the permissions needed to create the state
bucket, KMS key, OIDC provider, and role. Verify the active account before each
bootstrap operation:

```sh
aws sts get-caller-identity
pulumi login file:///secure/path/kloudlab-bootstrap-state
cd infra/stacks/bootstrap-state
pulumi stack init dev
pulumi config set aws:region ap-south-1
pulumi config set kloudlab-state:environment dev
pulumi config set kloudlab-state:bucketName <globally-unique-bucket-name>
pulumi preview
```

Review the preview and obtain deployment approval before `pulumi up`. After the
state bucket and KMS key exist, migrate the bootstrap stack to S3 and switch it
to the KMS secrets provider:

```sh
pulumi up
pulumi logout
pulumi login 's3://<globally-unique-bucket-name>?region=ap-south-1'
pulumi stack migrate file:///secure/path/kloudlab-bootstrap-state dev
pulumi stack change-secrets-provider 'awskms://alias/kloudlab-pulumi-state?region=ap-south-1'
```

Back up the local bootstrap directory and confirm the migrated stack is
selectable from the S3 backend before removing or archiving any local copy.
For all later stacks, initialize with
`--secrets-provider='awskms://alias/kloudlab-pulumi-state?region=ap-south-1'`.
Keep S3 versioning enabled, restrict bucket and KMS access to operators and the
deployment role, and test restore from an earlier S3 object version. The DIY
backend has file-based locking; the team remains responsible for access,
coordination, recovery, and backup checks.

## GitHub OIDC role

Configure `infra/stacks/github-oidc` with the repository in `owner/repo`
format, an exact protected branch such as `main`, and a reviewed JSON IAM
permissions policy. Do not allow pull-request merge refs, tags, or wildcard
subjects for deployment. If the account already has the GitHub OIDC provider,
import and manage that provider rather than attempting to create a duplicate.
The role must be able to read/write Pulumi state objects in the selected bucket
and use the state KMS key, plus only the AWS actions required by the network
stacks. Keep `iam:PassRole` out of the network role; add it later only to the
specific EKS roles that need it.

The exact deployment role ARN and account are not known in this repository yet.
Do not copy a broad managed policy such as `AdministratorAccess` into the
required `permissionsPolicyJson`. Review the resulting trust policy to ensure
its audience is `sts.amazonaws.com` and its subject exactly matches the
approved repository branch. Set a GitHub Actions environment or repository
variable `AWS_NETWORK_PREVIEW_ROLE_ARN` to the resulting role ARN, and set
`PULUMI_BACKEND_URL` to `s3://<globally-unique-bucket-name>`. The
`network-preview.yml` workflow is manually dispatched from `main`, uses only
the preview command, and targets the four network stacks plus connectivity.
Initialize all five stacks in the DIY backend before dispatching the workflow.

## Network stack order

Initialize each stack in the S3 backend with the KMS secrets provider, then
review and preview in this order:

1. `kloudlab-network-app/dev`
2. `kloudlab-network-identity/dev`
3. `kloudlab-network-observability/dev`
4. `kloudlab-network-management/dev`
5. `kloudlab-network-connectivity/dev`

The network stacks export VPC ID and CIDR, AZ order, public/private subnet IDs,
route table IDs, and S3 endpoint ID. Connectivity consumes VPC IDs, CIDRs, and
private route tables from the four network stacks. It creates all six direct
peerings; routes do not authorize traffic or make peering transitive. Update each
`peerCIDRs`/`connectedCIDRs` list consistently when actual topology changes.
Use `natGatewayMode: per-az` for production. Review every plan for replacements,
public routes, NAT count, and deletion protection before requesting deployment
approval.

`pulumi preview` requires valid stack state and AWS read access; it does not
create resources. Do not run `pulumi up` or change DNS until the account, routes,
CIDRs, role policy, NAT cost, and preview have been reviewed and approved.

## Recovery notes

- Keep an operator break-glass identity capable of reading the bucket and using
  the KMS key; do not make GitHub the only path to recover state.
- Protect KMS key and state bucket resources. Losing the KMS key can make old
  state/config secrets unreadable even when S3 versions remain.
- Preserve the bootstrap stack checkpoint and S3 object versions. Test recovery
  by restoring a prior object version into a separate test copy before an
  incident.
- VPC peering is non-transitive. If connected CIDRs, accounts, or regions grow,
  revisit the topology before adding more peerings.
