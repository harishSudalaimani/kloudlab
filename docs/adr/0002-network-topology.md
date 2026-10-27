# ADR 0002: Dedicated VPCs and explicit cross-VPC connectivity

- **Status:** Implemented in code; proposed CIDRs remain unverified
- **Date:** 2026-10-26

## Context

Each EKS cluster needs isolated routing and sufficient subnet capacity for nodes, pods, and load balancers. The clusters must exchange selected application and telemetry traffic, but routing does not itself grant permission.

## Decision

Start with one VPC per cluster, using proposed ranges `10.10.0.0/16` (app), `10.20.0.0/16` (identity), `10.30.0.0/16` (observability), and `10.40.0.0/16` (management). Each VPC stack creates three public and three private /20 subnets across configured AZs, explicit public and private route tables, NAT egress, and an S3 gateway endpoint. Use one NAT gateway per VPC in development and require one per AZ in production. Use a separate connectivity stack for direct pairwise peering among all four VPCs (six peerings) and routes in private route tables. Add narrow security-group rules as consumers and ports are defined; routes alone never authorize traffic. Management-to-cluster API access must also be limited by target-cluster authorization policy.

## Consequences

- CIDRs must be checked against existing VPCs, VPNs, and connected networks before preview or provisioning.
- VPC CNI pod IP demand must be included in subnet sizing.
- Production NAT topology and endpoint selection still require cost, availability, and egress review.
- VPC peering is non-transitive, and a route does not authorize traffic; security groups and workload policies remain required.
- The initial peering choice should be revisited if routing scale, account boundaries, or centralized policy requirements change.
