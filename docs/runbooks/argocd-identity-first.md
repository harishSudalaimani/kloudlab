# Identity cluster rollout

Argo CD is installed directly on `kloudlab-management` with Helm. Pulumi owns
the EKS and AWS identity infrastructure; it does not install Argo CD, register
clusters, or create Kubernetes Applications. The identity cluster is added
manually after the Argo control plane is healthy.

## Before connecting identity

- Confirm `kloudlab-management` Argo CD is healthy.
- Confirm the identity cluster's dedicated Argo deploy role and EKS access
  entry are present.
- Create the `kloudlab-identity` AppProject from
  `gitops/management/projects/identity.yaml`.

Register `kloudlab-identity` in Argo CD with its restricted IAM credentials.
Confirm its connection is successful before creating an Application.

## Deploy one Application at a time

Keep the EKS-managed kube-proxy add-on enabled. Prepare the identity services'
external dependencies before creating their Applications:

1. Provision PostgreSQL and Redis endpoints and the required Secrets through
   the approved secret workflow.
2. Create `kloudlab-infisical-server` only after its bootstrap Secret, database,
   Redis, private HTTPS hostname, and TLS path are ready.
3. Initialize Infisical, then create its Secrets Operator Application.
4. Create OpenFGA only after its datastore and service-token Secrets exist.
5. Add the identity OpenTelemetry node agent and cluster collector after the
   observability gateway endpoint is reachable.

The individual Application definitions and values remain in
`gitops/clusters/identity/applications/`. There is no identity root app that
recursively activates the full cluster.
