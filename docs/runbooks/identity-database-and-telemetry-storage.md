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
does not export that password. The master account is for bootstrap/admin use;
Infisical and OpenFGA must receive separate database accounts with only their
own database privileges before their Argo applications are synced. Their
connection credentials belong in Infisical, not Git.

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
uses a short-lived Job to create separate `infisical` and `openfga` roles and
databases. The Job reads its credentials from the Kubernetes Secret
`kloudlab-identity-db-bootstrap`; that Secret is bootstrap input and must not be
committed to Git.

Commit and push the identity database-bootstrap chart, Application, Valkey
chart/Application, values, and AppProject changes. Argo CD discovers both leaf
Applications; they remain manually synced. In one terminal, load the RDS
endpoint and generate the dev service credentials. Keep this terminal open
until the Infisical bootstrap Secret is created:

```bash
cd ~/Documents/kloudlab/infra/stacks/database-identity
export PGHOST="$(pulumi stack output databaseAddress)"
cd ~/Documents/kloudlab

read -rsp 'RDS master password: ' RDS_MASTER_PASSWORD
printf '\n'
export INFISICAL_DB_PASSWORD="$(openssl rand -hex 32)"
export OPENFGA_DB_PASSWORD="$(openssl rand -hex 32)"
export VALKEY_PASSWORD="$(openssl rand -hex 32)"
export INFISICAL_ENCRYPTION_KEY="$(openssl rand -hex 16)"
export INFISICAL_AUTH_SECRET="$(openssl rand -base64 32)"
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
            "INFISICAL_DB_PASSWORD", "OPENFGA_DB_PASSWORD",
        )
    }),
    secret("kloudlab-valkey-auth", {"default": os.environ["VALKEY_PASSWORD"]}),
]
print(json.dumps({"apiVersion": "v1", "kind": "List", "items": items}))
PY
unset RDS_MASTER_PASSWORD PGPASSWORD
```

In Argo CD, sync `kloudlab-valkey` and
`kloudlab-identity-database-bootstrap`. Confirm the Valkey pod is Ready and the
database bootstrap Job completed successfully before continuing. The Job
creates each app role as the owner of only its own database and removes the
default public `CONNECT` access from those two databases.

After Valkey is ready, check its Service name:

```bash
kubectl --context kloudlab-identity -n kloudlab-identity get service
```

Set `VALKEY_HOST` to the Service name shown above (without the namespace), then
create Infisical's initial Secret. Use `SITE_URL=http://localhost:8080` until
the Infisical HTTPS hostname is configured; port-forward its Service when
opening the UI locally.

```bash
export VALKEY_HOST=kloudlab-valkey
export SITE_URL=http://localhost:8080

python3 - <<'PY' | kubectl --context kloudlab-identity -n kloudlab-identity apply -f -
import base64, json, os

values = {
    "DB_CONNECTION_URI": (
        f"postgresql://infisical:{os.environ['INFISICAL_DB_PASSWORD']}@"
        f"{os.environ['PGHOST']}:5432/infisical?sslmode=require"
    ),
    "REDIS_URL": (
        f"redis://default:{os.environ['VALKEY_PASSWORD']}@"
        f"{os.environ['VALKEY_HOST']}.kloudlab-identity.svc.cluster.local:6379"
    ),
    "ENCRYPTION_KEY": os.environ["INFISICAL_ENCRYPTION_KEY"],
    "AUTH_SECRET": os.environ["INFISICAL_AUTH_SECRET"],
    "SITE_URL": os.environ["SITE_URL"],
}
secret = {
    "apiVersion": "v1",
    "kind": "Secret",
    "metadata": {"name": "infisical-secrets", "namespace": "kloudlab-identity"},
    "type": "Opaque",
    "data": {k: base64.b64encode(v.encode()).decode() for k, v in values.items()},
}
print(json.dumps(secret))
PY
```

Once that Secret exists, sync `kloudlab-infisical-server`.

After Infisical is up, store the OpenFGA database password and preshared auth
key in Infisical and let the Secrets Operator create `kloudlab-openfga-auth`
and `kloudlab-openfga-datastore`. Then sync the `openfga` Application. Do not
put any of these credentials in the Git repository.
