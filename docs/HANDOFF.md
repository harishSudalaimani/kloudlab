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

## Frontend playground

For an account without a saved local draft, the playground starts with an
editable end-to-end view of KloudLab's GitHub CI, API/frontend image builds,
ECR publishing, GitOps tag commit and Argo CD rollout; Pulumi-managed VPCs,
peering, EKS and IAM; Cloudflare DNS and DNS-01 TLS; all three EKS clusters,
application services, and the observability pipeline. It distinguishes the
versioned, KMS-encrypted Pulumi state bucket from Loki/Tempo S3 storage, and
shows the KloudLab API and OpenFGA PostgreSQL links. An older starter with the
same components and connections upgrades on open, carrying over changed
component settings; structurally edited drafts remain as saved. **New
architecture** starts with a blank canvas.

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

`.github/workflows/network-preview.yml` is a manually dispatched Pulumi
preview for the app, observability, and management VPCs. Its optional
connectivity preview assumes all three network stacks exist; it never applies
changes. The connectivity config excludes the retired identity VPC.

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

The current cluster services are declared in this layout. Legacy
`gitops/` and `charts/` content remains in the repository for cleanup;
the presence of those folders does not make them the active source of
the current service Applications.

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
- The application-controller ServiceAccount in `argocd` on management
  receives `kloudlab-management-argocd-controller` through EKS Pod
  Identity. That role can assume only the app and observability deployer
  roles and call `eks:DescribeCluster` for those two clusters. Each target
  deployer role trusts that management role and is registered as an EKS
  access entry with `AmazonEKSClusterAdminPolicy` at cluster scope.
- The remote cluster Secrets are live Kubernetes Secrets, not manifests
  in this repo. Their AWS auth config should name the target cluster and
  deployer role; record/recreate them during management-cluster recovery.
  The management cluster's own Secret is declarative in
  `argocd/apps/clusters.yaml` and uses the in-cluster ServiceAccount.

## Live state (Wed 2026-10-28)

- All 3 clusters ACTIVE, nodes Ready; add-ons: vpc-cni, coredns,
  kube-proxy, metrics-server, pod identity agent, EBS CSI.
- Argo CD on management (installed with Helm by hand). The recorded live
  bootstrap was from commit 07bd3aa, which had two ApplicationSets
  (`charts`, `manifests`). The current `main` tree has the unified
  `services` ApplicationSet. Since `root` has pruning disabled, verify
  whether the old ApplicationSets still exist in the live cluster and
  remove them manually if they do; do not assume Git deletion pruned them.
- OpenFGA on app: Postgres and the `openfga-migrate` Job run, but the
  OpenFGA pods' `wait-for-migration` init container uses the default
  ServiceAccount and gets Forbidden reading that Job. The current Git
  target includes an `openfga` ServiceAccount and narrowly scoped Role;
  confirm that Argo has synced the fix and that the Application is Healthy.
- Public hostnames (kgateway Gateway per cluster, one cert-manager
  DNS-01 certificate per Gateway, records by external-dns, all via
  Cloudflare):
  - management: `argocd.kloudlab.in`
  - app: `kloudlab.in`, `www.kloudlab.in` (frontend),
    `api.kloudlab.in` (API)
  - observability: `grafana.kloudlab.in` and `monitoring.kloudlab.in`
    (aliases on one AWS load balancer)
  Prometheus, Loki, Tempo, OpenTelemetry and OpenFGA stay internal.
- kgateway runs on app (`kgateway-system`), installed by hand.
- Management, app and observability each have a Gateway and certificate
  application. Check current status in Argo; the Grafana and observability
  OTel certificates are Ready in the live observability cluster.
- Live GatewayClass, Gateway, and HTTPRoute conditions are Accepted,
  Programmed, and ResolvedRefs=True in all three clusters. NLB Services
  exist and direct HTTPS probes return 200 for Argo CD and the app, and 302
  for Grafana (login redirect). Cloudflare DNS currently resolves
  `argocd.kloudlab.in`, `kloudlab.in`, and `grafana.kloudlab.in`; it has no
  record for `monitoring.kloudlab.in`. Local GitOps now adds that Grafana
  alias and its certificate SAN; this change still needs a commit and push.

