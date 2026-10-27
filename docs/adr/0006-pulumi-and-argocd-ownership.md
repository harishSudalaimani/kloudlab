# ADR 0006: Pulumi and Argo CD ownership boundary

- **Status:** Proposed
- **Date:** 2026-10-26

## Context

AWS resources and Kubernetes application releases need different delivery lifecycles. Managing the same Kubernetes object in both systems can create drift and competing updates.

## Decision

Pulumi Go owns AWS networking, EKS, foundational IAM, AWS database infrastructure, DNS/certificates, and explicitly identified bootstrap prerequisites. Argo CD owns ongoing Kubernetes application releases and configuration, including the OpenFGA Helm release, kgateway, Infisical integrations, telemetry components, and application workloads. Bootstrap resources must have one declared owner; after an ownership transfer, remove the former manager's declaration before enabling the new one. Use separate GitOps roots per cluster, reviewed changes, restricted production sources, health checks, and rollback procedures.

## Consequences

- Stack and Argo CD application boundaries must be documented together.
- A transition plan is needed for any resource whose bootstrap ownership changes.
- Production synchronization requires repository/branch access controls and auditability.
- A resource is never intentionally declared in both Pulumi and Argo CD desired state.
