# Cilium kube-proxy replacement in `kloudlab-app`

Cilium is installed from its official Helm chart by management-cluster Argo CD. It replaces kube-proxy's Kubernetes Service routing with eBPF in the app cluster. The Amazon VPC CNI remains responsible for allocating pod ENIs and addresses through Cilium's AWS CNI chaining mode. kgateway remains the only Gateway API controller.

## Cluster bootstrap requirements

These settings are prerequisites for creating the app EKS cluster; do not register the cluster with the auto-syncing Argo root until they are in place:

1. Create EKS with `bootstrapSelfManagedAddons: false`; this prevents the default self-managed `vpc-cni`, `coredns`, and `kube-proxy` from being installed.
2. Explicitly install the Amazon VPC CNI and CoreDNS as EKS managed add-ons, and do not install the EKS `kube-proxy` add-on.
3. Taint the app managed node group with `node.cilium.io/agent-not-ready=true:NoExecute` so ordinary pods wait for Cilium.
4. Confirm `kube-public/cluster-info` contains the Kubernetes API server address. The Cilium Helm values use `k8sServiceHost: auto`; if the ConfigMap is absent or lacks the endpoint, set `k8sServiceHost` to the EKS API endpoint from the cluster stack output.
5. Register the ready cluster in management Argo CD as `kloudlab-app` and allow the root Application to sync.

AWS identifies the Amazon VPC CNI as the supported CNI for EC2-backed EKS nodes. Cilium documents chaining with AWS VPC CNI, but this adds a separately operated networking datapath; validate the exact EKS/Kubernetes/kernel/Cilium versions and support model before production rollout.

## Argo CD deployment

The `cilium` Application is in sync wave `-40`, before the Gateway API and kgateway Applications. It uses `gitops/clusters/app/values/cilium.yaml` with:

- `kubeProxyReplacement: true`
- `cni.chainingMode: aws-cni` and `cni.exclusive: false`
- native routing with IPv4 masquerading disabled, as in Cilium's AWS CNI chaining guide
- `gatewayAPI.enabled: false`, leaving Gateway API reconciliation to kgateway

## Verify

Run these commands with the app-cluster context after Argo reports the application healthy:

```sh
argocd app get cilium
kubectl -n kube-system get pods -l k8s-app=cilium
kubectl -n kube-system exec ds/cilium -- cilium-dbg status --verbose
kubectl -n kube-system get ds kube-proxy
```

Confirm the Cilium status reports `KubeProxyReplacement: True`, agents are ready on all nodes, and no kube-proxy DaemonSet is running. Then run the Cilium connectivity test and check CoreDNS, ClusterIP, NodePort, and LoadBalancer traffic before removing the node taint or admitting application workloads.