## Current blockers (2026-10-28)

- A Cloudflare API token was pasted into chat; rotate it and keep the
  replacement out of Git and chat. The Grafana and OTel certificates in
  the observability cluster are currently Ready.
- Observability uses `t3.medium` nodes (17 pod slots each); all
  nodes Ready, untainted, and without MemoryPressure or DiskPressure.
  Loki's Memcached caches are disabled in local values. Tempo's optional
  Memcached cache is also disabled locally to free a pod slot on the node
  that blocks the OTel node-agent DaemonSet; Tempo queries may be slower.
  Argo automated pruning is off, so sync the Tempo application with prune
  once to remove its existing Memcached pod. No node-agent target is
  excluded: it should keep collecting from every node.
- The Grafana Gateway and route are live and their references resolve. The
  local GitOps change adds `monitoring.kloudlab.in` as a Grafana alias; it
  must be pushed before ExternalDNS can publish it and cert-manager can add
  it to the certificate. The OTel gateway
  certificate is Ready in `observability`, but its pods run in
  `opentelemetry` and cannot mount a Secret across namespaces. The local
  GitOps fix creates the namespace first and adds a second Certificate
  in `opentelemetry`, while keeping the existing Certificate in
  `observability` tracked because Argo pruning is disabled. This fix is
  not yet pushed.
- Tempo's distributed chart starts its supporting components, but the
  distributor fails because Tempo 3 microservices mode requires a configured
  Kafka-compatible ingest topic. The earlier claim that disabling the
  block-builder and live-store preserved the old ingester path was incorrect.
  GitOps now switches to the single-binary `tempo` chart (3.2.1 / Tempo 3.1.1)
  for this low-volume POC, keeps the same S3 bucket and Pod Identity service
  account, and stores the WAL on encrypted gp3. The OTel and Grafana endpoints
  point to `tempo-monolithic`. After the Argo app updates, sync it with prune
  enabled to remove the old distributed workloads; confirm the new pod is
  Healthy and traces can be queried in Grafana.
- OpenFGA pods' `wait-for-migration` init container uses the `default`
  ServiceAccount and gets Forbidden when reading Job `openfga-migrate`.
  The local GitOps change adds an order-3 ServiceAccount and a Role limited
  to `get` on that Job, and configures the chart to use that account. This
  change is not yet synced. OpenFGA requests 100m CPU/128Mi memory and
  limits 1 CPU/512Mi; resource pressure is not its current failure.
- OTel gateway requests 250m CPU/512Mi memory and limits 1 CPU/1Gi per
  replica. Its pod was crashing because `service.telemetry.metrics` had
  an empty `readers` list, which the Collector rejects; local values now
  set its internal telemetry level to `none` while retaining the metrics
  data pipeline and Prometheus exporter. OTel node agents request 100m
  CPU/256Mi and limit memory to 512Mi; check the DaemonSet after pruning
  Tempo's Memcached resources.
- For the low-volume POC, local GitOps values now reduce the API,
  frontend, OpenFGA, Tempo distributor and OTel gateway to one replica
  each, and disable Loki's two Memcached caches. Core behavior remains;
  these services no longer have a spare replica for node failures or
  rollouts, and Loki queries may be slower. This change has not yet been
  pushed. Because Argo automated pruning is disabled, sync the Loki app
  once with `--prune` to remove the existing cache workloads.
- Previously observed AWS CNI IP allocation errors are not represented
  in the current pod states; EBS CSI node pods are Running on all
  nodes. Recheck CNI logs if IP assignment failures recur.
- Application rollout order is now an `order` field consumed by
  ApplicationSet `RollingSync`; the old `# order` comments were ignored.
- The three cluster-collector pipelines now reference the chart preset's
  `k8sobjects` receiver. The chart preset supplies its receiver config;
  keep the pipeline receiver ID in sync with that preset. Their inbound
  ports are disabled, so their chart Service is disabled too.
