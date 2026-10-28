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
export const STARTER_CANVAS_ID = 'starter-kloudlab-platform-v2'

export interface CanvasZone {
  id: string
  title: string
  description: string
  x: number
  y: number
  width: number
  height: number
  accent: string
}

export const STARTER_CANVAS_ZONES: CanvasZone[] = [
  { id: 'delivery', title: 'SOURCE, CI/CD & IaC', description: 'GitHub · Actions · Pulumi · AWS OIDC', x: -585, y: -270, width: 1335, height: 790, accent: '#d8a866' },
  { id: 'peering-zone', title: 'PRIVATE NETWORK', description: 'VPC peering links all three clusters', x: 875, y: 315, width: 350, height: 220, accent: '#82b8b4' },
  { id: 'management', title: 'MANAGEMENT · EKS 1.36', description: 'Argo CD · cluster access · management IAM roles', x: -65, y: 535, width: 610, height: 1240, accent: '#c37ea1' },
  { id: 'application', title: 'APPLICATION · EKS 1.36', description: 'KloudLab frontend, API · OpenFGA · Karpenter · IAM', x: 625, y: 535, width: 610, height: 1850, accent: '#6bbd98' },
  { id: 'observability', title: 'OBSERVABILITY · EKS 1.36', description: 'OpenTelemetry · Prometheus · Loki · Tempo · Grafana · IAM', x: 1315, y: 535, width: 610, height: 1850, accent: '#76a9d9' },
  { id: 'external', title: 'EXTERNAL SERVICES', description: 'Cloudflare DNS · Auth0', x: 1980, y: 535, width: 360, height: 720, accent: '#d69a70' },
]

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
    node('repository', 'github', -535, 130, config('github', { name: 'github.com/harishSudalaimani/kloudlab' })),
    node('go-ci', 'github-actions', -285, -160, config('github-actions', { name: 'Go CI · format, lint, test infra' })),
    node('image-workflow', 'github-actions', -285, 90, config('github-actions', { name: 'Buildx · API + frontend images on main' })),
    node('gitops-update-workflow', 'github-actions', -285, 340, config('github-actions', { name: 'GitOps update · commit image SHA tags' })),
    node('network-preview-workflow', 'github-actions', -535, 340, config('github-actions', { name: 'Network preview · manual Pulumi plan' })),
    node('pulumi', 'pulumi', 5, -170, config('pulumi', { name: 'Pulumi Go · bootstrap, VPC, EKS, IAM, storage stacks' })),
    node('network-preview-role', 'aws-iam-role', 5, 80, config('aws-iam-role', { name: 'Network preview · GitHub OIDC', trustSource: 'Protected main branch', permissionScope: 'Pulumi state and AWS read-only preview access' })),
    node('ecr-publisher-role', 'aws-iam-role', 5, 330, config('aws-iam-role', { name: 'ECR publisher · GitHub OIDC', trustSource: 'GitHub Actions main branch', permissionScope: 'Push KloudLab API and frontend images to ECR' })),
    node('aws-provider', 'pulumi-aws-provider', 270, -170, config('pulumi-aws-provider', { name: 'Pulumi AWS provider · ap-south-1' })),
    node('pulumi-kms', 'aws-kms', 270, 80, config('aws-kms', { name: 'Pulumi state · KMS encryption key' })),
    node('pulumi-state', 'aws-s3', 520, 80, config('aws-s3', { name: 'Pulumi state · versioned S3 + KMS' })),
    node('ecr', 'amazon-ecr', 520, -180, config('amazon-ecr', { name: 'ECR · API/frontend · main + 7-char SHA tags', region: 'ap-south-1' })),
    node('peering', 'aws-vpc-peering', 930, 385, config('aws-vpc-peering', { name: 'Private peering · all three VPCs' })),

    node('management-vpc', 'aws-vpc', 0, 600, config('aws-vpc', { name: 'Management VPC · 10.40.0.0/16', cidr: '10.40.0.0/16', region: 'ap-south-1', availabilityZones: 2 })),
    node('management-eks', 'eks-cluster', 270, 600, config('eks-cluster', { name: 'kloudlab-management', region: 'ap-south-1', kubernetesVersion: '1.36', apiAccess: 'Private and public', availabilityZones: 2 })),
    node('management-gateway', 'kgateway', 0, 830, config('kgateway', { name: 'Argo CD public Gateway', hostname: 'argocd.kloudlab.in', exposure: 'Public', tls: 'Managed certificate' })),
    node('argocd', 'argocd', 270, 830, config('argocd', { name: 'Argo CD · RollingSync across 3 clusters' })),
    node('management-cert-manager', 'cert-manager', 0, 1060, config('cert-manager', { name: 'cert-manager · Cloudflare DNS-01' })),
    node('management-external-dns', 'external-dns', 270, 1060, config('external-dns', { name: 'ExternalDNS · Cloudflare API token' })),
    node('management-otel', 'otel-collector', 0, 1290, config('otel-collector', { name: 'Node agents + cluster collector', mode: 'Agent', authentication: 'Private network' })),
    node('management-lbc', 'kubernetes-workload', 270, 1290, config('kubernetes-workload', { name: 'AWS Load Balancer Controller', namespace: 'kube-system', replicas: 1 })),
    node('management-iam-roles', 'aws-iam-role', 0, 1520, config('aws-iam-role', { name: 'Management IAM · EKS/node + LBC roles', trustSource: 'EKS control plane, EC2 nodes, Pod Identity', permissionScope: 'Cluster operations and AWS Load Balancer Controller' })),
    node('argocd-controller-role', 'aws-iam-role', 270, 1520, config('aws-iam-role', { name: 'Argo CD controller · Pod Identity', trustSource: 'management / argocd / application-controller', permissionScope: 'Assume only app and observability deployer roles; describe those clusters' })),

    node('app-vpc', 'aws-vpc', 690, 600, config('aws-vpc', { name: 'App VPC · 10.10.0.0/16', cidr: '10.10.0.0/16', region: 'ap-south-1', availabilityZones: 2 })),
    node('app-eks', 'eks-cluster', 960, 600, config('eks-cluster', { name: 'kloudlab-app', region: 'ap-south-1', kubernetesVersion: '1.36', apiAccess: 'Private and public', availabilityZones: 2 })),
    node('app-gateway', 'kgateway', 690, 830, config('kgateway', { name: 'Public app Gateway · web + API', hostname: 'kloudlab.in', exposure: 'Public', tls: 'Managed certificate' })),
    node('frontend', 'kubernetes-workload', 960, 830, config('kubernetes-workload', { name: 'KloudLab frontend · www.kloudlab.in', namespace: 'kloudlab', replicas: 1, exposure: 'Gateway' })),
    node('api', 'kubernetes-workload', 690, 1060, config('kubernetes-workload', { name: 'KloudLab API · api.kloudlab.in', namespace: 'kloudlab', replicas: 1, exposure: 'Gateway' })),
    node('openfga', 'openfga', 960, 1060, config('openfga', { name: 'OpenFGA · private authorization', modelVersion: 'authorization model' })),
    node('api-postgres', 'postgresql', 690, 1290, config('postgresql', { name: 'KloudLab API PostgreSQL', engine: 'PostgreSQL 17', exposure: 'Private only', backupDays: 7 })),
    node('openfga-postgres', 'postgresql', 960, 1290, config('postgresql', { name: 'OpenFGA PostgreSQL', engine: 'PostgreSQL 17', exposure: 'Private only', backupDays: 14 })),
    node('app-cert-manager', 'cert-manager', 690, 1520, config('cert-manager', { name: 'cert-manager · Cloudflare DNS-01' })),
    node('app-external-dns', 'external-dns', 960, 1520, config('external-dns', { name: 'ExternalDNS · Cloudflare API token' })),
    node('karpenter', 'kubernetes-workload', 690, 1750, config('kubernetes-workload', { name: 'Karpenter · app node autoscaling', namespace: 'kube-system', replicas: 1 })),
    node('app-otel', 'otel-collector', 960, 1750, config('otel-collector', { name: 'Node agents + cluster collector', mode: 'Agent', authentication: 'Private network' })),
    node('app-lbc', 'kubernetes-workload', 690, 1980, config('kubernetes-workload', { name: 'AWS Load Balancer Controller', namespace: 'kube-system', replicas: 1 })),
    node('app-iam-roles', 'aws-iam-role', 960, 1980, config('aws-iam-role', { name: 'App IAM · EKS/node + LBC/Karpenter roles', trustSource: 'EKS control plane, EC2 nodes, Pod Identity', permissionScope: 'Cluster access, load balancers, EC2 discovery and Karpenter interruption queue' })),
    node('app-argocd-deployer-role', 'aws-iam-role', 690, 2210, config('aws-iam-role', { name: 'Argo CD deployer · app', trustSource: 'management Argo CD controller role', permissionScope: 'EKS access entry and cluster-scoped deployment access' })),

    node('observability-vpc', 'aws-vpc', 1380, 600, config('aws-vpc', { name: 'Observability VPC · 10.30.0.0/16', cidr: '10.30.0.0/16', region: 'ap-south-1', availabilityZones: 2 })),
    node('observability-eks', 'eks-cluster', 1650, 600, config('eks-cluster', { name: 'kloudlab-observability', region: 'ap-south-1', kubernetesVersion: '1.36', apiAccess: 'Private and public', availabilityZones: 2 })),
    node('observability-gateway', 'kgateway', 1380, 830, config('kgateway', { name: 'Grafana public Gateway', hostname: 'grafana.kloudlab.in', exposure: 'Public', tls: 'Managed certificate' })),
    node('grafana', 'grafana', 1650, 830, config('grafana', { name: 'Grafana · authenticated dashboards', access: 'Restricted', authentication: 'OIDC' })),
    node('observability-cert-manager', 'cert-manager', 1380, 1060, config('cert-manager', { name: 'cert-manager · Cloudflare DNS-01' })),
    node('observability-external-dns', 'external-dns', 1650, 1060, config('external-dns', { name: 'ExternalDNS · Cloudflare API token' })),
    node('observability-otel', 'otel-collector', 1380, 1290, config('otel-collector', { name: 'Node agents + cluster collector', mode: 'Agent', authentication: 'Private network' })),
    node('otel-gateway', 'otel-collector', 1650, 1290, config('otel-collector', { name: 'OpenTelemetry gateway', mode: 'Gateway', authentication: 'Private network' })),
    node('prometheus', 'prometheus', 1380, 1520, config('prometheus', { name: 'Prometheus · metrics', retention: '30 days', storage: 'Persistent volume' })),
    node('loki', 'loki', 1650, 1520, config('loki', { name: 'Loki · logs', retention: '30 days', storage: 'Object storage' })),
    node('tempo', 'tempo', 1380, 1750, config('tempo', { name: 'Tempo · traces', retention: '14 days', storage: 'Object storage' })),
    node('observability-storage', 'aws-s3', 1650, 1750, config('aws-s3', { name: 'Observability S3 · Loki logs + Tempo traces' })),
    node('observability-lbc', 'kubernetes-workload', 1380, 1980, config('kubernetes-workload', { name: 'AWS Load Balancer Controller', namespace: 'kube-system', replicas: 1 })),
    node('observability-iam-roles', 'aws-iam-role', 1650, 1980, config('aws-iam-role', { name: 'Observability IAM · EKS/node + S3 roles', trustSource: 'EKS control plane, EC2 nodes, Pod Identity', permissionScope: 'Cluster access, load balancers, Loki logs and Tempo traces buckets' })),
    node('observability-argocd-deployer-role', 'aws-iam-role', 1380, 2210, config('aws-iam-role', { name: 'Argo CD deployer · observability', trustSource: 'management Argo CD controller role', permissionScope: 'EKS access entry and cluster-scoped deployment access' })),

    node('cloudflare', 'cloudflare-dns', 2020, 830, config('cloudflare-dns', { name: 'Cloudflare · kloudlab.in DNS + API', zone: 'kloudlab.in' })),
    node('auth0', 'auth0', 2020, 1060, config('auth0', { name: 'Auth0 · KloudLab sign-in', domain: 'dev-rfog4fw2atmd5wrd.us.auth0.com', audience: 'https://api.kloudlab.in', flow: 'OpenID Connect' })),
  ]
  const edges: CanvasEdgeDocument[] = []
  let edgeNumber = 0
  const connect = (source: string, sourcePort: string, target: string, targetPort: string) => {
    edgeNumber += 1
    edges.push({ id: `edge-kloudlab-${edgeNumber}`, source, sourcePort, target, targetPort })
  }

  // Repository workflows and infrastructure delivery.
  connect('repository', 'repository', 'go-ci', 'repository')
  connect('repository', 'repository', 'image-workflow', 'repository')
  connect('repository', 'repository', 'gitops-update-workflow', 'repository')
  connect('repository', 'repository', 'network-preview-workflow', 'repository')
  connect('repository', 'repository', 'pulumi', 'source')
  connect('repository', 'gitops', 'argocd', 'repository')
  connect('image-workflow', 'job-complete', 'gitops-update-workflow', 'needs')
  connect('gitops-update-workflow', 'gitops-update', 'repository', 'gitops-update')
  connect('image-workflow', 'oidc', 'ecr-publisher-role', 'trust')
  connect('image-workflow', 'images', 'ecr', 'push')
  connect('ecr-publisher-role', 'identity', 'ecr', 'identity')
  connect('network-preview-workflow', 'oidc', 'network-preview-role', 'trust')
  connect('network-preview-role', 'identity', 'aws-provider', 'identity')
  connect('network-preview-role', 'identity', 'pulumi-state', 'access')
  connect('pulumi', 'provider', 'aws-provider', 'program')
  connect('pulumi-state', 'objects', 'pulumi', 'state')
  connect('aws-provider', 'resources', 'management-vpc', 'provisioning')
  connect('aws-provider', 'resources', 'app-vpc', 'provisioning')
  connect('aws-provider', 'resources', 'observability-vpc', 'provisioning')
  connect('aws-provider', 'resources', 'management-eks', 'provisioning')
  connect('aws-provider', 'resources', 'app-eks', 'provisioning')
  connect('aws-provider', 'resources', 'observability-eks', 'provisioning')
  connect('aws-provider', 'resources', 'management-iam-roles', 'provisioning')
  connect('aws-provider', 'resources', 'app-iam-roles', 'provisioning')
  connect('aws-provider', 'resources', 'observability-iam-roles', 'provisioning')
  connect('aws-provider', 'resources', 'argocd-controller-role', 'provisioning')
  connect('aws-provider', 'resources', 'app-argocd-deployer-role', 'provisioning')
  connect('aws-provider', 'resources', 'observability-argocd-deployer-role', 'provisioning')
  connect('aws-provider', 'resources', 'peering', 'provisioning')
  connect('aws-provider', 'resources', 'pulumi-kms', 'provisioning')
  connect('aws-provider', 'resources', 'pulumi-state', 'provisioning')
  connect('aws-provider', 'resources', 'observability-storage', 'provisioning')
  connect('pulumi-kms', 'key', 'pulumi-state', 'encryption')

  // IAM roles: GitHub OIDC, EKS workload identities, and Argo CD cluster access.
  for (const [clusterId, roleId] of [
    ['management-eks', 'management-iam-roles'],
    ['app-eks', 'app-iam-roles'],
    ['observability-eks', 'observability-iam-roles'],
  ]) {
    connect(roleId, 'identity', clusterId, 'iam-role')
  }
  connect('management-iam-roles', 'identity', 'management-lbc', 'aws-identity')
  connect('app-iam-roles', 'identity', 'app-lbc', 'aws-identity')
  connect('app-iam-roles', 'identity', 'karpenter', 'aws-identity')
  connect('observability-iam-roles', 'identity', 'observability-lbc', 'aws-identity')
  connect('observability-iam-roles', 'identity', 'observability-storage', 'access')
  connect('management-eks', 'pod-identity', 'argocd-controller-role', 'trust')
  connect('argocd-controller-role', 'identity', 'argocd', 'aws-identity')
  connect('argocd-controller-role', 'assume-role', 'app-argocd-deployer-role', 'trust')
  connect('argocd-controller-role', 'assume-role', 'observability-argocd-deployer-role', 'trust')
  connect('app-argocd-deployer-role', 'identity', 'app-eks', 'iam-role')
  connect('observability-argocd-deployer-role', 'identity', 'observability-eks', 'iam-role')

  // Three VPCs, EKS clusters, and their private peering mesh.
  for (const [vpcId, eksId] of [
    ['management-vpc', 'management-eks'],
    ['app-vpc', 'app-eks'],
    ['observability-vpc', 'observability-eks'],
  ]) {
    connect(vpcId, 'network', 'peering', 'networks')
    connect(vpcId, 'network', eksId, 'network')
    connect('peering', 'peering', eksId, 'peering')
  }

  // Argo CD is hosted on management and reconciles workloads in all clusters.
  for (const clusterId of ['management-eks', 'app-eks', 'observability-eks']) {
    connect(clusterId, 'workloads', 'argocd', 'cluster')
  }
  const clusterWorkloads: Record<string, string[]> = {
    'management-eks': ['management-gateway', 'management-cert-manager', 'management-external-dns', 'management-otel', 'management-lbc'],
    'app-eks': ['app-gateway', 'frontend', 'api', 'openfga', 'api-postgres', 'openfga-postgres', 'app-cert-manager', 'app-external-dns', 'karpenter', 'app-otel', 'app-lbc'],
    'observability-eks': ['observability-gateway', 'grafana', 'observability-cert-manager', 'observability-external-dns', 'observability-otel', 'otel-gateway', 'prometheus', 'loki', 'tempo', 'observability-lbc'],
  }
  for (const [clusterId, serviceIds] of Object.entries(clusterWorkloads)) {
    for (const serviceId of serviceIds) {
      const component = nodes.find((item) => item.id === serviceId)
      const telemetryAgent = component?.typeId === 'otel-collector' && serviceId !== 'otel-gateway'
      if (telemetryAgent) continue
      connect(clusterId, 'workloads', serviceId, 'cluster')
    }
  }
  const gitopsTargets = [
    ...clusterWorkloads['management-eks'],
    ...clusterWorkloads['app-eks'],
    ...clusterWorkloads['observability-eks'],
  ]
  for (const targetId of gitopsTargets) connect('argocd', 'deployments', targetId, 'delivery')

  // Public routes, DNS-01 certificates, application identity, and authorization.
  connect('cloudflare', 'provider', 'management-external-dns', 'provider')
  connect('cloudflare', 'provider', 'app-external-dns', 'provider')
  connect('cloudflare', 'provider', 'observability-external-dns', 'provider')
  connect('cloudflare', 'provider', 'management-cert-manager', 'dns-provider')
  connect('cloudflare', 'provider', 'app-cert-manager', 'dns-provider')
  connect('cloudflare', 'provider', 'observability-cert-manager', 'dns-provider')
  connect('management-external-dns', 'records', 'management-gateway', 'dns')
  connect('app-external-dns', 'records', 'app-gateway', 'dns')
  connect('observability-external-dns', 'records', 'observability-gateway', 'dns')
  connect('management-cert-manager', 'certificate', 'management-gateway', 'certificate')
  connect('app-cert-manager', 'certificate', 'app-gateway', 'certificate')
  connect('observability-cert-manager', 'certificate', 'observability-gateway', 'certificate')
  connect('management-gateway', 'service', 'argocd', 'http')
  connect('app-gateway', 'service', 'frontend', 'http')
  connect('app-gateway', 'service', 'api', 'http')
  connect('observability-gateway', 'service', 'grafana', 'http')
  connect('auth0', 'oidc', 'frontend', 'oidc')
  connect('auth0', 'oidc', 'api', 'oidc')
  connect('api', 'authorization', 'openfga', 'check')
  connect('openfga', 'decision', 'api', 'identity')
  connect('api', 'database-client', 'api-postgres', 'client')
  connect('api-postgres', 'database', 'api', 'database')
  connect('openfga-postgres', 'database', 'openfga', 'database')
  connect('ecr', 'image', 'frontend', 'image')
  connect('ecr', 'image', 'api', 'image')

  // Each cluster sends telemetry to the observability gateway and backends.
  for (const [clusterId, collectorId] of [
    ['management-eks', 'management-otel'],
    ['app-eks', 'app-otel'],
    ['observability-eks', 'observability-otel'],
  ]) {
    connect(clusterId, 'telemetry', collectorId, 'telemetry')
    connect(collectorId, 'forward', 'otel-gateway', 'telemetry')
  }
  connect('api', 'telemetry', 'app-otel', 'telemetry')
  connect('frontend', 'telemetry', 'app-otel', 'telemetry')
  connect('otel-gateway', 'metrics', 'prometheus', 'metrics')
  connect('otel-gateway', 'logs', 'loki', 'logs')
  connect('otel-gateway', 'traces', 'tempo', 'traces')
  connect('prometheus', 'dashboard', 'grafana', 'sources')
  connect('loki', 'dashboard', 'grafana', 'sources')
  connect('tempo', 'dashboard', 'grafana', 'sources')
  connect('observability-storage', 'objects', 'loki', 'storage')
  connect('observability-storage', 'objects', 'tempo', 'storage')

  return {
    schemaVersion: '1.0.0',
    id: STARTER_CANVAS_ID,
    name: 'KloudLab · Full Architecture',
    nodes,
    edges,
  }
}

