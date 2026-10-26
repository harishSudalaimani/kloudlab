export type ComponentCategory =
  | 'Infrastructure'
  | 'Compute'
  | 'Gateway'
  | 'Data'
  | 'Identity'
  | 'Observability'
  | 'Security'

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

const name = { type: 'string', title: 'Name', pattern: '^.{1,80}$' } satisfies ConfigProperty
const region = { type: 'string', title: 'Region', enum: ['ap-south-1', 'ap-southeast-1', 'us-east-1', 'eu-west-1'] } satisfies ConfigProperty

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

  definition('postgresql', 'PostgreSQL', 'Durable relational data store for application or identity services.', 'Data', 'PG', '#407f91', {
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
]

export const catalogById = new Map(catalog.map((component) => [component.typeId, component]))
export const categories: ComponentCategory[] = ['Infrastructure', 'Compute', 'Gateway', 'Data', 'Identity', 'Observability', 'Security']

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
      defaults[key] = ''
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
