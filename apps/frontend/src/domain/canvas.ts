import { catalogById, defaultConfig, type ComponentDefinition } from './catalog'
import { checkConnection, type ExistingConnection } from './connections'

export interface CanvasNodeDocument {
  id: string
  typeId: string
  componentVersion: string
  position: { x: number; y: number }
  config: Record<string, unknown>
}

export interface CanvasEdgeDocument {
  id: string
  source: string
  sourcePort: string
  target: string
  targetPort: string
}

export interface CanvasDocument {
  schemaVersion: '1.0.0'
  id: string
  name: string
  nodes: CanvasNodeDocument[]
  edges: CanvasEdgeDocument[]
  viewport?: { x: number; y: number; zoom: number }
}

export interface ValidationIssue {
  id: string
  severity: 'error' | 'warning' | 'info'
  message: string
  description?: string
  options?: string[]
  nodeId?: string
  edgeId?: string
}

export const STORAGE_KEY = 'kloudlab.canvas-library.v1'
export const ACTIVE_KEY = 'kloudlab.active-canvas.v1'
export const STARTER_CANVAS_ID = 'starter-kloudlab-platform-v3'

export function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function node(id: string, typeId: string, x: number, y: number, config: Record<string, unknown>): CanvasNodeDocument {
  const component = catalogById.get(typeId)
  if (!component) throw new Error(`Unknown catalog type: ${typeId}`)
  return { id, typeId, componentVersion: component.version, position: { x, y }, config }
}

function config(typeId: string, values: Record<string, unknown>): Record<string, unknown> {
  const component = catalogById.get(typeId)
  if (!component) throw new Error(`Unknown catalog type: ${typeId}`)
  return { ...defaultConfig(component), ...values }
}

