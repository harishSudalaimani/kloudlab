import { catalogById, defaultConfig, type ComponentDefinition } from './catalog'
import { checkConnection, type ExistingConnection } from './connections'
import { createDefaultAuthorizationModel, isAuthorizationModel, type AuthorizationModel } from './authorization'

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
  authorizationModel?: AuthorizationModel
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
    node('vpc', 'aws-vpc', -20, 200, config('aws-vpc', { name: 'Platform network', cidr: '10.40.0.0/16' })),
    node('eks', 'eks-cluster', 210, 200, config('eks-cluster', { name: 'Platform cluster' })),
    node('gateway', 'kgateway', 460, 0, config('kgateway', { name: 'Public gateway', hostname: 'kloudlab.in' })),
    node('api', 'kubernetes-workload', 460, 200, config('kubernetes-workload', { name: 'KloudLab API', namespace: 'platform', replicas: 3 })),
    node('auth0', 'auth0', 460, 430, config('auth0', { name: 'Auth0 tenant' })),
    node('fga', 'openfga', 700, 330, config('openfga', { name: 'OpenFGA', modelVersion: 'canvas-v1' })),
    node('postgres', 'postgresql', 700, 520, config('postgresql', { name: 'Identity PostgreSQL', backupDays: 14 })),
    node('collector', 'otel-collector', 930, 200, config('otel-collector', { name: 'Telemetry gateway' })),
    node('prometheus', 'prometheus', 1170, 0, config('prometheus', { name: 'Prometheus', retention: '30 days' })),
    node('loki', 'loki', 1170, 200, config('loki', { name: 'Loki', retention: '30 days' })),
    node('tempo', 'tempo', 1170, 400, config('tempo', { name: 'Tempo', retention: '14 days' })),
    node('grafana', 'grafana', 1400, 200, config('grafana', { name: 'Grafana' })),
  ]
  const edges: CanvasEdgeDocument[] = [
    { id: 'edge-vpc-eks', source: 'vpc', sourcePort: 'network', target: 'eks', targetPort: 'network' },
    { id: 'edge-eks-api', source: 'eks', sourcePort: 'workloads', target: 'api', targetPort: 'cluster' },
    { id: 'edge-eks-gateway', source: 'eks', sourcePort: 'workloads', target: 'gateway', targetPort: 'cluster' },
    { id: 'edge-eks-otel', source: 'eks', sourcePort: 'telemetry', target: 'collector', targetPort: 'telemetry' },
    { id: 'edge-gateway-api', source: 'gateway', sourcePort: 'service', target: 'api', targetPort: 'http' },
    { id: 'edge-auth-api', source: 'auth0', sourcePort: 'oidc', target: 'api', targetPort: 'oidc' },
    { id: 'edge-api-fga', source: 'api', sourcePort: 'authorization', target: 'fga', targetPort: 'check' },
    { id: 'edge-fga-api', source: 'fga', sourcePort: 'decision', target: 'api', targetPort: 'identity' },
    { id: 'edge-postgres-fga', source: 'postgres', sourcePort: 'database', target: 'fga', targetPort: 'database' },
    { id: 'edge-api-otel', source: 'api', sourcePort: 'telemetry', target: 'collector', targetPort: 'telemetry' },
    { id: 'edge-otel-prom', source: 'collector', sourcePort: 'metrics', target: 'prometheus', targetPort: 'metrics' },
    { id: 'edge-otel-loki', source: 'collector', sourcePort: 'logs', target: 'loki', targetPort: 'logs' },
    { id: 'edge-otel-tempo', source: 'collector', sourcePort: 'traces', target: 'tempo', targetPort: 'traces' },
    { id: 'edge-prom-grafana', source: 'prometheus', sourcePort: 'dashboard', target: 'grafana', targetPort: 'sources' },
    { id: 'edge-loki-grafana', source: 'loki', sourcePort: 'dashboard', target: 'grafana', targetPort: 'sources' },
    { id: 'edge-tempo-grafana', source: 'tempo', sourcePort: 'dashboard', target: 'grafana', targetPort: 'sources' },
  ]
  return {
    schemaVersion: '1.0.0',
    id: 'starter-kloudlab-platform',
    name: 'KloudLab platform',
    nodes,
    edges,
    authorizationModel: createDefaultAuthorizationModel(),
  }
}

export function createEmptyCanvas(name = 'Untitled architecture'): CanvasDocument {
  return { schemaVersion: '1.0.0', id: makeId('canvas'), name, nodes: [], edges: [], authorizationModel: createDefaultAuthorizationModel(), viewport: { x: 0, y: 0, zoom: 0.9 } }
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
      if (rule.id === 'otel.auth' && config.authentication !== 'Authenticated') {
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
  const allowedKeys = new Set(['schemaVersion', 'id', 'name', 'nodes', 'edges', 'authorizationModel', 'viewport'])
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return false
  if (candidate.schemaVersion !== '1.0.0' || typeof candidate.id !== 'string' || !candidate.id || candidate.id.length > 128 || typeof candidate.name !== 'string' || !candidate.name || candidate.name.length > 200) return false
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) return false
  if (Object.hasOwn(candidate, 'authorizationModel') && !isAuthorizationModel(candidate.authorizationModel)) return false
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
