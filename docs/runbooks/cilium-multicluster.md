# Cilium rollout, one cluster at a time

Cilium is available as a pinned Helm module at `charts/cilium`. Deploy it only
as an individual Argo CD Application after the target cluster is connected and
its API endpoint is configured in that cluster's values. There are no aggregate
root Applications to install Cilium across every cluster at once.

Keep the EKS-managed kube-proxy add-on enabled until Cilium is healthy on every
node. Then disable the add-on in that cluster's Pulumi stack:

```sh
cd infra/stacks/cluster-management
pulumi stack select dev
pulumi config set kloudlab-cluster:manageKubeProxy false
pulumi preview
pulumi up
```

Use the matching stack directory for identity, app, or observability. Review
the preview and confirm it removes only that cluster's kube-proxy add-on.

The current Cilium values use AWS VPC CNI chaining: AWS VPC CNI continues to
assign pod IP addresses while Cilium supplies kube-proxy replacement. Verify
the Cilium status and workload connectivity before moving to another cluster.

```sh
kubectl --context kloudlab-management -n kube-system get pods -l k8s-app=cilium
kubectl --context kloudlab-management -n kube-system exec ds/cilium -- cilium-dbg status --verbose
kubectl --context kloudlab-management -n kube-system get ds kube-proxy
```

Repeat with the next cluster's context after the previous one is healthy.
