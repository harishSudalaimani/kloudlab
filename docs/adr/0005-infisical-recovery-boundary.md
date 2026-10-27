# ADR 0005: Infisical must have an independent recovery boundary

- **Status:** Proposed; identity-cluster placement selected for initial deployment, recovery design open
- **Date:** 2026-10-26

## Context

Infisical will manage credentials needed by workloads, including identity and cluster integrations. If the normal secrets service depends on the identity cluster that it helps secure, an identity-cluster outage could also remove the ability to recover that cluster.

## Decision

KloudLab will use self-hosted Infisical for secrets management, initially deployed in `kloudlab-identity`. Its persistent data, backups, and bootstrap credentials must remain recoverable without relying on that EKS cluster. Use narrowly scoped workload identities, store encrypted backups outside the normal retrieval failure domain, keep out-of-band bootstrap credentials, and document a restore procedure. Back up configuration and the underlying state required by the chosen deployment model; test restoring it without the normal cluster path.

The self-hosted deployment and Kubernetes operator have separate Helm modules under `charts/infisical/`; Argo CD values belong in the relevant cluster overlays. Verify the selected edition's license and required backup/rotation capabilities before relying on them. Do not silently substitute a proprietary secrets service.

## Consequences

- The Infisical server is unavailable during an identity EKS outage until it is restored; bootstrap and data recovery must work without that cluster.
- Backup location and credentials need independent access controls and audit.
- Hosting and feature decisions block secrets integration implementation.
- Secret values must not appear in Git, canvas documents, Pulumi plaintext configuration, stack outputs, images, or logs.
