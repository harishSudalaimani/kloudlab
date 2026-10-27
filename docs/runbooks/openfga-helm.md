# OpenFGA Helm deployment

KloudLab runs OpenFGA and its PostgreSQL datastore as self-hosted Kubernetes workloads. Helm is the deployment interface. Auth0 and EKS remain the managed services. The OpenFGA release wraps the official OpenFGA chart; PostgreSQL runs under the CloudNativePG operator. The OpenFGA chart's bundled legacy Bitnami database is disabled.

## Release layout

- `deploy/helm/openfga-postgres` installs a CloudNativePG `Cluster` resource. It expects the CloudNativePG operator CRDs and controller to have been installed by Helm first.
- `deploy/helm/openfga` wraps the official OpenFGA chart, configures three replicas, disables its playground and ingress, enables pre-shared-key API authentication, and points to the PostgreSQL read/write service.
- Both releases belong in the identity cluster and a private namespace. OpenFGA uses a `ClusterIP` service and is not exposed publicly.

The example datastore values assume the namespace contains CloudNativePG's `openfga-postgres-app` credential Secret with `username` and `password` keys. OpenFGA also expects the `kloudlab-openfga-auth` Secret with a `keys` key; the API reads its single active key from the same Secret's `token` key as `OPENFGA_API_TOKEN`. Keep `keys` and `token` identical during normal operation. Secret delivery is a prerequisite: the Phase 7 secret integration is not implemented yet. Do not commit credentials or put them in Helm values.

## Install with Helm

Choose an encrypted EBS-backed StorageClass for `deploy/helm/openfga-postgres/values.yaml`, and configure the future secret integration to create `kloudlab-openfga-auth` in the identity namespace. CloudNativePG creates `openfga-postgres-app` for the initialized database role; OpenFGA reads its username and password from that Secret.

```sh
helm repo add cloudnative-pg https://cloudnative-pg.github.io/charts
helm repo update
helm upgrade --install cnpg cloudnative-pg/cloudnative-pg \
  --version 0.29.1 \
  --namespace cnpg-system --create-namespace

helm upgrade --install openfga-postgres ./deploy/helm/openfga-postgres \
  --namespace kloudlab-identity --create-namespace

helm dependency build ./deploy/helm/openfga
helm upgrade --install openfga ./deploy/helm/openfga \
  --namespace kloudlab-identity
```

These commands install Kubernetes releases only when an operator runs them against a configured cluster. They have not been run against an AWS account or cluster.

## Store and model bootstrap

After OpenFGA is ready, create a store and publish `apps/api/openfga/model.fga` using the OpenFGA CLI or API from an approved operator environment. Record the resulting store ID and authorization model ID in the secret manager, then provide them to the API as `OPENFGA_STORE_ID` and `OPENFGA_AUTHORIZATION_MODEL_ID`. The API sends `Authorization: Bearer $OPENFGA_API_TOKEN` on every OpenFGA request and fails closed on authorization errors.

The model file is the source of truth. Treat model changes as versioned authorization migrations: validate the new model against representative user/workspace/architecture tuples, publish the immutable model version, and update the API's model ID through a reviewed deployment.

## Connectivity and production gates

The initial architecture places the API and OpenFGA in separate EKS clusters. A `ClusterIP` is not routable across clusters, so the API's `OPENFGA_API_URL` must point to an approved private, TLS-protected endpoint once the cross-cluster routing and certificate design is implemented. Do not replace this with a public endpoint. The Helm baseline intentionally has no ingress or `LoadBalancer` service.

This baseline is not production-ready until the private API-to-OpenFGA path, encrypted and verified database TLS, persistent volume encryption, backup/restore, secrets delivery, resource sizing, and monitoring have been configured and reviewed. CloudNativePG's cluster chart is intentionally not used here; only its operator is installed from the official Helm chart, while the database `Cluster` resource is rendered by KloudLab's Helm chart.
