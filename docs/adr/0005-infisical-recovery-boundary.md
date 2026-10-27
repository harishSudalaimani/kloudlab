# ADR 0005: Infisical must have an independent recovery boundary

- **Status:** Proposed; hosting decision open
- **Date:** 2026-10-26

## Context

Infisical will manage credentials needed by workloads, including identity and cluster integrations. If the normal secrets service depends on the identity cluster that it helps secure, an identity-cluster outage could also remove the ability to recover that cluster.

## Decision

Infisical may be self-hosted in `kloudlab-identity`, but its only control plane, persistent data, backup, or bootstrap credentials must not depend on that cluster being available. Before adopting it, choose whether to co-locate the workload and select an edition, narrowly scoped app workload identities, an encrypted backup target outside the normal retrieval failure domain, out-of-band bootstrap credentials, and a documented restore procedure. Back up configuration and the underlying state required by the chosen deployment model; test restoring it without the normal cluster path.

No Infisical edition or hosting model is selected by this ADR. Verify the current license, distribution model, and required backup/rotation capabilities before relying on them. Do not silently substitute a proprietary secrets service.

## Consequences

- Bootstrap must work when the identity EKS cluster and normal secret retrieval are unavailable.
- Backup location and credentials need independent access controls and audit.
- Hosting and feature decisions block secrets integration implementation.
- Secret values must not appear in Git, canvas documents, Pulumi plaintext configuration, stack outputs, images, or logs.
