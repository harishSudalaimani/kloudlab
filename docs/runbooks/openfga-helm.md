# OpenFGA Helm deployment

OpenFGA runs in the `kloudlab-identity` EKS cluster. Argo CD is hosted centrally in the dedicated `kloudlab-management` cluster and reconciles the OpenFGA `Application` into identity. Pulumi owns its private Amazon RDS PostgreSQL database; Argo CD owns the OpenFGA Helm release. This follows the master architecture, including its RDS recommendation. The OpenFGA module at `charts/openfga` pins the official chart dependency, and the cluster values disable its bundled legacy Bitnami databases.

## Release layout

- `charts/openfga/Chart.yaml` pins the upstream OpenFGA chart version. `gitops/clusters/identity/applications/openfga/application.yaml` references this local module; its adjacent `values.yaml` configures three replicas, disables the playground and ingress, enables pre-shared-key API authentication, and reads the RDS URI from a Kubernetes Secret.
- OpenFGA runs in a private namespace and uses a `ClusterIP` service. The intended API URL is `https://fga.internal.kloudlab.in`; private cross-cluster routing and endpoint termination remain infrastructure work, and the service is not exposed publicly.

Infisical must sync `kloudlab-openfga-datastore` with a `uri` key containing the RDS connection URI, including `sslmode=verify-full`. It must also sync `kloudlab-openfga-auth` with a `keys` key for OpenFGA and a `token` key for the API. Keep `keys` and `token` identical during normal operation. Secret delivery is a prerequisite: the Phase 7 Infisical integration is not implemented yet. Do not commit credentials or put them in Helm values.

## Deployment ownership

The planned Pulumi identity database stack will provision the RDS instance, subnet group, encryption, backups, and security groups in the identity VPC. The existing database package currently defines only its typed contract; it does not yet create RDS resources. The API and OpenFGA traffic must be allowed through explicit network rules. Store the RDS endpoint and credentials in Infisical; only the synced Secret reference belongs in Helm values.

```sh
helm dependency build charts/openfga
helm template openfga charts/openfga \
  --values gitops/clusters/identity/applications/openfga/values.yaml \
  --namespace kloudlab-identity
```

The management-hosted Argo CD will reconcile this Application into identity after the target cluster is registered. The values file is supplied through Argo CD's multi-source Helm values feature, which requires Argo CD 2.6 or newer ([multi-source Helm values](https://argo-cd.readthedocs.io/en/latest/user-guide/multiple_sources/)). Helm is used to render the chart; Argo CD owns synchronization and lifecycle ([Argo CD Helm integration](https://argo-cd.readthedocs.io/en/latest/user-guide/helm/)). Do not run `helm upgrade` against a managed cluster. No AWS database or Kubernetes release has been deployed.

## Store and model bootstrap

After OpenFGA is ready, create a store and publish `apps/api/internal/authorization/model.fga` using the OpenFGA CLI or API from an approved operator environment. Record the resulting store ID and authorization model ID in the secret manager, then provide them to the API as `OPENFGA_STORE_ID` and `OPENFGA_AUTHORIZATION_MODEL_ID`. The API sends `Authorization: Bearer $OPENFGA_API_TOKEN` on every OpenFGA request and fails closed on authorization errors.

The model file is the source of truth. Treat model changes as versioned authorization migrations: validate the new model against representative user/workspace/architecture tuples, publish the immutable model version, and update the API's model ID through a reviewed deployment.

## Connectivity and production gates

The API and OpenFGA are in separate EKS clusters. The connectivity Pulumi stack creates an app-to-identity VPC peering route, but a `ClusterIP` is still not routable across clusters. Before deploying the integration, expose OpenFGA through an internal endpoint in the identity VPC and configure private DNS, TLS, and narrow security-group rules. The proposed API URL is `https://fga.internal.kloudlab.in`. Do not replace this with a public endpoint. The Helm baseline intentionally has no public ingress or `LoadBalancer` service.

This baseline is not production-ready until the private API-to-OpenFGA path, RDS sizing and Multi-AZ configuration, verified database TLS, backups and restore, secrets delivery, resource sizing, and monitoring have been configured and reviewed.
