# OpenFGA Helm deployment

OpenFGA runs in `kloudlab-identity`, uses the private identity RDS PostgreSQL
instance, and is reconciled by management-hosted Argo CD. AWS Systems Manager
Parameter Store holds the pre-shared token and PostgreSQL URI. External Secrets
Operator (ESO) reads only the OpenFGA parameter path through EKS Pod Identity
and creates the Kubernetes Secrets consumed by the Helm release.

## Secret contract

Create these `SecureString` parameters in `ap-south-1`:

| Parameter | Kubernetes target |
| --- | --- |
| `/kloudlab/dev/identity/openfga/auth-token` | `kloudlab-openfga-auth`, keys `keys` and `token` |
| `/kloudlab/dev/identity/openfga/datastore-uri` | `kloudlab-openfga-datastore`, key `uri` |

The auth token is mapped to both keys because OpenFGA expects `keys`, while the
API uses the same value as its bearer token. The database URI should point to
the `openfga` database and use RDS TLS, for example
`postgresql://openfga:<password>@<rds-endpoint>:5432/openfga?sslmode=require`.
Do not put secret values in Git, Helm values, Pulumi outputs, or shell history.

The identity-cluster Pulumi stack creates the `external-secrets` Pod Identity
role and association. Its IAM policy permits SSM reads only below
`/kloudlab/dev/identity/openfga/`. The ESO Helm Application installs the CRDs
and controller; the parameter-store Application creates a namespaced
`SecretStore` and two `ExternalSecret` resources.

## Setup and sync

Create the two `SecureString` parameters using a protected local shell:

```bash
export AWS_PROFILE=kloudlab
export AWS_REGION=ap-south-1
read -rsp 'OpenFGA pre-shared token: ' OPENFGA_TOKEN
printf '\n'
aws ssm put-parameter \
  --name /kloudlab/dev/identity/openfga/auth-token \
  --type SecureString --overwrite \
  --key-id alias/kloudlab-identity-ssm \
  --value "$OPENFGA_TOKEN" \
  --region "$AWS_REGION" --profile "$AWS_PROFILE"
unset OPENFGA_TOKEN
```

Construct the datastore URI from the existing bootstrap Secret without printing
the password or URI:

```bash
secret_value() {
  kubectl --context kloudlab-identity -n kloudlab-identity \
    get secret kloudlab-identity-db-bootstrap \
    -o "jsonpath={.data.$1}" | base64 --decode
}

PGHOST="$(secret_value PGHOST)"
OPENFGA_DB_PASSWORD="$(secret_value OPENFGA_DB_PASSWORD)"
DATASTORE_URI="postgresql://openfga:${OPENFGA_DB_PASSWORD}@${PGHOST}:5432/openfga?sslmode=require"
aws ssm put-parameter \
  --name /kloudlab/dev/identity/openfga/datastore-uri \
  --type SecureString --overwrite \
  --key-id alias/kloudlab-identity-ssm \
  --value "$DATASTORE_URI" \
  --region ap-south-1 --profile kloudlab
unset OPENFGA_DB_PASSWORD DATASTORE_URI
```

After Pulumi creates the role and association, sync `kloudlab-external-secrets`
from Argo CD and wait for it to become healthy. The old Infisical resources
currently own the OpenFGA Kubernetes Secrets, so remove that old secret-sync
Application and its Secrets before creating the replacements:

```bash
argocd app delete kloudlab-openfga-secrets --cascade --yes
kubectl --context kloudlab-identity -n kloudlab-identity \
  delete secret kloudlab-openfga-auth kloudlab-openfga-datastore \
  --ignore-not-found
```

Then sync the remaining Applications in order:

1. `kloudlab-identity-parameter-store`
2. `openfga`

Confirm the generated Secrets and ExternalSecret conditions before syncing
OpenFGA:

```bash
kubectl --context kloudlab-identity -n kloudlab-identity \
  get secret kloudlab-openfga-auth kloudlab-openfga-datastore
kubectl --context kloudlab-identity -n kloudlab-identity \
  get externalsecrets.external-secrets.io
```

The OpenFGA chart runs database migrations as a pre-install/pre-upgrade Job.
Keep the OpenFGA API private; do not expose it to browsers. See the identity
rollout runbook for endpoint, TLS, and cross-VPC prerequisites.

Once OpenFGA is healthy, remove the retired Infisical and Valkey applications:

```bash
argocd app delete kloudlab-infisical-server --cascade --yes
argocd app delete kloudlab-infisical-secrets-operator --cascade --yes
argocd app delete kloudlab-valkey --cascade --yes
kubectl --context kloudlab-identity -n kloudlab-identity \
  delete secret infisical-machine-identity infisical-secrets kloudlab-valkey-auth \
  --ignore-not-found
```
