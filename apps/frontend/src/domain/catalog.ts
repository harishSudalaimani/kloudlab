export type ComponentCategory =
  | 'Infrastructure'
  | 'Compute'
  | 'Networking'
  | 'Gateway'
  | 'Service Mesh'
  | 'Application Platform'
  | 'GitOps'
  | 'CI/CD'
  | 'Source Control'
  | 'Artifact Registry'
  | 'Database'
  | 'Messaging'
  | 'Storage'
  | 'Identity'
  | 'Observability'
  | 'Security'

export type ComponentAvailability = 'open-source' | 'open-core' | 'cloud-hosting' | 'managed-service'

export type PortDirection = 'input' | 'output'

export interface ComponentPort {
  id: string
  direction: PortDirection
  connectionTypes: string[]
  required?: boolean
  multiple?: boolean
}

export interface ConfigProperty {
  type: 'string' | 'number' | 'boolean'
  title: string
  description?: string
  enum?: string[]
  minimum?: number
  maximum?: number
  pattern?: string
}

export interface ComponentDefinition {
  typeId: string
  version: string
  availability: ComponentAvailability
  displayName: string
  description: string
  category: ComponentCategory
  symbol: string
  accent: string
  configurationSchema: {
    type: 'object'
    properties: Record<string, ConfigProperty>
    required: string[]
    additionalProperties: false
  }
  ports: ComponentPort[]
  validationRules: { id: string; scope: 'configuration' | 'connection' | 'architecture'; severity: 'error' | 'warning'; message: string }[]
  documentation: string[]
  implementation?: { kind: 'pulumi-go' | 'kubernetes' | 'external'; reference: string; version: string }
}

function definition(
  typeId: string,
  displayName: string,
  description: string,
  category: ComponentCategory,
  symbol: string,
  accent: string,
  properties: Record<string, ConfigProperty>,
  required: string[],
  ports: ComponentPort[],
  validationRules: ComponentDefinition['validationRules'] = [],
  documentation: string[] = ['https://kloudlab.in/docs/components'],
  implementation?: ComponentDefinition['implementation'],
): ComponentDefinition {
  return {
    typeId,
    version: '1.0.0',
    availability: typeId === 'aws-vpc' || typeId === 'eks-cluster'
      ? 'cloud-hosting'
      : typeId === 'auth0'
        ? 'managed-service'
        : typeId === 'infisical'
          ? 'open-core'
          : 'open-source',
    displayName,
    description,
    category,
    symbol,
    accent,
    configurationSchema: { type: 'object', properties, required, additionalProperties: false },
    ports,
    validationRules,
    documentation,
    implementation,
  }
}

const categoryAccent: Record<ComponentCategory, string> = {
  Infrastructure: '#85a6cb', Compute: '#8d8be0', Networking: '#63b5b8', Gateway: '#e3a16f',
  'Service Mesh': '#a895df', 'Application Platform': '#81b995', GitOps: '#d38fa7', 'CI/CD': '#d6af6b',
  'Source Control': '#d18a76', 'Artifact Registry': '#b98ac9', Database: '#63b2bb', Messaging: '#d0a56f',
  Storage: '#91ae74', Identity: '#9b91da', Observability: '#77a9d7', Security: '#8eae6d',
}

