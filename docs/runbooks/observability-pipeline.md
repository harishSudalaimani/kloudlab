# OpenTelemetry collection and backend

**Status:** Helm and Argo CD definitions are in Git; no clusters or telemetry
services have been deployed or validated yet.

KloudLab uses the open-source OpenTelemetry Collector Contrib, Prometheus,
Loki, Tempo, and Grafana stack. Loki and Tempo store data in S3. Prometheus
uses encrypted EBS volumes for its active time series. Telemetry is collected,
processed, stored, and queried by these OSS workloads; there is no AWS-managed
observability backend in this design.

## Signal paths

| Scope | Metrics | Logs | Traces |
| --- | --- | --- | --- |
| Go API | OTLP/HTTP request metrics and SQL pool/query metrics | Structured JSON stdout parsed by the node agent into OTLP logs | OTLP/HTTP HTTP server, Auth0/OpenFGA HTTP client, and PostgreSQL spans |
| OpenFGA | /metrics scraped by the cluster Collector and forwarded as OTLP | JSON stdout parsed by the node agent | OpenFGA OTLP/gRPC to the in-cluster node agent |
| Pods and nodes in each EKS cluster | Collector host metrics and kubelet stats | Pod/container logs plus /var/log/messages and /var/log/secure when present on the node AMI | App traces are forwarded by the node agent |
| Kubernetes cluster state | k8s_cluster, annotated pod Prometheus endpoints, and API-server /metrics | Kubernetes events through the Kubernetes Objects receiver | — |
| EKS managed control plane | API-server /metrics when EKS endpoint access and RBAC allow it | Not available to in-cluster OSS collectors | EKS does not export application trace spans |

Each of the four clusters has an OpenTelemetry Collector Contrib DaemonSet for
node, kubelet, and container signals and a single-replica cluster collector
for Kubernetes state, events, annotated pod metrics, and API-server metrics.
JSON request logs are parsed and their trace_id and span_id fields become
native OpenTelemetry log context.

The Go API exports OTLP/HTTP to the in-cluster agent at
http://otel-node-agent.opentelemetry.svc.cluster.local:4318. OpenFGA exports
OTLP/gRPC to the same cluster-local Service. The API's startup configuration
and all standard slog records stay as structured JSON on stdout; do not log
tokens, request bodies, SQL parameter values, or secret material.

This is the intended collection path, not a live end-to-end deployment yet.
The API SDK is instrumented in Go but its OTLP environment variables are not
currently wired by an API Helm Application, and there is no frontend Helm
Application or browser telemetry SDK. Until those workloads and settings are
added, app-level API and frontend signals will not be emitted in EKS. Pod logs
from any deployed workload can still be collected by the node agent.

