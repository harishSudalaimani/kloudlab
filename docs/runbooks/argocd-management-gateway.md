# Management Argo CD Gateway (later rollout)

Argo CD is first installed locally with Helm from `charts/argocd`. Do not
bootstrap its Gateway as part of that installation. Keep using a local
port-forward until the management cluster's kgateway prerequisites
are deliberately deployed through individual Argo CD Applications.

The management ingress flow remains:

```text
Cloudflare DNS -> AWS public NLB -> management kgateway Gateway -> HTTPRoute -> argocd-server
```

Before publishing `argocd.kloudlab.in`, deploy and verify, one at a time:

1. Gateway API CRDs and kgateway CRDs.
2. cert-manager and the management AWS Load Balancer Controller.
3. kgateway controller and its AWS NLB parameters.
4. The cert-manager issuer, certificate, Gateway, and HTTPRoute.

The Application definitions and values remain under
`gitops/clusters/management/applications/kgateway/`. Before deploying the AWS
Load Balancer Controller, add its IAM role and EKS Pod Identity association as
AWS-only Pulumi infrastructure. The current Argo CD access stack provisions
only the Argo controller identity. Keep the Cloudflare token in the approved
secrets workflow; do not place it in Git or Pulumi source.