export function createStarterCanvas(): CanvasDocument {
  const nodes = [
    node('repository', 'github', -500, -400, config('github', { name: 'github.com/harishSudalaimani/kloudlab' })),
    node('image-workflow', 'github-actions', -220, -400, config('github-actions', { name: 'Build images · update GitOps tags' })),
    node('ecr', 'amazon-ecr', 60, -400, config('amazon-ecr', { name: 'ECR · API and frontend images', region: 'ap-south-1' })),
    node('pulumi', 'pulumi', -500, -100, config('pulumi', { name: 'Pulumi Go · VPC, EKS, IAM' })),
    node('aws-provider', 'pulumi-aws-provider', -220, -100, config('pulumi-aws-provider', { name: 'AWS provider · ap-south-1' })),
    node('pulumi-state', 'aws-s3', 60, -100, config('aws-s3', { name: 'Pulumi state · versioned S3' })),
    node('pulumi-kms', 'aws-kms', 60, 160, config('aws-kms', { name: 'Pulumi state · KMS encryption' })),

    node('management-vpc', 'aws-vpc', 360, -560, config('aws-vpc', { name: 'Management VPC · 10.40.0.0/16', cidr: '10.40.0.0/16', region: 'ap-south-1', availabilityZones: 2 })),
    node('management-eks', 'eks-cluster', 360, -300, config('eks-cluster', { name: 'kloudlab-management', region: 'ap-south-1', kubernetesVersion: '1.36', apiAccess: 'Private and public', availabilityZones: 2 })),
    node('argocd', 'argocd', 640, -300, config('argocd', { name: 'Argo CD · deploys all three clusters' })),
    node('app-vpc', 'aws-vpc', 360, -40, config('aws-vpc', { name: 'App VPC · 10.10.0.0/16', cidr: '10.10.0.0/16', region: 'ap-south-1', availabilityZones: 2 })),
    node('app-eks', 'eks-cluster', 360, 220, config('eks-cluster', { name: 'kloudlab-app', region: 'ap-south-1', kubernetesVersion: '1.36', apiAccess: 'Private and public', availabilityZones: 2 })),
    node('frontend', 'kubernetes-workload', 920, 80, config('kubernetes-workload', { name: 'KloudLab frontend', namespace: 'kloudlab', replicas: 1 })),
    node('api', 'kubernetes-workload', 920, 340, config('kubernetes-workload', { name: 'KloudLab API', namespace: 'kloudlab', replicas: 1 })),
    node('openfga', 'openfga', 1200, 220, config('openfga', { name: 'OpenFGA · authorization', modelVersion: 'authorization model' })),
    node('api-postgres', 'postgresql', 1480, 80, config('postgresql', { name: 'KloudLab API PostgreSQL', engine: 'PostgreSQL 17', exposure: 'Private only', backupDays: 7 })),
    node('openfga-postgres', 'postgresql', 1480, 340, config('postgresql', { name: 'OpenFGA PostgreSQL', engine: 'PostgreSQL 17', exposure: 'Private only', backupDays: 14 })),
    node('observability-vpc', 'aws-vpc', 360, 520, config('aws-vpc', { name: 'Observability VPC · 10.30.0.0/16', cidr: '10.30.0.0/16', region: 'ap-south-1', availabilityZones: 2 })),
    node('observability-eks', 'eks-cluster', 360, 780, config('eks-cluster', { name: 'kloudlab-observability', region: 'ap-south-1', kubernetesVersion: '1.36', apiAccess: 'Private and public', availabilityZones: 2 })),
    node('otel-gateway', 'otel-collector', 640, 780, config('otel-collector', { name: 'OpenTelemetry · all clusters', mode: 'Gateway', authentication: 'Private network' })),
    node('prometheus', 'prometheus', 920, 680, config('prometheus', { name: 'Prometheus · metrics', retention: '30 days', storage: 'Persistent volume' })),
    node('loki', 'loki', 920, 920, config('loki', { name: 'Loki · logs', retention: '30 days', storage: 'Object storage' })),
    node('tempo', 'tempo', 1200, 920, config('tempo', { name: 'Tempo · traces', retention: '14 days', storage: 'Object storage' })),
    node('grafana', 'grafana', 1480, 780, config('grafana', { name: 'Grafana · dashboards', access: 'Restricted', authentication: 'OIDC' })),
  ]
  const edges: CanvasEdgeDocument[] = []
  let edgeNumber = 0
  const connect = (source: string, sourcePort: string, target: string, targetPort: string) => {
    edgeNumber += 1
    edges.push({ id: `edge-kloudlab-${edgeNumber}`, source, sourcePort, target, targetPort })
  }

  // Source, image publishing, and GitOps delivery.
  connect('repository', 'repository', 'image-workflow', 'repository')
  connect('repository', 'repository', 'pulumi', 'source')
  connect('image-workflow', 'images', 'ecr', 'push')
  connect('image-workflow', 'gitops-update', 'repository', 'gitops-update')
  connect('repository', 'gitops', 'argocd', 'repository')

  // Pulumi provisions the three cluster networks and stores encrypted state.
  connect('pulumi', 'provider', 'aws-provider', 'program')
  connect('pulumi-state', 'objects', 'pulumi', 'state')
  connect('pulumi-kms', 'key', 'pulumi-state', 'encryption')
  for (const [vpcId, clusterId] of [
    ['management-vpc', 'management-eks'],
    ['app-vpc', 'app-eks'],
    ['observability-vpc', 'observability-eks'],
  ]) {
    connect('aws-provider', 'resources', vpcId, 'provisioning')
    connect(vpcId, 'network', clusterId, 'network')
    connect('aws-provider', 'resources', clusterId, 'provisioning')
  }
  connect('aws-provider', 'resources', 'pulumi-kms', 'provisioning')
  connect('aws-provider', 'resources', 'pulumi-state', 'provisioning')

  // Argo CD runs on management and targets all three clusters.
  for (const clusterId of ['management-eks', 'app-eks', 'observability-eks']) {
    connect(clusterId, 'workloads', 'argocd', 'cluster')
  }

  // The application and its authorization stores run on the app cluster.
  for (const serviceId of ['frontend', 'api', 'openfga', 'api-postgres', 'openfga-postgres']) {
    connect('app-eks', 'workloads', serviceId, 'cluster')
  }
  connect('ecr', 'image', 'frontend', 'image')
  connect('ecr', 'image', 'api', 'image')
  connect('api', 'authorization', 'openfga', 'check')
  connect('openfga', 'decision', 'api', 'identity')
  connect('api', 'database-client', 'api-postgres', 'client')
  connect('api-postgres', 'database', 'api', 'database')
  connect('openfga-postgres', 'database', 'openfga', 'database')

  // All clusters and app services send telemetry to the shared observability stack.
  for (const clusterId of ['management-eks', 'app-eks', 'observability-eks']) {
    connect(clusterId, 'telemetry', 'otel-gateway', 'telemetry')
  }
  for (const serviceId of ['otel-gateway', 'prometheus', 'loki', 'tempo', 'grafana']) {
    connect('observability-eks', 'workloads', serviceId, 'cluster')
  }
  connect('api', 'telemetry', 'otel-gateway', 'telemetry')
  connect('frontend', 'telemetry', 'otel-gateway', 'telemetry')
  connect('otel-gateway', 'metrics', 'prometheus', 'metrics')
  connect('otel-gateway', 'logs', 'loki', 'logs')
  connect('otel-gateway', 'traces', 'tempo', 'traces')
  connect('prometheus', 'dashboard', 'grafana', 'sources')
  connect('loki', 'dashboard', 'grafana', 'sources')
  connect('tempo', 'dashboard', 'grafana', 'sources')

  return { schemaVersion: '1.0.0', id: STARTER_CANVAS_ID, name: 'KloudLab platform', nodes, edges }
}

