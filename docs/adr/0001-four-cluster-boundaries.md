# ADR 0001: Four EKS cluster boundaries

- **Status:** Proposed
- **Date:** 2026-10-26

## Context

The platform has separate application, identity, observability, and management responsibilities. They have different exposure, access, lifecycle, and failure concerns. A single AWS region is the initial deployment target.

## Decision

Use four distinct EKS clusters in `ap-south-1`: `kloudlab-app`, `kloudlab-identity`, `kloudlab-observability`, and `kloudlab-management`, each in its own VPC. Host the centralized Argo CD control plane in the dedicated management cluster. Argo CD reconciles GitOps workloads across all four clusters, including management workloads; bootstrap its initial installation and recovery independently. Keep the management cluster dedicated to management workloads and retain an independent procedure to rebuild it and restore Argo CD from Git. Restrict Argo CD's cluster API permissions to the minimum required. Keep its UI private or tightly restricted. Keep Auth0 external and restrict worker nodes to private subnets by default.

Use Karpenter only in `kloudlab-app`, installed and configured through Argo CD. The app cluster retains an EC2 managed node group for stable baseline capacity and the Karpenter controller. Identity, observability, and management use EC2 managed node groups only.

Use two `t3.medium` managed worker nodes per cluster as an initial sizing hypothesis, subject to subnet, workload, burst-credit, and cost validation. It is not a production capacity guarantee.

## Consequences

- Cluster administration and failure boundaries are easier to scope by responsibility.
- Cross-cluster calls require explicit routing, authentication, encryption, and security policy.
- The design increases baseline cost and operational overhead compared with one cluster.
- Four clusters in one region are not regional disaster recovery; regional recovery needs a separate design and tested data replication.
- EKS version, add-ons, API endpoint access, and workload-specific sizing remain to be validated before implementation.
- Centralized GitOps adds a management-cluster recovery dependency; retain an independent bootstrap and restore path.
