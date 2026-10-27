# ADR 0003: Pulumi components and independent stack lifecycles

- **Status:** Implemented for state, OIDC, and networking; later stacks remain proposed
- **Date:** 2026-10-26

## Context

Networking, clusters, databases, and shared DNS have different ownership and replacement risks. A monolithic Pulumi program or state would couple unrelated lifecycle changes and obscure dependencies.

## Decision

Use a shared Pulumi Go module with typed component packages and separate stack entry points. Current stacks include state bootstrap, GitHub OIDC, four network stacks (app, identity, observability, and management), and network connectivity. Cluster, ECR, database, and DNS stacks remain future work. Pass dependencies explicitly through stack references for VPC IDs, subnet IDs, cluster outputs, and service endpoints. Keep secret outputs out of normal stack exports. Protect important resources and document reverse dependency/destroy order.

Use a versioned S3 DIY backend with TLS-only bucket access, KMS encryption, and protected state resources. Bootstrap it from local state, then migrate it to S3 before normal stacks are initialized. Document manual access, backup, restore, and locking responsibilities. Do not put unrelated resources in shared state or manage the same resource from two stacks.

## Consequences

- Stack boundaries make independent changes and previews easier to review.
- Stack references create explicit dependencies that need lifecycle documentation.
- State backend recovery remains an operator responsibility and must be exercised after bootstrap.
- The AWS provider is pinned for Phase 2; future provider upgrades need review against each stack's APIs.
