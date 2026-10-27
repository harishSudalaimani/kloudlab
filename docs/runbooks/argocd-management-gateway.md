# Publish Argo CD through management kgateway

The Argo CD UI lives in `kloudlab-management`, so it gets a local Gateway API
path in that cluster:

```text
Cloudflare DNS -> public AWS NLB -> management kgateway Gateway -> HTTPRoute -> argocd-server
```

The route uses the existing kgateway charts. AWS Load Balancer Controller
creates the NLB, cert-manager issues the Gateway certificate using Cloudflare
DNS-01, and Argo CD terminates TLS at kgateway before forwarding HTTP inside
the cluster. No Cloudflare Tunnel or direct `kubectl apply` is used.

## Prerequisites

1. The management EKS cluster has the EKS Pod Identity Agent. The project
   configuration enables it; review and apply that add-on change first:

   ```sh
   cd ~/Documents/kloudlab/infra/stacks/cluster-management
   pulumi stack select dev
   pulumi preview
   pulumi up
   ```

2. Vendor the version-pinned AWS Load Balancer Controller IAM policy used by
   Pulumi:

   ```sh
   cd ~/Documents/kloudlab
   bash scripts/vendor-aws-load-balancer-controller-policy.sh
   ```

3. Vendor the pinned upstream controller chart dependency too, so Argo CD can
   render the KloudLab wrapper chart from Git:

   ```sh
   helm dependency update charts/aws-load-balancer-controller
   ```

4. Create a Cloudflare API token scoped to the `kloudlab.in` zone with
   `Zone:DNS:Edit` and `Zone:Zone:Read` permissions. The token is used only by
   cert-manager for ACME DNS challenges. Do not put it in Git or chat.
5. Push the reviewed repository changes, including the generated policy and
   Helm dependency archive/lock file, to `main`; Argo CD sources its
   Applications and Helm modules from that branch.

## Create the controller identity and management Gateway root

From the Argo CD Pulumi stack, enter the DNS token at the secure prompt, enable
the management Gateway root, and review the plan before applying it:

```sh
cd ~/Documents/kloudlab/infra/stacks/argocd-management
pulumi stack select dev
pulumi config set --secret kloudlab-argocd-management:cloudflareDnsApiToken
pulumi config set kloudlab-argocd-management:bootstrapManagementGateway true
pulumi preview
pulumi up
```

Pulumi creates a scoped Pod Identity role and association for the AWS Load
Balancer Controller, stores the Cloudflare DNS token as a Kubernetes Secret in
the `cert-manager` namespace, and creates the Argo CD root Application. Argo
CD installs the Gateway API CRDs, cert-manager, AWS Load Balancer Controller,
kgateway, its NLB parameters, and the Argo CD `Gateway`/`HTTPRoute`.

## Add the DNS record

After the Gateway reports its NLB hostname, create a Cloudflare **DNS-only**
CNAME record:

- Name: `argocd`
- Target: the NLB hostname reported by the Gateway

The cert-manager DNS-01 challenge does not require this CNAME to exist first.
Once the record resolves and the certificate is Ready, open
`https://argocd.kloudlab.in` and sign in to Argo CD.

## Verify

```sh
kubectl --context kloudlab-management -n argocd get applications
kubectl --context kloudlab-management -n kube-system get deployments aws-load-balancer-controller
kubectl --context kloudlab-management get clusterissuer
kubectl --context kloudlab-management -n kgateway-system get certificates
kubectl --context kloudlab-management -n kgateway-system get gateway,httproute,services
```

The management cluster currently has a single `t3.medium` node. The two
controller replicas improve process recovery, but they do not provide node or
Availability Zone resilience until the management node group has capacity in
both AZs.
