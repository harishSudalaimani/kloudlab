# KloudLab: handoff for people and AI agents

Read this first. It holds the target, the flow, the live state and the
open work, so anyone can pick the work up mid-way. Keep it current:
every change that alters the state or the plan updates this file in
the same commit. `AGENTS.md` only points here.

## Goal

Showcase a production-grade EKS setup with minimal tools and sound
security, hosted at `kloudlab.in` (DNS on Cloudflare). POC sizing,
but no shortcuts that a reviewer would call insecure without saying
so here.

## Clusters (ap-south-1, EKS 1.36)

| Cluster | Runs |
| --- | --- |
| `kloudlab-management` | Argo CD (manages all three), cert-manager, gateway |
| `kloudlab-app` | the KloudLab app (API, frontend), OpenFGA, Karpenter |
| `kloudlab-observability` | OpenTelemetry, Prometheus, Loki, Tempo, Grafana |

There is no identity cluster any more: OpenFGA moved to `kloudlab-app`.
ADRs and runbooks under `docs/` still describe four clusters; update
them as each part changes.

Infrastructure (VPCs, peering, EKS, IAM) is Pulumi Go under `infra/`
(state in `s3://kloudlab-pulumi-state`). Kubernetes workloads are
GitOps only: never `helm install` or `kubectl apply` by hand, except
the one bootstrap object below and Secrets.

## GitOps flow

```
argocd/root.yaml                 applied once by hand on management
argocd/apps/                     synced by root
  projects.yaml                  one AppProject per cluster
  clusters.yaml                  names the in-cluster as kloudlab-management
  services.yaml                  ApplicationSet: every */app.yaml below
clusters/<cluster>/<namespace>/<service>/
  app.yaml                       type, sync (+ repo, chart, version)
  values.yaml                    type chart: values for it, nothing else
  manifests/                     type manifests: plain YAML
```

`app.yaml` fields: `type: chart` (with `repo`, `chart`, `version`) or
`type: manifests`; `sync: auto` (Argo syncs) or `sync: manual` (Argo
shows the diff only); and numeric `order`. `services` labels generated
Applications with `order` and uses ApplicationSet `RollingSync`: each
order group syncs after the previous group is Healthy. Keep every app
in an order group so RollingSync does not leave it unsynced.

- One folder = one Argo Application named `<service>-<cluster>`,
  project `<cluster>`, deployed to cluster `<cluster>`, namespace
  `<namespace>`. Add a service by adding a folder; nothing else.
- Upstream charts only, used as they are, configured by `values.yaml`.
  No wrapper or umbrella charts, no looping generator charts.
- Folder names are intents (`openfga`, `monitoring`), not tools.
- Self-heal on `sync: auto`; never automated prune. Deleting a
  folder removes the Application but keeps what it deployed.
- New chart repo: add it to that cluster's AppProject `sourceRepos`.
- Pin chart versions in `app.yaml`; check the upstream release page
  before choosing one.

The old `gitops/` and `charts/` folders are being migrated into this
layout, then removed.

## Secrets

Never in Git. For this POC they are Kubernetes Secrets created once
by hand (random values, never printed), referenced by name:

| Secret | Namespace, cluster | Keys | Used by |
| --- | --- | --- | --- |
| `cloudflare-dns-api-token` | `cert-manager` and `external-dns` namespaces on all three clusters | `api-token` | DNS-01, external-dns |
| `openfga-auth` | openfga on app | `keys` | OpenFGA preshared auth, API token |
| `openfga-postgres` | openfga on app | `password`, `uri` | Postgres, OpenFGA datastore |

Production path (not built): SSM Parameter Store and External
Secrets Operator with EKS Pod Identity (ADR 0008).

## Access

- Cluster API endpoints are public, open to `0.0.0.0/0` for the POC
  (IAM auth still required). Pulumi stack configs must match, else
  `pulumi up` reverts it:
  `pulumi config set --path 'kloudlab-cluster:publicAccessCidrs[0]' 0.0.0.0/0`
  in each `infra/stacks/cluster-*` (after `pulumi config rm` of the
  old list).
- kubeconfig: `aws eks update-kubeconfig --name <cluster>
  --region ap-south-1 --alias <cluster>`.
- Argo CD reaches app and observability through IAM deployer roles
  (`kloudlab-<cluster>-argocd-deployer`), registered as cluster
  secrets `cluster-kloudlab-app` and `cluster-kloudlab-observability`.

## Live state (Wed 2026-10-28)

- All 3 clusters ACTIVE, nodes Ready; add-ons: vpc-cni, coredns,
  kube-proxy, metrics-server, pod identity agent, EBS CSI.
