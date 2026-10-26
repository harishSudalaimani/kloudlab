# ADR 0001: Three EKS cluster boundaries

- **Status:** Proposed
- **Date:** 2026-10-26

## Context

The platform has separate application, identity, and observability responsibilities. They have different exposure, access, lifecycle, and failure concerns. A single AWS region is the initial deployment target.

## Decision

Use three distinct EKS clusters in `ap-south-1`: `kloudlab-app`, `kloudlab-identity`, and `kloudlab-observability`. Give each cluster its own lifecycle, VPC, cluster API access policy, node groups, and GitOps root. Keep Auth0 external. Restrict worker nodes to private subnets by default, and size EC2 managed node groups from measured workload requirements.

## Consequences

- Cluster administration and failure boundaries are easier to scope by responsibility.
- Cross-cluster calls require explicit routing, authentication, encryption, and security policy.
- The design increases baseline cost and operational overhead compared with one cluster.
- Three clusters in one region are not regional disaster recovery; regional recovery needs a separate design and tested data replication.
- EKS version, add-ons, node sizing, and API endpoint access remain to be decided before implementation.
