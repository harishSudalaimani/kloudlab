# ADR 0006: Pulumi and Argo CD ownership boundary

- **Status:** Proposed
- **Date:** 2026-10-26

## Context

AWS resources and Kubernetes application releases need different delivery lifecycles. Managing the same Kubernetes object in both systems can create drift and competing updates.

## Decision

Pulumi Go owns AWS networking, EKS, foundational IAM, ECR, AWS database infrastructure, DNS/certificates, and EKS Pod Identity roles/associations. Install the initial Argo CD Helm chart directly on `kloudlab-management` from `charts/argocd`; Pulumi does not install Argo CD or create Argo Application resources. Connect workload clusters individually after bootstrap. Argo CD owns Kubernetes Applications and Helm releases across the clusters, including OpenFGA, kgateway, Infisical, telemetry components, and application workloads. Keep the management cluster dedicated to management workloads. Karpenter's Helm release and its `NodePool`/`EC2NodeClass` resources are reconciled only in `kloudlab-app`; the other clusters use managed node groups only. Bootstrap resources must have one declared owner; after an ownership transfer, remove the former manager's declaration before enabling the new one. Use reviewed changes, restricted production sources, health checks, and rollback procedures.

## Consequences

- Stack and Argo CD application boundaries must be documented together.
- A transition plan is needed for any resource whose bootstrap ownership changes.
- Production synchronization requires repository/branch access controls and auditability.
- A resource is never intentionally declared in both Pulumi and Argo CD desired state.