function openSourceTool(
  typeId: string,
  displayName: string,
  description: string,
  category: ComponentCategory,
  symbol: string,
  ports: ComponentPort[],
  documentation: string,
): ComponentDefinition {
  return definition(typeId, displayName, description, category, symbol, categoryAccent[category], {
    name,
    namespace: { type: 'string', title: 'Namespace', pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' },
    replicas: { type: 'number', title: 'Replicas', minimum: 1, maximum: 100 },
    release: { type: 'string', title: 'Release or version', pattern: '^.{0,60}$' },
  }, ['name'], ports, [], [documentation])
}

const name = { type: 'string', title: 'Name', pattern: '^.{1,80}$' } satisfies ConfigProperty
const region = { type: 'string', title: 'Region', enum: ['ap-south-1', 'ap-southeast-1', 'us-east-1', 'eu-west-1'] } satisfies ConfigProperty

const flowPorts = (type: string): ComponentPort[] => [
  { id: 'input', direction: 'input', connectionTypes: [type] },
  { id: 'output', direction: 'output', connectionTypes: [type] },
]

const tool = (
  typeId: string,
  displayName: string,
  description: string,
  category: ComponentCategory,
  symbol: string,
  portType: string,
  documentation: string,
) => openSourceTool(typeId, displayName, description, category, symbol, flowPorts(portType), documentation)

const extendedCatalog: ComponentDefinition[] = [
  tool('opentofu', 'OpenTofu', 'Infrastructure as code for provisioning and managing cloud resources.', 'Infrastructure', 'TF', 'infrastructure', 'https://opentofu.org/docs/'),
  tool('crossplane', 'Crossplane', 'Compose infrastructure and platform APIs with Kubernetes.', 'Infrastructure', 'XP', 'infrastructure', 'https://docs.crossplane.io/'),
  tool('cilium', 'Cilium', 'Kubernetes networking, network policy, and eBPF observability.', 'Networking', 'CIL', 'network', 'https://docs.cilium.io/'),
  tool('calico', 'Calico', 'Kubernetes networking and network policy.', 'Networking', 'CAL', 'network', 'https://docs.tigera.io/calico/latest/about/'),
  tool('metallb', 'MetalLB', 'Load balancing for bare-metal Kubernetes clusters.', 'Networking', 'MLB', 'network', 'https://metallb.universe.tf/'),
  tool('coredns', 'CoreDNS', 'DNS server and service discovery for cloud-native environments.', 'Networking', 'DNS', 'network', 'https://coredns.io/manual/'),
  tool('external-dns', 'ExternalDNS', 'Synchronize Kubernetes services and ingress with DNS providers.', 'Networking', 'DNS', 'network', 'https://kubernetes-sigs.github.io/external-dns/'),
  tool('envoy-gateway', 'Envoy Gateway', 'Manage Envoy Proxy as a Kubernetes Gateway API implementation.', 'Gateway', 'EG', 'http', 'https://gateway.envoyproxy.io/docs/'),
  tool('traefik', 'Traefik Proxy', 'Cloud-native ingress and application proxy.', 'Gateway', 'TR', 'http', 'https://doc.traefik.io/traefik/'),
  tool('kong', 'Kong Gateway', 'API gateway for routing, security, and traffic management.', 'Gateway', 'KONG', 'http', 'https://docs.konghq.com/gateway/latest/'),
  tool('istio', 'Istio', 'Service mesh for traffic control, security, and telemetry.', 'Service Mesh', 'IST', 'workload', 'https://istio.io/latest/docs/'),
  tool('linkerd', 'Linkerd', 'Lightweight service mesh for Kubernetes workloads.', 'Service Mesh', 'LNK', 'workload', 'https://linkerd.io/2/overview/'),
  tool('kuma', 'Kuma', 'Service mesh for Kubernetes and virtual machine workloads.', 'Service Mesh', 'KMA', 'workload', 'https://kuma.io/docs/latest/'),
  tool('helm', 'Helm', 'Package and release manager for Kubernetes applications.', 'Application Platform', 'HELM', 'workload', 'https://helm.sh/docs/'),
  tool('kustomize', 'Kustomize', 'Customize Kubernetes resources without templates.', 'Application Platform', 'K', 'workload', 'https://kubectl.docs.kubernetes.io/references/kustomize/'),
  tool('keda', 'KEDA', 'Event-driven autoscaling for Kubernetes workloads.', 'Application Platform', 'KEDA', 'workload', 'https://keda.sh/docs/'),
  tool('knative', 'Knative', 'Building blocks for deploying and scaling serverless workloads.', 'Application Platform', 'KN', 'workload', 'https://knative.dev/docs/'),
  tool('dapr', 'Dapr', 'Portable APIs for building distributed applications.', 'Application Platform', 'DAPR', 'workload', 'https://docs.dapr.io/'),
  tool('backstage', 'Backstage', 'Developer portal for services, software templates, and documentation.', 'Application Platform', 'BK', 'workload', 'https://backstage.io/docs/'),
  tool('argocd', 'Argo CD', 'Declarative GitOps continuous delivery for Kubernetes.', 'GitOps', 'ARGO', 'git-source', 'https://argo-cd.readthedocs.io/'),
  tool('flux', 'Flux CD', 'GitOps toolkit for keeping Kubernetes clusters in sync.', 'GitOps', 'FLUX', 'git-source', 'https://fluxcd.io/flux/'),
  tool('tekton', 'Tekton', 'Kubernetes-native building blocks for CI/CD pipelines.', 'CI/CD', 'TEK', 'workflow', 'https://tekton.dev/docs/'),
  tool('jenkins', 'Jenkins', 'Automation server for building, testing, and delivering software.', 'CI/CD', 'J', 'workflow', 'https://www.jenkins.io/doc/'),
  tool('argo-workflows', 'Argo Workflows', 'Container-native workflow engine for Kubernetes.', 'CI/CD', 'AW', 'workflow', 'https://argo-workflows.readthedocs.io/'),
  tool('buildkit', 'BuildKit', 'Efficient, portable toolkit for building container images.', 'CI/CD', 'BKIT', 'artifact', 'https://github.com/moby/buildkit'),
  tool('forgejo', 'Forgejo', 'Self-hosted code collaboration and Git service.', 'Source Control', 'FJ', 'git-source', 'https://forgejo.org/docs/latest/'),
  tool('gitea', 'Gitea', 'Lightweight self-hosted Git service and development platform.', 'Source Control', 'GT', 'git-source', 'https://docs.gitea.com/'),
  tool('harbor', 'Harbor', 'Store, sign, scan, and distribute container images and artifacts.', 'Artifact Registry', 'HBR', 'artifact', 'https://goharbor.io/docs/'),
  tool('zot', 'Zot Registry', 'Vendor-neutral OCI image and artifact registry.', 'Artifact Registry', 'ZOT', 'artifact', 'https://zotregistry.io/'),
  tool('mysql', 'MySQL', 'Relational database for transactional applications.', 'Database', 'SQL', 'database', 'https://dev.mysql.com/doc/'),
  tool('mariadb', 'MariaDB', 'Community-developed relational database server.', 'Database', 'MDB', 'database', 'https://mariadb.com/kb/en/documentation/'),
  tool('valkey', 'Valkey', 'Open-source in-memory data structure store.', 'Database', 'VK', 'database', 'https://valkey.io/topics/'),
  tool('clickhouse', 'ClickHouse', 'Column-oriented database for real-time analytics.', 'Database', 'CH', 'database', 'https://clickhouse.com/docs/'),
  tool('cassandra', 'Apache Cassandra', 'Distributed wide-column database for high availability.', 'Database', 'CAS', 'database', 'https://cassandra.apache.org/doc/latest/'),
  tool('nats', 'NATS', 'Messaging system for cloud-native and distributed applications.', 'Messaging', 'NATS', 'messaging', 'https://docs.nats.io/'),
  tool('rabbitmq', 'RabbitMQ', 'Message broker supporting reliable application messaging.', 'Messaging', 'RMQ', 'messaging', 'https://www.rabbitmq.com/docs'),
  tool('kafka', 'Apache Kafka', 'Distributed event streaming platform.', 'Messaging', 'KAF', 'messaging', 'https://kafka.apache.org/documentation/'),
  tool('ceph', 'Ceph', 'Unified distributed storage for object, block, and file data.', 'Storage', 'CEPH', 'storage', 'https://docs.ceph.com/en/latest/'),
  tool('longhorn', 'Longhorn', 'Distributed block storage for Kubernetes.', 'Storage', 'LH', 'storage', 'https://longhorn.io/docs/'),
  tool('rook', 'Rook', 'Cloud-native storage orchestration for Kubernetes.', 'Storage', 'ROOK', 'storage', 'https://rook.io/docs/rook/latest/'),
  tool('openebs', 'OpenEBS', 'Container-attached storage for Kubernetes.', 'Storage', 'OE', 'storage', 'https://openebs.io/docs/'),
  tool('minio', 'MinIO', 'S3-compatible object storage for cloud-native environments.', 'Storage', 'MIN', 'storage', 'https://min.io/docs/minio/kubernetes/upstream/'),
  tool('keycloak', 'Keycloak', 'Identity and access management with single sign-on and OIDC.', 'Identity', 'KC', 'identity', 'https://www.keycloak.org/documentation'),
  tool('dex', 'Dex', 'OpenID Connect identity service for other applications.', 'Identity', 'DEX', 'identity', 'https://dexidp.io/docs/'),
  tool('ory-kratos', 'Ory Kratos', 'Identity management for registration, login, and account recovery.', 'Identity', 'OK', 'identity', 'https://www.ory.sh/docs/kratos/'),
  tool('authelia', 'Authelia', 'Identity and access gateway with multi-factor authentication.', 'Identity', 'AUTH', 'identity', 'https://www.authelia.com/overview/introduction/'),
  tool('alertmanager', 'Alertmanager', 'Group, route, and manage alerts from Prometheus.', 'Observability', 'AM', 'telemetry', 'https://prometheus.io/docs/alerting/latest/alertmanager/'),
  tool('jaeger', 'Jaeger', 'Distributed tracing platform for monitoring service requests.', 'Observability', 'JAE', 'telemetry', 'https://www.jaegertracing.io/docs/'),
  tool('victoriametrics', 'VictoriaMetrics', 'Time-series monitoring and metrics storage.', 'Observability', 'VM', 'telemetry', 'https://docs.victoriametrics.com/'),
  tool('fluent-bit', 'Fluent Bit', 'Lightweight processor and forwarder for logs and telemetry.', 'Observability', 'FB', 'telemetry', 'https://docs.fluentbit.io/manual/'),
  tool('opensearch', 'OpenSearch', 'Search, analytics, and observability platform.', 'Observability', 'OS', 'telemetry', 'https://docs.opensearch.org/latest/'),
  tool('openbao', 'OpenBao', 'Secrets management for infrastructure and applications.', 'Security', 'BAO', 'security', 'https://openbao.org/docs/'),
  tool('external-secrets', 'External Secrets Operator', 'Synchronize secrets from external systems into Kubernetes.', 'Security', 'ESO', 'security', 'https://external-secrets.io/latest/'),
  tool('kyverno', 'Kyverno', 'Policy engine for validating, mutating, and generating Kubernetes resources.', 'Security', 'KYO', 'security', 'https://kyverno.io/docs/'),
  tool('opa-gatekeeper', 'OPA Gatekeeper', 'Policy enforcement for Kubernetes using Open Policy Agent.', 'Security', 'OPA', 'security', 'https://open-policy-agent.github.io/gatekeeper/website/docs/'),
  tool('falco', 'Falco', 'Runtime threat detection for cloud-native systems.', 'Security', 'FAL', 'security', 'https://falco.org/docs/'),
  tool('trivy', 'Trivy', 'Scanner for vulnerabilities, misconfigurations, and software artifacts.', 'Security', 'TRV', 'security', 'https://trivy.dev/latest/docs/'),
  tool('cert-manager', 'cert-manager', 'Automated certificate issuance and renewal for Kubernetes.', 'Security', 'CERT', 'security', 'https://cert-manager.io/docs/'),
]

export const catalog: ComponentDefinition[] = [
  definition('aws-vpc', 'Amazon VPC', 'Isolated network boundary for cloud resources.', 'Infrastructure', 'VPC', '#5f7f6b', {
    name,
    cidr: { type: 'string', title: 'IPv4 CIDR', pattern: '^([0-9]{1,3}\\.){3}[0-9]{1,3}/([0-9]|[1-2][0-9]|3[0-2])$' },
    region,
    availabilityZones: { type: 'number', title: 'Availability zones', minimum: 2, maximum: 6 },
  }, ['name', 'cidr', 'region', 'availabilityZones'], [
    { id: 'network', direction: 'output', connectionTypes: ['network'] },
  ], [
    { id: 'vpc.cidr', scope: 'configuration', severity: 'error', message: 'Use a valid IPv4 network range.' },
  ], ['https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html'], { kind: 'pulumi-go', reference: 'components/network', version: '1.0.0' }),

  definition('eks-cluster', 'Amazon EKS', 'Managed Kubernetes control plane with private worker subnets.', 'Compute', 'EKS', '#447eb4', {
    name,
    region,
    kubernetesVersion: { type: 'string', title: 'Kubernetes version', enum: ['1.34', '1.33', '1.32'] },
    apiAccess: { type: 'string', title: 'API endpoint', enum: ['Private', 'Private and public'] },
    availabilityZones: { type: 'number', title: 'Availability zones', minimum: 2, maximum: 6 },
  }, ['name', 'region', 'kubernetesVersion', 'apiAccess', 'availabilityZones'], [
    { id: 'network', direction: 'input', connectionTypes: ['network'], required: true, multiple: false },
    { id: 'workloads', direction: 'output', connectionTypes: ['workload'] },
    { id: 'telemetry', direction: 'output', connectionTypes: ['telemetry'] },
  ], [
    { id: 'eks.multi-az', scope: 'configuration', severity: 'error', message: 'Production clusters need at least two availability zones.' },
  ], ['https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html'], { kind: 'pulumi-go', reference: 'components/eks', version: '1.0.0' }),

  definition('kubernetes-workload', 'Kubernetes workload', 'Application or platform service running in a cluster.', 'Compute', 'APP', '#7b70b2', {
    name,
    namespace: { type: 'string', title: 'Namespace', pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' },
    replicas: { type: 'number', title: 'Replicas', minimum: 1, maximum: 100 },
    exposure: { type: 'string', title: 'Exposure', enum: ['Private', 'Gateway'] },
  }, ['name', 'namespace', 'replicas', 'exposure'], [
    { id: 'cluster', direction: 'input', connectionTypes: ['workload'], required: true, multiple: false },
    { id: 'http', direction: 'input', connectionTypes: ['http'], multiple: false },
    { id: 'oidc', direction: 'input', connectionTypes: ['oidc'] },
    { id: 'identity', direction: 'input', connectionTypes: ['identity-decision'] },
    { id: 'authorization', direction: 'output', connectionTypes: ['authorization-check'] },
    { id: 'telemetry', direction: 'output', connectionTypes: ['telemetry'] },
  ], [
    { id: 'workload.private', scope: 'configuration', severity: 'warning', message: 'Prefer private service exposure unless a gateway is required.' },
  ], ['https://kubernetes.io/docs/concepts/workloads/']),

  definition('kgateway', 'Gateway', 'Routes approved HTTP traffic to application services.', 'Gateway', 'GW', '#d27f4d', {
    name,
    hostname: { type: 'string', title: 'Hostname', pattern: '^[a-zA-Z0-9.-]+$' },
    exposure: { type: 'string', title: 'Exposure', enum: ['Public', 'Private'] },
    tls: { type: 'string', title: 'TLS', enum: ['Managed certificate', 'Bring your own'] },
  }, ['name', 'hostname', 'exposure', 'tls'], [
    { id: 'cluster', direction: 'input', connectionTypes: ['workload'], required: true, multiple: false },
    { id: 'service', direction: 'output', connectionTypes: ['http'] },
  ], [
    { id: 'gateway.tls', scope: 'configuration', severity: 'error', message: 'Public routes must use TLS.' },
  ], ['https://gateway-api.sigs.k8s.io/']),

  definition('postgresql', 'PostgreSQL', 'Durable relational data store for application or identity services.', 'Database', 'PG', '#407f91', {
    name,
    engine: { type: 'string', title: 'Engine', enum: ['PostgreSQL 17', 'PostgreSQL 16'] },
    exposure: { type: 'string', title: 'Network access', enum: ['Private only'] },
    backupDays: { type: 'number', title: 'Backup retention (days)', minimum: 1, maximum: 35 },
  }, ['name', 'engine', 'exposure', 'backupDays'], [
    { id: 'database', direction: 'output', connectionTypes: ['database'] },
  ], [
    { id: 'database.private', scope: 'configuration', severity: 'error', message: 'Database endpoints must stay private.' },
  ], ['https://www.postgresql.org/docs/']),

  definition('auth0', 'Auth0', 'External identity provider for user authentication and OIDC tokens.', 'Identity', 'ID', '#b65f74', {
    name,
    domain: { type: 'string', title: 'Tenant domain', pattern: '^[a-zA-Z0-9.-]+$' },
    audience: { type: 'string', title: 'API audience' },
    flow: { type: 'string', title: 'Protocol', enum: ['OpenID Connect'] },
  }, ['name', 'domain', 'audience', 'flow'], [
    { id: 'oidc', direction: 'output', connectionTypes: ['oidc'] },
  ], [], ['https://auth0.com/docs/']),

  definition('openfga', 'OpenFGA', 'Relationship-based authorization service for application resources.', 'Identity', 'FGA', '#c17b4b', {
    name,
    datastore: { type: 'string', title: 'Datastore', enum: ['PostgreSQL'] },
    endpoint: { type: 'string', title: 'Endpoint', enum: ['Private service'] },
    modelVersion: { type: 'string', title: 'Authorization model', pattern: '^.{1,80}$' },
  }, ['name', 'datastore', 'endpoint', 'modelVersion'], [
    { id: 'database', direction: 'input', connectionTypes: ['database'], required: true, multiple: false },
    { id: 'check', direction: 'input', connectionTypes: ['authorization-check'], required: true },
    { id: 'decision', direction: 'output', connectionTypes: ['identity-decision'] },
  ], [
    { id: 'openfga.private', scope: 'configuration', severity: 'error', message: 'Keep OpenFGA on a private endpoint.' },
  ], ['https://openfga.dev/docs']),

  definition('otel-collector', 'OpenTelemetry Collector', 'Receives and routes metrics, logs, and traces.', 'Observability', 'OTEL', '#6b7fbd', {
    name,
    mode: { type: 'string', title: 'Deployment mode', enum: ['Gateway', 'Agent'] },
    protocol: { type: 'string', title: 'OTLP transport', enum: ['gRPC', 'HTTP'] },
    authentication: { type: 'string', title: 'Receiver access', enum: ['Authenticated', 'Private network'] },
  }, ['name', 'mode', 'protocol', 'authentication'], [
    { id: 'telemetry', direction: 'input', connectionTypes: ['telemetry'], required: true },
    { id: 'metrics', direction: 'output', connectionTypes: ['metrics'] },
    { id: 'logs', direction: 'output', connectionTypes: ['logs'] },
    { id: 'traces', direction: 'output', connectionTypes: ['traces'] },
  ], [
    { id: 'otel.auth', scope: 'configuration', severity: 'warning', message: 'Authenticate collector receivers before accepting remote telemetry.' },
  ], ['https://opentelemetry.io/docs/collector/']),

  definition('prometheus', 'Prometheus', 'Time-series metrics collection and querying.', 'Observability', 'P', '#d26951', {
    name,
    retention: { type: 'string', title: 'Retention', enum: ['7 days', '14 days', '30 days', '90 days'] },
    storage: { type: 'string', title: 'Storage', enum: ['Persistent volume', 'Object storage'] },
  }, ['name', 'retention', 'storage'], [
    { id: 'metrics', direction: 'input', connectionTypes: ['metrics'], required: true },
    { id: 'dashboard', direction: 'output', connectionTypes: ['observability-backend'] },
  ], [], ['https://prometheus.io/docs/introduction/overview/']),

  definition('loki', 'Loki', 'Log aggregation with label-based indexing.', 'Observability', 'L', '#7b69a5', {
    name,
    retention: { type: 'string', title: 'Retention', enum: ['7 days', '14 days', '30 days', '90 days'] },
    storage: { type: 'string', title: 'Storage', enum: ['Object storage'] },
  }, ['name', 'retention', 'storage'], [
    { id: 'logs', direction: 'input', connectionTypes: ['logs'], required: true },
    { id: 'dashboard', direction: 'output', connectionTypes: ['observability-backend'] },
  ], [], ['https://grafana.com/docs/loki/latest/']),

  definition('tempo', 'Tempo', 'Distributed tracing backend for OpenTelemetry traces.', 'Observability', 'T', '#4d8290', {
    name,
    retention: { type: 'string', title: 'Retention', enum: ['7 days', '14 days', '30 days', '90 days'] },
    storage: { type: 'string', title: 'Storage', enum: ['Object storage'] },
  }, ['name', 'retention', 'storage'], [
    { id: 'traces', direction: 'input', connectionTypes: ['traces'], required: true },
    { id: 'dashboard', direction: 'output', connectionTypes: ['observability-backend'] },
  ], [], ['https://grafana.com/docs/tempo/latest/']),

  definition('grafana', 'Grafana', 'Dashboards and alerts across approved observability sources.', 'Observability', 'G', '#d18c50', {
    name,
    access: { type: 'string', title: 'Access', enum: ['Private', 'Restricted'] },
    authentication: { type: 'string', title: 'Authentication', enum: ['OIDC'] },
  }, ['name', 'access', 'authentication'], [
    { id: 'sources', direction: 'input', connectionTypes: ['observability-backend'], required: true },
  ], [
    { id: 'grafana.restricted', scope: 'configuration', severity: 'error', message: 'Grafana must not be publicly unauthenticated.' },
  ], ['https://grafana.com/docs/grafana/latest/']),

  definition('infisical', 'Infisical', 'Central secrets management with scoped workload access.', 'Security', 'SEC', '#748b5a', {
    name,
    deployment: { type: 'string', title: 'Deployment', enum: ['Self-hosted', 'Managed'] },
    recovery: { type: 'string', title: 'Recovery path', enum: ['Independent backup'] },
    secretReference: { type: 'string', title: 'Reference example', description: 'A path or identifier only. Never enter secret values.' },
  }, ['name', 'deployment', 'recovery'], [
    { id: 'secrets', direction: 'output', connectionTypes: ['secrets'] },
  ], [
    { id: 'secrets.recovery', scope: 'configuration', severity: 'warning', message: 'Secrets management needs an independent recovery path.' },
  ], ['https://infisical.com/docs/documentation/getting-started/introduction']),
  ...extendedCatalog,
]

export const catalogById = new Map(catalog.map((component) => [component.typeId, component]))
export const categories = [...new Set(catalog.map((component) => component.category))].sort() as ComponentCategory[]

export function defaultConfig(component: ComponentDefinition, suffix = ''): Record<string, string | number | boolean> {
  const defaults: Record<string, string | number | boolean> = {}
  for (const [key, property] of Object.entries(component.configurationSchema.properties)) {
    if (key === 'name') {
      defaults[key] = `${component.displayName}${suffix ? ` ${suffix}` : ''}`
    } else if (property.enum?.length) {
      defaults[key] = property.enum[0]
    } else if (property.type === 'number') {
      defaults[key] = property.minimum ?? 1
    } else if (property.type === 'boolean') {
      defaults[key] = false
    } else {
      defaults[key] = key === 'namespace' ? 'platform' : ''
    }
  }
  if (component.typeId === 'aws-vpc') {
    defaults.cidr = '10.40.0.0/16'
    defaults.availabilityZones = 3
  }
  if (component.typeId === 'eks-cluster') {
    defaults.availabilityZones = 3
  }
  if (component.typeId === 'kubernetes-workload') {
    defaults.namespace = 'default'
    defaults.replicas = 2
  }
  if (component.typeId === 'kgateway') {
    defaults.hostname = 'app.example.com'
  }
  if (component.typeId === 'auth0') {
    defaults.domain = 'tenant.example.auth0.com'
    defaults.audience = 'https://api.example.com'
  }
  if (component.typeId === 'openfga') {
    defaults.modelVersion = 'v1'
  }
  if (component.typeId === 'postgresql') {
    defaults.backupDays = 7
  }
  if (component.typeId === 'infisical') {
    defaults.secretReference = 'platform/api/database'
  }
  return defaults
}
