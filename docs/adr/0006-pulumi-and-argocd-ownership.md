# ADR 0006: Pulumi and Argo CD ownership boundary

- **Status:** Proposed
- **Date:** 2026-10-26

## Context

AWS resources and Kubernetes application releases need different delivery lifecycles. Managing the same Kubernetes object in both systems can create drift and competing updates.

## Decision

Pulumi Go owns AWS networking, EKS, foundational IAM, ECR, AWS database infrastructure, DNS/certificates, and the initial Argo CD Helm release on `kloudlab-management`. After target clusters are registered, the Argo CD Pulumi stack creates the root Application at `gitops/management/root-application.yaml`; it points Argo CD at the GitOps Application roots. Argo CD owns the child Applications and ongoing Kubernetes application releases across all four clusters, including OpenFGA, kgateway, Infisical, telemetry components, and application workloads. Keep the management cluster dedicated to management workloads. Karpenter's Helm release and its `NodePool`/`EC2NodeClass` resources are reconciled only in `kloudlab-app`; the other clusters use managed node groups only. Bootstrap resources must have one declared owner; after an ownership transfer, remove the former manager's declaration before enabling the new one. Use reviewed changes, restricted production sources, health checks, and rollback procedures.

## Consequences

- Stack and Argo CD application boundaries must be documented together.
- A transition plan is needed for any resource whose bootstrap ownership changes.
- Production synchronization requires repository/branch access controls and auditability.
- A resource is never intentionally declared in both Pulumi and Argo CD desired state.