- Argo CD on management (installed with Helm by hand). `root` applied
  from commit 07bd3aa (two ApplicationSets `charts`, `manifests`).
- OpenFGA on app: Postgres runs. OpenFGA's migrate Job (PreSync
  hook) failed: ServiceAccount `openfga` did not exist yet. Fix in the
  next commit: `serviceAccount.create: false`; after the push delete
  Job `openfga-migrate` so Argo retries. OutOfSync apps are expected
  for now.
- Public hostnames (kgateway Gateway per cluster, one cert-manager
  DNS-01 certificate per Gateway, records by external-dns, all via
  Cloudflare):
  - management: `argocd.kloudlab.in`
  - app: `kloudlab.in`, `www.kloudlab.in` (frontend),
    `api.kloudlab.in` (API)
  - observability: `grafana.kloudlab.in` (adds a third AWS load
    balancer)
  Prometheus, Loki, Tempo, OpenTelemetry and OpenFGA stay internal.
- kgateway runs on app (`kgateway-system`), installed by hand.
- Management, app and observability currently each have a Gateway and
  certificate application. Their TLS certificate issuance is blocked;
  see the current blockers below.

## Current blockers (2026-10-28)

- Gateway certificates are not Ready. The `argocd` Gateway reports
  `ResolvedRefs=False`; its Certificate is waiting for the missing TLS
  Secret. The Grafana and public Gateways also report unresolved TLS
  references. Check each ClusterIssuer, CertificateRequest, Order and
  Challenge, plus the Cloudflare token Secret in `cert-manager`, before
  changing ACME configuration. Secret values stay out of Git.
- Application rollout order is now an `order` field consumed by
  ApplicationSet `RollingSync`; the old `# order` comments were ignored.
- The three cluster-collector pipelines now reference the chart preset's
  `k8sobjects` receiver. The chart preset supplies its receiver config;
  keep the pipeline receiver ID in sync with that preset.
- The three node-agent metrics pipelines now use the chart preset receiver
  IDs `hostmetrics` and `kubeletstats`; the underscore variants were not
  configured receivers in this chart.
- Gateway Secret references specify the core API group as `group: ""`
  so the desired manifest matches the live API representation. HTTPS
  listeners retain `tls.mode: Terminate`.

## Open work, in order

1. Done: Cloudflare token Secret in the `cert-manager` and
   `external-dns` namespaces on all three clusters; OpenFGA
   Secrets; layout committed and pushed (07bd3aa); root applied.
2. Fix OpenFGA until `openfga-kloudlab-app` is Healthy.
3. Next commit, all in one: replace `argocd/apps/charts.yaml` and
   `manifests.yaml` by `services.yaml` (delete both in the same
   commit, else two ApplicationSets make the same Application),
   `sync:` and `type:` in every `app.yaml`, the migrated services
   below, this file.
4. Migrated services (`sync: manual`, synced later by hand): Argo CD
   itself, cert-manager (+ issuer, certificate), kgateway (CRDs,
   controller, gateways), AWS Load Balancer Controller, external-dns
   (Cloudflare), OpenTelemetry, Prometheus, Loki, Tempo, Grafana.
   Then remove `charts/` and `gitops/`.
5. The KloudLab API and frontend, then Karpenter on app.
6. Update ADRs and runbooks to three clusters.

## End to end (commit after a59503f)

- Every service is `sync: auto`; ApplicationSet `RollingSync` advances
  in numeric `order` groups and waits for each group to become Healthy.
  Nothing was rendered before; real failures stay to fix.
- Load balancer controller IAM: `infra/components/iam/load_balancer_controller.go`
  (role, upstream policy v3.6.1 in `infra/components/iam/policies/`,
  Pod Identity for `kube-system/aws-load-balancer-controller`), called
  from `cluster-program`; applied with `pulumi up --target` on the 3
  cluster stacks.
- Cloudflare: external-dns runs with `--cloudflare-proxied` on all
  clusters (orange cloud); `otel.kloudlab.in` is DNS only (annotation
  on the otel-gateway Service). Zone SSL mode must be Full (strict).
- App: `apps/api/Dockerfile`, `apps/frontend/Dockerfile`, workflow
  `.github/workflows/images.yml` builds `ghcr.io/harishsudalaimani/
  kloudlab-{api,frontend}:main` on push. Deployed in namespace
  `kloudlab` on app (`clusters/kloudlab-app/kloudlab/`): api,
  api-postgres, frontend; routes `kloudlab.in` (frontend),
  `www.kloudlab.in` (301 to apex), `api.kloudlab.in` (API).
