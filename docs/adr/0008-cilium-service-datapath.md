# ADR 0008: Cilium replaces kube-proxy in the app cluster

## Status

Accepted

## Context

The app cluster needs a service datapath and network policy implementation. The project deploys to Amazon EKS and uses EC2 managed node groups. kgateway is the chosen Gateway API controller and Envoy proxy manager; Cilium's optional Gateway API controller would duplicate that role.

## Decision

Deploy Cilium `1.20.4` only in `kloudlab-app`, using its eBPF kube-proxy replacement. Keep the Amazon VPC CNI responsible for pod ENI/IP allocation and use Cilium's AWS CNI chaining mode for eBPF service handling and policy. Disable the EKS kube-proxy add-on at cluster bootstrap. Keep Cilium's Gateway API controller disabled and continue using kgateway.

The cluster bootstrap must set `bootstrapSelfManagedAddons: false`, explicitly install the VPC CNI and CoreDNS as EKS managed add-ons, omit kube-proxy, and taint the app managed node group with `node.cilium.io/agent-not-ready=true:NoExecute` until Cilium is ready. Install Cilium from its official Helm chart through management-cluster Argo CD before exposing the cluster to normal application scheduling. Use the EKS API endpoint through Cilium's `k8sServiceHost` configuration; the current Helm values use the `kube-public/cluster-info` lookup and must be verified during bootstrap.

## Consequences

- Cluster networking must be designed before EKS creation; this is not a routine post-install kube-proxy swap.
- AWS VPC CNI remains responsible for assigning VPC pod IPs. Cilium adds a chained datapath; advanced Cilium features can be limited in chaining mode.
- Cilium and kube-proxy must not both own Kubernetes Service routing on app nodes.
- AWS documents the VPC CNI as the supported CNI for EC2-backed EKS clusters. Cilium chaining is documented by Cilium, but operating the added Cilium datapath requires project expertise or appropriate support.
- Cilium Gateway API support stays disabled to keep kgateway the sole controller for the `kgateway` GatewayClass.
- Identity, observability, and management clusters retain their existing networking choice until separately reviewed.

## References

- [Cilium AWS VPC CNI chaining](https://docs.cilium.io/en/stable/installation/cni-chaining-aws-cni/)
- [Cilium kube-proxy replacement](https://docs.cilium.io/en/stable/network/kubernetes/kubeproxy-free/)
- [Amazon EKS alternate CNI plugins](https://docs.aws.amazon.com/eks/latest/userguide/alternate-cni-plugins.html)
