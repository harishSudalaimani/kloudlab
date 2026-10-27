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

This RDS stack creates the private database server and its admin account. The
identity deployment still needs a GitOps-managed database bootstrap step that
creates distinct `infisical` and `openfga` databases/users. Do that before
syncing either application. Infisical also needs a Redis-compatible endpoint
(Valkey is the planned self-hosted choice) and its initial `infisical-secrets`
Secret. OpenFGA credentials should then be synchronized from Infisical into
`kloudlab-openfga-auth` and `kloudlab-openfga-datastore`.

Do not sync the Infisical or OpenFGA leaf Applications until those prerequisites
exist. The existing Argo CD Applications can be created first and synced
individually after bootstrap is complete.