function legacyStarterSnapshot(layout: 'current' | 'early' = 'current'): CanvasDocument {
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
  if (layout === 'early') {
    const positions: Record<string, { x: number; y: number }> = {
      vpc: { x: -300, y: 170 }, eks: { x: 40, y: 170 }, gateway: { x: 400, y: -120 },
      api: { x: 400, y: 170 }, auth0: { x: 400, y: 500 }, fga: { x: 740, y: 440 },
      postgres: { x: 740, y: 710 }, collector: { x: 1070, y: 170 }, prometheus: { x: 1420, y: 40 },
      loki: { x: 1420, y: 300 }, tempo: { x: 1420, y: 560 }, grafana: { x: 1760, y: 300 },
    }
    for (const canvasNode of nodes) canvasNode.position = positions[canvasNode.id]
  }
  return { schemaVersion: '1.0.0', id: 'starter-kloudlab-platform', name: 'KloudLab platform', nodes, edges }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

function matchesPreviousFullStarter(document: CanvasDocument): boolean {
  if (document.id !== STARTER_CANVAS_ID || document.name !== 'KloudLab · Full Architecture') return false
  const current = createStarterCanvas()
  const nodeShape = (nodes: CanvasNodeDocument[]) => nodes
    .map(({ id, typeId }) => ({ id, typeId }))
    .sort((left, right) => left.id.localeCompare(right.id))
  if (stableSerialize(nodeShape(document.nodes)) !== stableSerialize(nodeShape(current.nodes))) return false

  const connectionShape = (edges: CanvasEdgeDocument[]) => edges
    .map(({ source, sourcePort, target, targetPort }) => ({ source, sourcePort, target, targetPort }))
    .sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))
  const oldDuplicateTelemetryLinks: CanvasEdgeDocument[] = [
    { id: 'old-management-telemetry', source: 'management-eks', sourcePort: 'telemetry', target: 'management-otel', targetPort: 'telemetry' },
    { id: 'old-app-telemetry', source: 'app-eks', sourcePort: 'telemetry', target: 'app-otel', targetPort: 'telemetry' },
    { id: 'old-observability-telemetry', source: 'observability-eks', sourcePort: 'telemetry', target: 'observability-otel', targetPort: 'telemetry' },
  ]
  return document.edges.length === current.edges.length + oldDuplicateTelemetryLinks.length &&
    stableSerialize(connectionShape(document.edges)) === stableSerialize(connectionShape([...current.edges, ...oldDuplicateTelemetryLinks]))
}