const PREVIOUS_STARTER_IDS = new Set(['starter-kloudlab-platform', 'starter-kloudlab-platform-v2'])

export function migrateStarterCanvas(document: CanvasDocument): CanvasDocument {
  if (PREVIOUS_STARTER_IDS.has(document.id)) return createStarterCanvas()
  return normalizeCanvasDocument(document)
}

export function createEmptyCanvas(name = 'Untitled architecture'): CanvasDocument {
  return { schemaVersion: '1.0.0', id: makeId('canvas'), name, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 0.9 } }
}

export function normalizeCanvasDocument(document: CanvasDocument): CanvasDocument {
  const normalized = { ...document } as CanvasDocument & { authorizationModel?: unknown }
  delete normalized.authorizationModel
  normalized.nodes = normalized.nodes.map((canvasNode) => {
    if (canvasNode.typeId !== 'aws-iam-role') return canvasNode
    const component = catalogById.get(canvasNode.typeId)
    const config = Object.fromEntries(Object.entries(canvasNode.config).filter(([key]) => !['namespace', 'replicas', 'release'].includes(key)))
    return {
      ...canvasNode,
      config: { ...(component ? defaultConfig(component) : {}), ...config },
    }
  })
  return normalized
}

export function validateCanvas(document: CanvasDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const nodesById = new Map<string, CanvasNodeDocument>()
  const componentByNode = new Map<string, ComponentDefinition>()
  const validConnections: ExistingConnection[] = []
  const addRuleIssue = (rule: ComponentDefinition['validationRules'][number], nodeId: string) => {
    issues.push({ id: `${nodeId}.${rule.id}`, severity: rule.severity, message: rule.message, description: rule.description, options: rule.options, nodeId })
  }

  if (!document.name.trim()) issues.push({ id: 'canvas.name', severity: 'error', message: 'Give this architecture a name.' })
  else if (document.name.length > 200) issues.push({ id: 'canvas.name.length', severity: 'error', message: 'Architecture names must be 200 characters or fewer.' })
  if (!document.id || document.id.length > 128) issues.push({ id: 'canvas.id', severity: 'error', message: 'Architecture ID must be 1–128 characters.' })
  if (document.nodes.length === 0) issues.push({ id: 'canvas.empty', severity: 'warning', message: 'Add a component to start your architecture.' })

  for (const canvasNode of document.nodes) {
    if (nodesById.has(canvasNode.id)) {
      issues.push({ id: `node.${canvasNode.id}.duplicate`, severity: 'error', message: 'Node IDs must be unique.', nodeId: canvasNode.id })
      continue
    }
    nodesById.set(canvasNode.id, canvasNode)
    const component = catalogById.get(canvasNode.typeId)
    if (!component) {
      issues.push({ id: `node.${canvasNode.id}.unknown`, severity: 'error', message: 'This component is not in the local catalog.', nodeId: canvasNode.id })
      continue
    }
    componentByNode.set(canvasNode.id, component)
    if (canvasNode.componentVersion !== component.version) {
      issues.push({ id: `node.${canvasNode.id}.version`, severity: 'error', message: `Update this component to catalog version ${component.version}.`, nodeId: canvasNode.id })
    }
    const config = canvasNode.config
    for (const key of component.configurationSchema.required) {
      if (config[key] === undefined || config[key] === null || config[key] === '') {
        issues.push({ id: `node.${canvasNode.id}.${key}.required`, severity: 'error', message: `${component.configurationSchema.properties[key]?.title ?? key} is required.`, nodeId: canvasNode.id })
      }
    }
    for (const [key, value] of Object.entries(config)) {
      const property = component.configurationSchema.properties[key]
      if (!property) {
        issues.push({ id: `node.${canvasNode.id}.${key}.unknown`, severity: 'error', message: `Remove unsupported setting “${key}”.`, nodeId: canvasNode.id })
        continue
      }
      if (property.type === 'string' && typeof value !== 'string') {
        issues.push({ id: `node.${canvasNode.id}.${key}.type`, severity: 'error', message: `${property.title} must be text.`, nodeId: canvasNode.id })
      } else if (property.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
        issues.push({ id: `node.${canvasNode.id}.${key}.type`, severity: 'error', message: `${property.title} must be a number.`, nodeId: canvasNode.id })
      } else if (property.type === 'boolean' && typeof value !== 'boolean') {
        issues.push({ id: `node.${canvasNode.id}.${key}.type`, severity: 'error', message: `${property.title} must be enabled or disabled.`, nodeId: canvasNode.id })
      }
      if (typeof value === 'string' && property.enum && !property.enum.includes(value)) {
        issues.push({ id: `node.${canvasNode.id}.${key}.enum`, severity: 'error', message: `Choose a supported ${property.title.toLowerCase()}.`, nodeId: canvasNode.id })
      }
      if (typeof value === 'number' && ((property.minimum !== undefined && value < property.minimum) || (property.maximum !== undefined && value > property.maximum))) {
        issues.push({ id: `node.${canvasNode.id}.${key}.range`, severity: 'error', message: `${property.title} must be between ${property.minimum ?? '-∞'} and ${property.maximum ?? '∞'}.`, nodeId: canvasNode.id })
      }
      if (typeof value === 'string' && property.pattern && value && !new RegExp(property.pattern).test(value)) {
        issues.push({ id: `node.${canvasNode.id}.${key}.format`, severity: 'error', message: `Check the format for ${property.title.toLowerCase()}.`, nodeId: canvasNode.id })
      }
    }
    for (const rule of component.validationRules) {
      if (rule.scope === 'architecture') {
        continue
      }
      if (rule.scope !== 'configuration') continue
      if (rule.id === 'eks.multi-az' && Number(config.availabilityZones) < 2) {
        addRuleIssue(rule, canvasNode.id)
      }
      if (rule.id === 'vpc.cidr' && typeof config.cidr === 'string') {
        const [address, prefix, extra] = config.cidr.split('/')
        const octets = address?.split('.').map(Number)
        if (extra !== undefined || !octets || octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255) || !/^\d{1,2}$/.test(prefix ?? '') || Number(prefix) > 32) {
          addRuleIssue(rule, canvasNode.id)
        }
      }
      if (rule.id === 'vpc.capacity' && typeof config.cidr === 'string') {
        const prefix = Number(config.cidr.split('/')[1])
        if (Number.isFinite(prefix) && prefix > 20) addRuleIssue(rule, canvasNode.id)
      }
      if (rule.id === 'gateway.tls' && config.exposure === 'Public' && config.tls === '') {
        addRuleIssue(rule, canvasNode.id)
      }
      if (rule.id === 'database.private' && config.exposure !== 'Private only') {
        addRuleIssue(rule, canvasNode.id)
      }
      if (rule.id === 'database.backup' && Number(config.backupDays) < 7) {
        addRuleIssue(rule, canvasNode.id)
      }
      if (rule.id === 'openfga.private' && config.endpoint !== 'Private service') {
        addRuleIssue(rule, canvasNode.id)
      }
      if (rule.id === 'grafana.restricted' && config.access === 'Public') {
        addRuleIssue(rule, canvasNode.id)
      }
      if (rule.id === 'otel.auth' && config.authentication !== 'Authenticated' && config.authentication !== 'Private network') {
        addRuleIssue(rule, canvasNode.id)
      }
      if (rule.id === 'secrets.recovery' && config.recovery !== 'Independent backup') {
        addRuleIssue(rule, canvasNode.id)
      }
      if (rule.id === 'workload.redundancy' && Number(config.replicas) < 2) {
        addRuleIssue(rule, canvasNode.id)
      }
    }
  }

  for (const edge of document.edges) {
    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)
    if (!source || !target || !componentByNode.has(edge.source) || !componentByNode.has(edge.target)) {
      issues.push({ id: `edge.${edge.id}.endpoint`, severity: 'error', message: 'This connection points to a missing component.', description: 'One endpoint no longer exists in the architecture.', options: ['Remove this connection.', 'Restore the missing component if it was deleted by mistake.'], edgeId: edge.id, nodeId: target?.id ?? source?.id })
      continue
    }
    const check = checkConnection(
      { id: source.id, typeId: source.typeId, config: source.config },
      { id: target.id, typeId: target.typeId, config: target.config },
      validConnections,
      { sourcePort: edge.sourcePort, targetPort: edge.targetPort },
    )
    if (!check.valid) {
      issues.push({ id: `edge.${edge.id}.incompatible`, severity: 'error', message: check.reason, description: 'The source and destination ports do not describe a supported integration.', options: check.options, edgeId: edge.id, nodeId: target.id })
      continue
    }
    const connection = { source: edge.source, sourcePort: check.pair.source.id, target: edge.target, targetPort: check.pair.target.id }
    validConnections.push(connection)
  }

  for (const [nodeId, component] of componentByNode) {
    const rule = component.validationRules.find((candidate) => candidate.id === 'workload.private')
    const canvasNode = nodesById.get(nodeId)
    if (!rule || !canvasNode || canvasNode.config.exposure !== 'Gateway') continue
    const gatewayTypes = ['kgateway', 'envoy-gateway', 'traefik', 'kong', 'nginx', 'haproxy', 'envoy-proxy', 'apisix', 'caddy', 'contour']
    const directGateway = validConnections.some((edge) => edge.target === nodeId && edge.targetPort === 'http' && gatewayTypes.includes(nodesById.get(edge.source)?.typeId ?? ''))
    const services = validConnections.filter((edge) => edge.source === nodeId && edge.sourcePort === 'service' && nodesById.get(edge.target)?.typeId === 'kubernetes-service')
    const routedService = services.some((backend) => validConnections.some((route) => route.source === backend.target && route.sourcePort === 'route' && gatewayTypes.includes(nodesById.get(route.target)?.typeId ?? '')))
    if (!directGateway && !routedService) addRuleIssue(rule, nodeId)
  }

  for (const [nodeId, component] of componentByNode) {
    const canvasNode = nodesById.get(nodeId)
    if (!canvasNode || component.typeId !== 'kubernetes-workload') continue
    const autoscalingRule = component.validationRules.find((candidate) => candidate.id === 'workload.autoscaling')
    if (Number(canvasNode.config.replicas) >= 3 && autoscalingRule && !validConnections.some((edge) => edge.target === nodeId && edge.targetPort === 'autoscaling' && nodesById.get(edge.source)?.typeId === 'keda')) {
      addRuleIssue(autoscalingRule, nodeId)
    }
    const secretsRule = component.validationRules.find((candidate) => candidate.id === 'workload.secrets')
    if (secretsRule && !validConnections.some((edge) => edge.target === nodeId && edge.targetPort === 'secrets' && ['infisical', 'openbao', 'external-secrets'].includes(nodesById.get(edge.source)?.typeId ?? ''))) {
      addRuleIssue(secretsRule, nodeId)
    }
  }

  for (const [nodeId, component] of componentByNode) {
    for (const port of component.ports.filter((candidate) => candidate.required)) {
      const linked = validConnections.some((edge) => port.direction === 'input'
        ? edge.target === nodeId && edge.targetPort === port.id
        : edge.source === nodeId && edge.sourcePort === port.id)
      if (!linked) {
        const direction = port.direction === 'input' ? 'input' : 'output'
        issues.push({
          id: `node.${nodeId}.port.${port.id}.required`,
          severity: 'error',
          message: `${component.displayName} is missing a required ${port.id} ${direction} connection.`,
          description: `The ${port.id} port accepts ${port.connectionTypes.join(', ')} connections. This dependency is required for the component to work in this architecture.`,
          options: [`Connect a component with a compatible ${port.connectionTypes.join(' or ')} port.`, 'Remove the component if this dependency is not needed.'],
          nodeId,
        })
      }
    }
  }

  return issues
}

