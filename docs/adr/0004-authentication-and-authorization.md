# ADR 0004: Auth0 authentication and OpenFGA authorization

- **Status:** Proposed
- **Date:** 2026-10-26

## Context

The product needs managed user authentication and resource-level, organization-aware authorization. Login identity and access to a particular canvas are different concerns.

## Decision

Use Auth0 for OAuth 2.0/OpenID Connect authentication and token issuance. The Go API validates token signature, issuer, audience, expiry, and required claims before treating a request as authenticated. Store Auth0 `sub` as the external identity reference; do not use email as a stable key.

Use OpenFGA for relationship-based checks over users, organizations, memberships, and canvases. Check permissions in the backend on every protected operation. Keep OpenFGA private and reachable only from approved workloads. Editing a canvas does not grant infrastructure generation, approval, or execution permissions. Protected operations fail closed if authorization cannot be established.

## Consequences

- Auth0 is the explicit managed authentication exception; its service terms and configuration require review.
- The relationship model and tuple lifecycle need versioning and migration controls.
- OpenFGA needs durable private PostgreSQL with encryption, backups, and tested recovery.
- API tests must cover tenant isolation and authorization failures before multi-user release.