- The three node-agent metrics pipelines use the chart preset receiver
  IDs `hostmetrics` and `kubeletstats`; the running agents still need to
  be reconciled to this config.
- Gateway Secret references specify the core API group as `group: ""`
  so the desired manifest matches the live API representation. HTTPS
  listeners retain `tls.mode: Terminate`.
- Healthy but OutOfSync Gateway HTTPRoutes and PostgreSQL StatefulSets
  had Kubernetes-defaulted fields missing from Git. Local manifests now
  declare those defaults explicitly, including route parent/backend kinds,
  default path matches and weights, and StatefulSet PVC retention policy.
  The two live PostgreSQL StatefulSets also contain a controller-populated
  PVC template GVK and `status` under `spec`; their manifests now declare
  the GVK and ignore only that generated status field during Argo comparison.

## Open work, in order

1. Done: Cloudflare token Secret in the `cert-manager` and
   `external-dns` namespaces on all three clusters; OpenFGA
   Secrets; layout committed and pushed (07bd3aa); root applied.
2. Fix OpenFGA until `openfga-kloudlab-app` is Healthy.
3. Verify the live `root` has picked up the current `services.yaml`
   ApplicationSet. Remove any surviving old `charts` and `manifests`
   ApplicationSets by hand because root pruning is disabled; check that
   no duplicate Applications remain.
4. Compare the current `clusters/` desired state against live health,
   especially the known OpenFGA, Tempo, OTel, and pruning follow-ups below.
5. Remove obsolete `charts/` and `gitops/` content after confirming no
   active Application still references it.
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
  `.github/workflows/images.yml` builds and publishes ECR images on push,
  then promotes each successful build's short-SHA tag independently to its
  GitOps deployment manifest. Stale push builds are skipped and GitOps push
  races are retried. Argo CD deploys that Git commit. Deployed in namespace
  `kloudlab` on app (`clusters/kloudlab-app/kloudlab/`): api,
  api-postgres, frontend; routes `kloudlab.in` (frontend),
  `www.kloudlab.in` (301 to apex), `api.kloudlab.in` (API).
- Placeholders to replace: `OPENFGA_STORE_ID` and
  `OPENFGA_AUTHORIZATION_MODEL_ID` (create the store and upload
  `apps/api/internal/authorization/model.fga`).
- Live app check (2026-10-28): the Auth0 API `KloudLab-API` now uses
  `https://api.kloudlab.in` as its Identifier. The API ConfigMap and frontend
  image build use this as their audience. Authorize the `KloudLab` SPA for
  user-delegated access in the Auth0 API's Application Access tab. The frontend
  Docker build and CI fail if required build values are missing. The dedicated
  Pulumi stack now manages ECR publishing role
  `arn:aws:iam::481665121849:role/kloudlab-dev-github-ecr-publisher`; set the
  GitHub variable `AWS_ECR_PUBLISH_ROLE_ARN` to this ARN. GitHub Actions also
  needs repository contents write permission to commit updated tags; Argo CD
  then deploys the new SHA-tagged ECR images. See
  [`docs/runbooks/ecr-image-publishing.md`](runbooks/ecr-image-publishing.md).
- Secrets in `kloudlab` (hand-made): `kloudlab-api-postgres`
  (`password`), `kloudlab-api` (`database-url`, `openfga-api-token`).

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
- Tempo is configured in monolithic mode for this low-volume POC; Tempo 3
  microservices mode requires Kafka. The one-replica deployment shares CPU and
  memory across ingest and query work, so move back to microservices with a
  Kafka-compatible backend if the workload or availability needs grow.

- App image packages are published to ECR as `main` and short-SHA tags.
  EKS worker node roles provide image pull access.
