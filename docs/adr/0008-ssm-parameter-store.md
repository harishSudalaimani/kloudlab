# ADR 0007: AWS Systems Manager Parameter Store for workload secrets

- **Status:** Accepted for the current OpenFGA rollout
- **Date:** 2026-10-28

## Context

The identity cluster needs OpenFGA's RDS URI and API pre-shared token as
Kubernetes Secrets. KloudLab selected managed AWS services for hosting and
prefers to avoid operating a separate secrets control plane.

## Decision

Store the OpenFGA token and datastore URI as SSM Parameter Store `SecureString`
parameters. Deploy the open-source External Secrets Operator into
`kloudlab-identity` through Argo CD. Authenticate the controller with EKS Pod
Identity. Pulumi owns the IAM role, read policy, and association; the policy is
limited to `/kloudlab/<environment>/identity/openfga/*`. Argo CD owns ESO, its
namespaced `SecretStore` and `ExternalSecret` resources, and the OpenFGA Helm
release.

Do not place parameter values in Git, Helm values, Pulumi plaintext config,
stack outputs, or logs. Add separate role and path boundaries for other
workloads as they adopt this system. Keep a break-glass path to SSM that does
not depend on ESO or the identity cluster.

## Consequences

- OpenFGA depends on AWS SSM availability and IAM authorization.
- ESO materializes parameter values as Kubernetes Secrets, which remain
  subject to Kubernetes RBAC and etcd encryption controls.
- Production requires explicit KMS key policy, rotation, auditing, retention,
  and recovery decisions.
- ADR 0005's Infisical deployment decision is superseded.
