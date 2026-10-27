# Cilium kube-proxy replacement in all KloudLab clusters

Cilium is installed from its official Helm chart by management-cluster Argo CD in `kloudlab-app`, `kloudlab-identity`, `kloudlab-observability`, and `kloudlab-management`. It replaces kube-proxy's Kubernetes Service routing with eBPF. The Amazon VPC CNI remains responsible for allocating pod ENIs and addresses through Cilium's AWS CNI chaining mode. kgateway remains the only Gateway API controller and is installed only in the app cluster.

## Workload-cluster bootstrap requirements

For app, identity, and observability, these settings are prerequisites for creating the EKS clusters:

1. Create EKS with `bootstrapSelfManagedAddons: false`; this prevents the default self-managed `vpc-cni`, `coredns`, and `kube-proxy` from being installed.
2. Explicitly install the Amazon VPC CNI and CoreDNS as EKS managed add-ons, and do not install the EKS `kube-proxy` add-on.
3. Taint each managed node group with `node.cilium.io/agent-not-ready=true:NoExecute` so ordinary pods wait for Cilium.
4. Register all three workload clusters in management Argo CD using their restricted cluster credentials.
5. Set each Cilium Helm values file's `k8sServiceHost` to that cluster's EKS API endpoint from its Pulumi output, without the `https://` prefix, and set `k8sServicePort` to `443`. EKS clusters might not have `kube-public/cluster-info`; do not depend on `k8sServiceHost: auto` for these clusters.

The management cluster already exists with kube-proxy so it can bootstrap Argo CD. Keep kube-proxy enabled there until Argo CD is healthy and the management Cilium Application has synchronized and Cilium is ready on every node. The management Cilium Application enables kube-proxy replacement; after verifying it, remove the EKS-managed kube-proxy add-on from the management Pulumi stack:

```sh
cd infra/stacks/cluster-management
pulumi config set kloudlab-cluster:manageKubeProxy false
pulumi config get kloudlab-cluster:manageKubeProxy
pulumi preview
pulumi up
```

Confirm the config command prints `false`. Review that the preview removes only the `kube-proxy` EKS add-on before applying it. Do not apply this Pulumi change before Cilium is healthy.

AWS identifies the Amazon VPC CNI as the supported CNI for EC2-backed EKS nodes. Cilium documents chaining with AWS VPC CNI. Validate the exact EKS/Kubernetes/kernel/Cilium versions and support model before production rollout.

## Argo CD deployment order

Install Argo CD on management while its existing kube-proxy is still enabled. Register the workload clusters, then apply the management root Application. It creates Cilium Applications in all four clusters at sync wave `-40`, before the application and observability workloads. Each Application uses the official Cilium Helm chart pinned to `1.20.4` and per-cluster values with:

- `kubeProxyReplacement: true`
- `cni.chainingMode: aws-cni` and `cni.exclusive: false`
- native routing with IPv4 masquerading disabled, as in Cilium's AWS CNI chaining guide
- `gatewayAPI.enabled: false`, leaving Gateway API reconciliation to kgateway

The management Cilium Application targets Argo CD's `in-cluster` destination. The three workload Applications target `kloudlab-app`, `kloudlab-identity`, and `kloudlab-observability`.

## Verify every cluster

Run these commands after Argo reports each cluster's Cilium Application healthy. Switch `KUBE_CONTEXT` to the corresponding EKS context (`kloudlab-management`, `kloudlab-app`, `kloudlab-identity`, or `kloudlab-observability`):

```sh
kubectl --context "$KUBE_CONTEXT" -n kube-system get pods -l k8s-app=cilium
kubectl --context "$KUBE_CONTEXT" -n kube-system exec ds/cilium -- cilium-dbg status --verbose
kubectl --context "$KUBE_CONTEXT" -n kube-system get ds kube-proxy
```

Confirm Cilium reports `KubeProxyReplacement: True`, agents are ready on every node, and kube-proxy is absent. Then run the Cilium connectivity test and check CoreDNS, ClusterIP, NodePort, and LoadBalancer traffic before admitting application workloads. During management's kube-proxy cutover, existing service connections may reset; verify Argo CD and the Kubernetes API recover before proceeding.