function upgradePreviousFullStarter(document: CanvasDocument): CanvasDocument {
  const upgraded = createStarterCanvas()
  const baselineById = new Map(upgraded.nodes.map((canvasNode) => [canvasNode.id, canvasNode]))
  const upgradedById = new Map(upgraded.nodes.map((canvasNode) => [canvasNode.id, canvasNode]))
  for (const oldNode of document.nodes) {
    const baseline = baselineById.get(oldNode.id)
    const target = upgradedById.get(oldNode.id)
    if (!baseline || !target || baseline.typeId !== oldNode.typeId || target.typeId !== oldNode.typeId) continue
    target.position = { ...oldNode.position }
    for (const [key, value] of Object.entries(oldNode.config)) {
      if (!Object.hasOwn(target.config, key) || stableSerialize(value) === stableSerialize(baseline.config[key])) continue
      target.config[key] = value
    }
  }
  if (document.viewport) upgraded.viewport = { ...document.viewport }
  return upgraded
}

export function migrateStarterCanvas(document: CanvasDocument): CanvasDocument {
  if (matchesPreviousFullStarter(document)) return upgradePreviousFullStarter(document)

  if (document.id === 'starter-kloudlab-platform' && document.name === 'KloudLab platform') {
    const matchesLegacyStructure = (layout: 'current' | 'early') => {
      const legacy = legacyStarterSnapshot(layout)
      const expectedNodes = legacy.nodes
        .map(({ id, typeId }) => ({ id, typeId }))
        .sort((left, right) => left.id.localeCompare(right.id))
      const actualNodes = document.nodes
        .map(({ id, typeId }) => ({ id, typeId }))
        .sort((left, right) => left.id.localeCompare(right.id))
      const expectedEdges = legacy.edges
        .map(({ source, sourcePort, target, targetPort }) => ({ source, sourcePort, target, targetPort }))
        .sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))
      const actualEdges = document.edges
        .map(({ source, sourcePort, target, targetPort }) => ({ source, sourcePort, target, targetPort }))
        .sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))
      return document.nodes.length === legacy.nodes.length &&
        document.edges.length === legacy.edges.length &&
        stableSerialize(actualNodes) === stableSerialize(expectedNodes) &&
        stableSerialize(actualEdges) === stableSerialize(expectedEdges)
    }

    const legacyLayout = (['current', 'early'] as const).find(matchesLegacyStructure)
    if (legacyLayout) {
      const legacy = legacyStarterSnapshot(legacyLayout)
      const upgraded = createStarterCanvas()
      const legacyTargets: Record<string, string> = {
        vpc: 'app-vpc',
        eks: 'app-eks',
        gateway: 'app-gateway',
        api: 'api',
        auth0: 'auth0',
        fga: 'openfga',
        postgres: 'openfga-postgres',
        collector: 'otel-gateway',
        prometheus: 'prometheus',
        loki: 'loki',
        tempo: 'tempo',
        grafana: 'grafana',
      }
      const baselineById = new Map(legacy.nodes.map((canvasNode) => [canvasNode.id, canvasNode]))
      const upgradedById = new Map(upgraded.nodes.map((canvasNode) => [canvasNode.id, canvasNode]))
      for (const oldNode of document.nodes) {
        const baseline = baselineById.get(oldNode.id)
        const target = upgradedById.get(legacyTargets[oldNode.id])
        if (!baseline || !target || baseline.typeId !== oldNode.typeId || target.typeId !== oldNode.typeId) continue
        for (const [key, value] of Object.entries(oldNode.config)) {
          if (!Object.hasOwn(target.config, key) || stableSerialize(value) === stableSerialize(baseline.config[key])) continue
          target.config[key] = value
        }
      }
      return upgraded
    }
  }
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