export function isCanvasDocument(value: unknown): value is CanvasDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CanvasDocument>
  // Accept and ignore the old client-side demo model when loading saved canvases.
  const allowedKeys = new Set(['schemaVersion', 'id', 'name', 'nodes', 'edges', 'authorizationModel', 'viewport'])
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return false
  if (candidate.schemaVersion !== '1.0.0' || typeof candidate.id !== 'string' || !candidate.id || candidate.id.length > 128 || typeof candidate.name !== 'string' || !candidate.name || candidate.name.length > 200) return false
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) return false
  if (Object.hasOwn(candidate, 'viewport') && (!candidate.viewport || typeof candidate.viewport !== 'object' || Object.keys(candidate.viewport).some((key) => !['x', 'y', 'zoom'].includes(key)) || !Number.isFinite(candidate.viewport.x) || !Number.isFinite(candidate.viewport.y) || !Number.isFinite(candidate.viewport.zoom) || candidate.viewport.zoom <= 0)) return false
  return candidate.nodes.every((item) => {
    if (!item || typeof item !== 'object' || Object.keys(item).some((key) => !['id', 'typeId', 'componentVersion', 'position', 'config'].includes(key))) return false
    if (typeof item.id !== 'string' || !item.id || item.id.length > 128 || typeof item.typeId !== 'string' || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(item.typeId) || typeof item.componentVersion !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(item.componentVersion)) return false
    if (!item.position || Object.keys(item.position).some((key) => !['x', 'y'].includes(key)) || !Number.isFinite(item.position.x) || !Number.isFinite(item.position.y)) return false
    return Boolean(item.config && typeof item.config === 'object' && !Array.isArray(item.config))
  }) && candidate.edges.every((item) => {
    if (!item || typeof item !== 'object' || Object.keys(item).some((key) => !['id', 'source', 'sourcePort', 'target', 'targetPort'].includes(key))) return false
    return [item.id, item.source, item.sourcePort, item.target, item.targetPort].every((field) => typeof field === 'string' && Boolean(field) && field.length <= 128)
  })
}
