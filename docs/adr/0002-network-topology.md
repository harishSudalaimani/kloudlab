# ADR 0002: Simple per-cluster VPCs

- **Status:** Accepted for the initial deployment; proposed CIDRs remain unverified
- **Date:** 2026-10-27

## Context

KloudLab will run separate EKS clusters for app, identity, observability, and
management. The initial network should be straightforward to understand and
operate. Planned services need direct cross-cluster traffic, so each VPC needs
explicit private routes to the other cluster VPCs.

## Decision

Create one VPC per EKS cluster, using proposed ranges `10.10.0.0/16` (app),
`10.20.0.0/16` (identity), `10.30.0.0/16` (observability), and
`10.40.0.0/16` (management). Start with two Availability Zones in
`ap-south-1`. Each VPC has two public `/20` subnets for internet-facing load
balancers, two private `/20` subnets for worker nodes, explicit route tables,
an Internet Gateway, development NAT egress, and an S3 gateway endpoint.
Production requires a NAT gateway per AZ under the current component policy.

Connect the four VPCs with six direct, same-account VPC peerings managed by a
separate Pulumi stack. Add routes in each private route table for the three
peer VPC CIDRs. This provides direct private paths for app-to-OpenFGA,
cluster-to-central-OTel, and management-to-EKS API traffic. Enable DNS
resolution across each peering connection. Review CIDRs against existing AWS
and connected networks before provisioning. Peering routes do not expose
Kubernetes services or authorize traffic; configure internal service
endpoints, TLS, and narrow security-group rules with their consumers.

Do not create Transit Gateway attachments or Network Firewall for the initial
deployment. Revisit the connectivity design if the number of VPCs, accounts,
regions, or centralized inspection requirements grow.

Cloudflare remains authoritative for DNS. Route 53 is not part of this
foundation. Add CloudFront later when the frontend is ready for that delivery
path; no CloudFront resources are created by these network stacks.

## Consequences

- Two AZs provide initial multi-AZ placement without requiring three AZs at
  launch. Availability and cost still depend on AWS service and subnet capacity.
- The `/20` subnets provide ample initial address space, but EKS node and VPC
  CNI pod sizing must be checked before cluster creation.
- A single development NAT gateway keeps cost down but creates a shared egress
  dependency. Production uses one NAT gateway per AZ; VPC endpoints may be
  added when their cost and traffic justify them.
- The peering mesh creates direct routes only. OpenFGA and OTLP need private
  service endpoints and security rules; EKS management access needs private
  endpoint configuration and control-plane security rules.
- Routes alone never authorize traffic; security groups and workload policies
  remain required for every service connection.