- Grafana's local GitOps config provisions five focused dashboards from stable,
  labelled ConfigMaps: `KloudLab API` for HTTP and database health,
  `KloudLab Kubernetes` for cross-cluster node and pod health,
  `KloudLab Workloads` for namespace/pod resource drilldown,
  `KloudLab Logs` for scoped service logs, and `KloudLab Traces` for API and
  cross-service Tempo searches. Logs and traces have their own dashboards so
  the metrics views stay easier to scan. Grafana's
  dashboard sidecar watches only the `observability` namespace. The dashboard
  Application is order 5, after Grafana at order 4. Commit 47db1fb is synced;
  all five dashboard ConfigMaps are present and the Grafana sidecar wrote each
  dashboard file and received HTTP 200 when reloading provisioning. The current
  Grafana pod is Ready with the sidecar. Initially the panels were empty because
  collectors could not export all three signals. The cause was the
  gateway Service's old `external-dns.alpha.kubernetes.io/*` annotations:
  ExternalDNS 0.22.0 uses `external-dns.kubernetes.io/` by default and no longer
  reads the old prefix. Public DNS returned NXDOMAIN for `otel.kloudlab.in`.
  The GitOps fix uses the current ExternalDNS annotation prefix, and ExternalDNS
  created an unproxied CNAME to the internal NLB. The app VPC resolver still
  returned a cached NXDOMAIN for the A lookup, although the CNAME and NLB
  hostname resolve publicly and the app cluster can connect to NLB port 4317.
  To restore exports while that negative cache expires, the three client Secrets
  now point to the NLB's AWS DNS hostname; collector exporters set TLS
  `server_name_override: otel.kloudlab.in` to validate the existing certificate.
  The NLB hostname is tied to the current Service load balancer; refresh the
  Secret endpoints if the load balancer is recreated. After commit f808d48, all
  six collector Applications are Synced and Healthy. Live checks now find API
  request and cluster metrics in Prometheus, API logs in Loki, and API traces in
  Tempo. Grafana's cluster logs panel had a separate Loki parser error because
  the cluster variable's All value was `.*`; commit 84cd6ac changes it to `.+`.
  The dashboard Application is Synced and Healthy, and the sidecar reloaded the
  updated ConfigMap with HTTP 200. Dashboard-only changes do not match the
  current GitHub Actions path filters; Argo CD is the deployer. API HTTP metrics
  use OTel's Prometheus name translation; the Kubernetes dashboard filters
  cluster metric labels from the OTel resource attributes.

## Gaps found while migrating

Most migration values below were not rendered against their upstream charts.
The pinned Grafana chart values were checked for the dashboard sidecar
settings, but `helm template` could not reach the chart repository because
workspace DNS resolution is blocked. Gaps:

- AWS Load Balancer Controller is in all three clusters, but no
  cluster has its IAM role yet: add a Pod Identity role per cluster
  in Pulumi (policy from `scripts/vendor-aws-load-balancer-controller-policy.sh`,
  service account `kube-system/aws-load-balancer-controller`). Until
  then no Gateway gets an AWS load balancer.
- Secrets now in place (hand-made): Cloudflare token in the
  `cert-manager` and `external-dns` namespaces on all three clusters,
  `kloudlab-grafana-admin` (user `admin`), `kloudlab-otel-gateway-server`
  (token) on observability, `kloudlab-otel-gateway-client` (endpoint
  `k8s-opentele-otelgate-fbc6d7fa80-0d44af39e22d09f9.elb.ap-south-1.amazonaws.com:4317`,
  same token) on all three. Update the endpoint if the gateway Service is
  recreated.
- `kloudlab-otel-gateway-server-tls` comes from cert-manager
  (Let's Encrypt, `otel.kloudlab.in`). The gateway Service publishes
  `otel.kloudlab.in` as an unproxied CNAME to its internal load balancer via
  ExternalDNS; collectors reach it over VPC peering. ExternalDNS 0.22.0 uses
  the `external-dns.kubernetes.io/` annotation prefix.
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

- No Makefile is maintained; use package scripts and native Go/Helm commands.
- Never print, commit or paste a secret; no `.env` or token files in
  the repo.
- Preview before every change: `pulumi preview`, `helm template`, the
  Argo diff. Infrastructure changes go through Pulumi, not the
  console or the AWS CLI (if you must, set Pulumi config to match).
- Update this file with every change of state or plan.
