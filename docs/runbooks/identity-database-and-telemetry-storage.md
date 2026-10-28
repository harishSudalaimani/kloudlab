# Identity database and telemetry storage

Pulumi owns the private RDS PostgreSQL instance and the S3 buckets plus EKS Pod
Identity roles used by Loki and Tempo. Argo CD continues to own Kubernetes
applications.

## Identity PostgreSQL

The `database-identity` stack creates one private PostgreSQL 17 RDS instance in
the identity VPC's private subnets. Its security group allows TCP/5432 only from
the identity EKS cluster security group. It has encrypted gp3 storage, seven
days of automated backups, deletion protection, and no public endpoint.

For the dev stack the instance class is `db.t4g.medium` and Multi-AZ is off to
control cost. Set `instanceClass` to an appropriate production size and
`multiAZ` to `true` when the environment and budget are ready for database HA.

The stack uses a Pulumi secret config value for the RDS master password and
does not export that password. The master account is for bootstrap/admin use.
The database-bootstrap Job creates a separate `openfga` account with access
only to its database. OpenFGA's connection URI is stored as an SSM
`SecureString`, not in Git.

From the repository root, initialize and preview the stack:

```bash
cd ~/Documents/kloudlab/infra/stacks/database-identity
export AWS_PROFILE=kloudlab
export AWS_REGION=ap-south-1
pulumi stack init dev --secrets-provider='awskms://alias/kloudlab-pulumi-state?region=ap-south-1'
```

If the stack already exists, select it instead of initializing it:

```bash
pulumi stack select dev
```

Set the master password without placing it directly in the command history:

```bash
read -rsp 'RDS master password: ' DB_MASTER_PASSWORD
printf '\n'
pulumi config set --secret kloudlab-database:masterPassword "$DB_MASTER_PASSWORD"
unset DB_MASTER_PASSWORD
pulumi preview
```

Review the plan and then deploy:

```bash
pulumi up
```

The connection address, port, and database name are non-secret outputs:

```bash
pulumi stack output
```

Keep the entered master password in the approved secret bootstrap process. Do
not use the RDS master account as an application account.

## Loki and Tempo S3 storage

The `storage-observability` stack creates two separate private buckets:

- `kloudlab-observability-loki`, expiring current and old object versions after
  30 days.
- `kloudlab-observability-tempo`, expiring current and old object versions after
  7 days.

Both buckets have public access blocked, server-side encryption, versioning,
incomplete multipart upload cleanup, deletion protection, and a bucket policy requiring TLS. Loki's
role can access only its logs bucket; Tempo's role can access only its traces
bucket. Each role is trusted only by the matching service account in the
observability cluster through EKS Pod Identity.

The Loki and Tempo values files set those service account names explicitly so
they match the Pod Identity associations.

```bash
cd ~/Documents/kloudlab/infra/stacks/storage-observability
export AWS_PROFILE=kloudlab
export AWS_REGION=ap-south-1
pulumi stack init dev --secrets-provider='awskms://alias/kloudlab-pulumi-state?region=ap-south-1'
```

If the stack already exists, select it:

```bash
pulumi stack select dev
```

Then preview and deploy after reviewing the bucket names and IAM permissions:

```bash
pulumi preview
pulumi up
```

Confirm the resources and outputs:

```bash
pulumi stack output
AWS_PROFILE=kloudlab aws eks list-pod-identity-associations \
  --cluster-name kloudlab-observability \
  --region ap-south-1 \
  --output table
```

## Before syncing identity applications

The RDS stack creates the PostgreSQL server, initial `kloudlab` database, and
admin account. The `kloudlab-identity-database-bootstrap` Argo CD Application
uses a short-lived Job to create the `openfga` role and database. The Job reads
its credentials from `kloudlab-identity-db-bootstrap`; that Secret is
bootstrap input and must not be committed to Git.

Commit and push the identity database-bootstrap chart, Application, values,
External Secrets Operator chart/Application, SSM resources, and AppProject
changes. Argo CD discovers the leaf Applications; they remain manually synced.
Load the RDS endpoint and generate the OpenFGA database password locally:

```bash
cd ~/Documents/kloudlab/infra/stacks/database-identity
export PGHOST="$(pulumi stack output databaseAddress)"
cd ~/Documents/kloudlab

read -rsp 'RDS master password: ' RDS_MASTER_PASSWORD
printf '\n'
export OPENFGA_DB_PASSWORD="$(openssl rand -hex 32)"
export PGPORT=5432 PGUSER=kloudlab_admin PGDATABASE=kloudlab
export PGPASSWORD="$RDS_MASTER_PASSWORD"

python3 - <<'PY' | kubectl --context kloudlab-identity -n kloudlab-identity apply -f -
import base64, json, os

def secret(name, values):
    return {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {"name": name, "namespace": "kloudlab-identity"},
        "type": "Opaque",
        "data": {k: base64.b64encode(v.encode()).decode() for k, v in values.items()},
    }

items = [
    secret("kloudlab-identity-db-bootstrap", {
        k: os.environ[k] for k in (
            "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE",
            "OPENFGA_DB_PASSWORD",
        )
    }),
]
print(json.dumps({"apiVersion": "v1", "kind": "List", "items": items}))
PY
unset RDS_MASTER_PASSWORD PGPASSWORD
```

In Argo CD, sync `kloudlab-identity-database-bootstrap` and confirm its Job
completed successfully. It creates the OpenFGA role as owner of the OpenFGA
database and removes default public `CONNECT` access. Create the SSM parameters
and sync ESO, the parameter-store Application, then OpenFGA as shown in
`docs/runbooks/openfga-helm.md`.
