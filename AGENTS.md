# KloudLab: handoff for people and AI agents

Read this first. It holds the target, the flow, the live state and the
open work, so anyone can pick the work up mid-way. Keep it current:
every change that alters the state or the plan updates this file in
the same commit.

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
  charts.yaml                    ApplicationSet: every */app.yaml below
  manifests.yaml                 ApplicationSet: every */manifests/ below
clusters/<cluster>/<namespace>/<service>/
  app.yaml                       repo, chart, version (Helm services)
  values.yaml                    values for that chart, nothing else
  manifests/                     plain YAML instead of a chart
```

- One folder = one Argo Application named `<service>-<cluster>`,
  project `<cluster>`, deployed to cluster `<cluster>`, namespace
  `<namespace>`. Add a service by adding a folder; nothing else.
- Upstream charts only, used as they are, configured by `values.yaml`.
  No wrapper or umbrella charts, no looping generator charts.
- Folder names are intents (`openfga`, `monitoring`), not tools.
- Automated sync with self-heal; never automated prune. Deleting a
  folder removes the Application but keeps what it deployed.
- New chart repo: add it to that cluster's AppProject `sourceRepos`.
- Pin chart versions in `app.yaml`; check the upstream release page
  before choosing one.

The old `gitops/` and `charts/` folders are being migrated into this
layout one service at a time, then removed.

## Secrets

Never in Git. For this POC they are Kubernetes Secrets created once
by hand (random values, never printed), referenced by name:

| Secret | Namespace, cluster | Keys | Used by |
| --- | --- | --- | --- |
| `cloudflare-dns-api-token` | cert-manager, external-dns on management and app | `api-token` | DNS-01, external-dns |
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
- Argo CD runs on management (installed with Helm by hand), no
  Applications yet.
- kgateway runs on app (`kgateway-system`), installed by hand.
- Nothing yet on observability.

## Open work, in order

1. Done: Cloudflare token Secret in management and app.
2. Commit and push the new layout (`AGENTS.md`, `argocd/`,
   `clusters/`, `Makefile`).
3. Create the OpenFGA Secrets, then apply `argocd/root.yaml`; check
   `postgres-kloudlab-app` and `openfga-kloudlab-app` are Healthy.
4. Migrate each existing service into `clusters/`, upstream charts,
   latest checked versions: Argo CD itself, cert-manager (+ issuer,
   certificate), kgateway (CRDs, controller, gateways),
   AWS Load Balancer Controller, external-dns (Cloudflare). Then
   remove `charts/` and `gitops/`.
5. Observability stack, then the KloudLab API and frontend, then
   Karpenter on app.
6. Update ADRs and runbooks to three clusters.

## Decisions (POC)

- OpenFGA on `kloudlab-app`, datastore: one in-cluster Postgres
  (`postgres:17.11-alpine`, 10 GiB encrypted gp3, Retain) instead of
  RDS.
- Secrets as hand-made Kubernetes Secrets instead of SSM + ESO.
- Argo discovery by two plain ApplicationSets (git files and
  directories generators) instead of app-of-apps charts.
- Public EKS endpoints open to all; tighten before anything real.

## Rules for agents

- Never print, commit or paste a secret; no `.env` or token files in
  the repo.
- Preview before every change: `pulumi preview`, `helm template`, the
  Argo diff. Infrastructure changes go through Pulumi, not the
  console or the AWS CLI (if you must, set Pulumi config to match).
- Update this file with every change of state or plan.