- Placeholders to replace: Auth0 (`AUTH0_ISSUER`, `AUTH0_AUDIENCE` in
  the api ConfigMap; repository variables `VITE_AUTH0_DOMAIN`,
  `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` for the frontend
  build), `OPENFGA_STORE_ID`, `OPENFGA_AUTHORIZATION_MODEL_ID` (create
  the store and upload `apps/api/internal/authorization/model.fga`).
- Secrets in `kloudlab` (hand-made): `kloudlab-api-postgres`
  (`password`), `kloudlab-api` (`database-url`, `openfga-api-token`),
  `ghcr-pull` (dockerconfigjson for ghcr.io, token with
  `read:packages`).

- Karpenter on app: Pulumi `infra/components/iam/karpenter.go`
  (queue `kloudlab-app-karpenter`, node role
  `kloudlab-app-karpenter-node`, controller role with Pod Identity);
  GitOps `clusters/kloudlab-app/kube-system/karpenter` (chart 1.8.1,
  check latest) and `karpenter-nodepool` (AL2023, spot + on-demand,
  t/m/c medium-xlarge, max 16 vCPU). Controller IAM is POC-broad;
  tighten to the upstream conditions.

- `root` syncs with prune off, so deleting a file under `argocd/apps/`
  leaves its object in the cluster: delete it by hand (the old
  `charts` and `manifests` ApplicationSets were removed with
  `--cascade=orphan` so `services` adopts their Applications).
- Tempo (`tempo-distributed` 3.17.0): `blockBuilder` and `liveStore`
  are off (they need Kafka); traces use the ingester path.

- App images: ECR repos `kloudlab-api` and `kloudlab-frontend`
  (created with the AWS CLI, not yet in Pulumi), built on an operator
  machine with `docker buildx --platform linux/amd64` and pushed as
  `:main` and `:<short sha>`. The GHCR workflow's frontend build
  failed; move the workflow to ECR with GitHub OIDC to drop the
  local build.

## Gaps found while migrating

Unchecked against the real charts (no render was run). Gaps:

- AWS Load Balancer Controller is in all three clusters, but no
  cluster has its IAM role yet: add a Pod Identity role per cluster
  in Pulumi (policy from `scripts/vendor-aws-load-balancer-controller-policy.sh`,
  service account `kube-system/aws-load-balancer-controller`). Until
  then no Gateway gets an AWS load balancer.
- Secrets now in place (hand-made): Cloudflare token in the
  `cert-manager` and `external-dns` namespaces on all three clusters,
  `kloudlab-grafana-admin` (user `admin`), `kloudlab-otel-gateway-server`
  (token) on observability, `kloudlab-otel-gateway-client` (endpoint
  `otel.kloudlab.in:4317`, same token) on all three.
- `kloudlab-otel-gateway-server-tls` comes from cert-manager
  (Let's Encrypt, `otel.kloudlab.in`). `otel.kloudlab.in` must point to
  the gateway's internal load balancer (external-dns or a record by
  hand) and the collectors reach it over VPC peering.
- Loki and Tempo: the `storage-observability` Pulumi stack makes the
  S3 buckets and Pod Identity roles; check it is deployed.
- kgateway charts come from the Helm OCI registry `cr.kgateway.dev`,
  declared in `argocd/apps/repositories.yaml`.
- Adopting live installs: Argo CD (`fullnameOverride: argocd`
  assumes the hand install used release `argocd`) and the hand-made
  kgateway on app: compare the diff before the first sync.
- Check: argo-cd `server.insecure`, kgateway keys vs chart v2.4.3,
  the ALB controller image tag override, empty ACME email,
  cert-manager reduced to `crds.enabled: true`, external-dns
  `txtOwnerId: <cluster>`, otel-gateway `loadBalancerSourceRanges`
  (still four old /16s; three VPCs now).
- The old Prune=false/Delete=false on the Gateway API CRDs is not
  per app any more; no auto-prune and preserveResourcesOnDeletion
  cover most of it.

## Decisions (POC)

- OpenFGA on `kloudlab-app`, datastore: one in-cluster Postgres
  (`postgres:17.11-alpine`, 10 GiB encrypted gp3, Retain) instead of
  RDS.
- Secrets as hand-made Kubernetes Secrets instead of SSM + ESO.
- Argo discovery by one plain ApplicationSet (git files generator on
  `app.yaml`) instead of app-of-apps charts.
- Public EKS endpoints open to all; tighten before anything real.

## Rules for agents

- Never print, commit or paste a secret; no `.env` or token files in
  the repo.
- Preview before every change: `pulumi preview`, `helm template`, the
  Argo diff. Infrastructure changes go through Pulumi, not the
  console or the AWS CLI (if you must, set Pulumi config to match).
- Update this file with every change of state or plan.