The OpenFGA chart enables JSON logs, OTLP traces, and RPC histograms. Its
Prometheus endpoint is discovered from pod annotations by the cluster
Collector. See [OpenFGA telemetry settings](https://github.com/openfga/openfga/blob/main/.config-schema.json).

## Central observability cluster

kloudlab-observability runs an authenticated TLS OTLP gateway, Prometheus,
Loki, monolithic Tempo, and Grafana as Helm releases. Tempo runs as one
replica without Kafka, stores trace blocks in S3, and keeps its WAL on a 10 GiB
encrypted gp3 volume with a seven-day retention period. The gateway sends
metrics to its Prometheus exporter endpoint, which Prometheus scrapes through a
ServiceMonitor. It sends logs to Loki's native OTLP HTTP endpoint and traces to Tempo over
OTLP/gRPC at `tempo-monolithic.observability.svc.cluster.local:4317`. Grafana
queries Tempo at `tempo-monolithic.observability.svc.cluster.local:3200` and
has Prometheus, Loki, and Tempo datasources with trace-to-log navigation
configured. Grafana is exposed through the observability cluster's
internet-facing kgateway NLB at `monitoring.kloudlab.in` and
`grafana.kloudlab.in`.

Telemetry application releases pin the OpenTelemetry Helm chart and Contrib
image. The node and cluster collectors send OTLP over TLS with a gateway token.
The connectivity Pulumi stack adds direct routes from app, identity, and
management VPCs to observability. Remote collectors can use the central
gateway after that stack is deployed and the gateway endpoint, DNS, TLS, and
security-group rules are configured.
The API and OpenFGA send telemetry only to the cluster-local Collector Service.

## Required infrastructure and secret prerequisites

Argo CD creates the child Applications, but sync must wait for these resources:

1. Implement EKS clusters and the required API-server endpoint reachability.
   The EKS Pulumi component is currently only a contract.
2. Deploy the network-connectivity stack to add private routes from app,
   identity, and management VPCs to observability. Provision an internal NLB
   path and private DNS for the OTel gateway, then allow only required OTLP
   ports from the peer VPCs. The AWS Load Balancer Controller must be installed
   in the observability cluster.
3. Sync kloudlab-otel-gateway-server-tls with tls.crt and tls.key, and
   kloudlab-otel-gateway-server with token in the observability namespace.
   Sync kloudlab-otel-gateway-client with endpoint and token in each
   collector namespace. For remote clusters, the endpoint must resolve
   privately and match the TLS certificate. Deliver values from SSM Parameter
   Store through ESO; never commit them.
4. Create encrypted S3 buckets named kloudlab-observability-loki and
   kloudlab-observability-tempo, lifecycle/retention policies, and EKS
   workload identities scoped to those buckets. Replace the example bucket
   names with the actual Pulumi outputs before syncing the charts. Loki keeps
   30 days of logs and Tempo keeps 7 days of traces in these chart values.
5. Install the EKS-managed EBS CSI add-on through Pulumi, then sync the Argo
   `kloudlab-storage` application for its encrypted gp3 StorageClass before
   Prometheus and Loki. Create kloudlab-grafana-admin with admin-user and
   admin-password keys. Grafana remains ClusterIP-only.
6. Configure the API workload with the in-cluster OTLP/HTTP endpoint,
   OTEL_SERVICE_NAME=kloudlab-api, OTEL_RESOURCE_ATTRIBUTES containing
   environment and cluster, and resource limits. Ensure app deployments and
   the collector share the namespace DNS and network policy permits the
   collector Service.

The EKS component and gp3 StorageClass chart are defined in the repository;
EBS CSI, S3 buckets, workload identity associations, and telemetry services
must still be provisioned and verified in AWS before they are usable. These
Helm definitions do not imply that live telemetry is already flowing.

## Collection limits to validate

- AWS manages the EKS control-plane hosts. Without an AWS-side log export,
  in-cluster collectors cannot read the API, audit, authenticator,
  controller-manager, or scheduler host logs. This design intentionally does
  not collect those logs.
- The cluster Collector scrapes API-server /metrics where EKS endpoint access
  and its service-account RBAC permit it. This does not expose every internal
  scheduler or controller-manager metric.
- The node agent tails /var/log/messages and /var/log/secure where those
  files exist. EKS node AMI log paths differ; Bottlerocket needs a journald
  capable collector image or another supported source. Validate the chosen AMI
  and remove any host log path that contains data KloudLab should not retain.
- OpenTelemetry log collection is configured at the collector layer. App logs
  remain JSON stdout; the collector transforms them into OTLP before Loki.
- Set sampling, cardinality, ingestion budgets, and retention from observed
  traffic before production. The initial replica counts and storage sizes are
  starting values, not capacity guarantees.

## Rollout order

1. Finish EKS, S3/EBS, the VPC peering routes, internal gateway endpoint, DNS,
   and certificates in Pulumi;
   verify every dependency and permission.
2. Bootstrap Argo CD directly with Helm and connect clusters one at a time with
   restricted credentials.
3. On the observability cluster's turn, add Prometheus, Loki, Tempo, Grafana,
   and the OTLP gateway as individual Applications.
4. Add node agents and cluster collectors one cluster at a time after the
   observability gateway is reachable.
5. Configure API and OpenFGA telemetry endpoints and resource attributes.
6. Verify all available signal paths, OpenFGA metrics, API-server metrics, and
   log/trace correlation. Add dashboards and alerts for ingestion failures,
   app latency/errors, database/OpenFGA health, node pressure, pod restarts,
   API-server health, and collector/backend capacity.
7. Confirm tokens, personal data, request bodies, SQL parameters, and secrets
   are excluded from telemetry. Test backup/restore and retention before
   production.
