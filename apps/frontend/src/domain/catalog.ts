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
  | 'AI & ML'
  | 'Data & Workflow'
  | 'Developer Tools'
  | 'API & Integration'
  | 'FinOps'
  | 'Runtime'

export type ComponentAvailability = 'open-source' | 'open-core' | 'cloud-hosting' | 'managed-service'

export type PortDirection = 'input' | 'output'

export interface ComponentPort {
  id: string
  direction: PortDirection
  connectionTypes: string[]
  protocols?: string[]
  allowedComponentTypes?: string[]
  required?: boolean
  multiple?: boolean
}

export interface ComponentValidationRule {
  id: string
  scope: 'configuration' | 'connection' | 'architecture'
  severity: 'error' | 'warning' | 'info'
  message: string
  description?: string
  options?: string[]
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
  validationRules: ComponentValidationRule[]
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
    availability: typeId === 'aws-vpc' || typeId === 'eks-cluster' || typeId === 'aws-iam-role' || typeId === 'amazon-ecr' || typeId === 'aws-vpc-peering'
      ? 'cloud-hosting'
      : typeId === 'auth0' || typeId === 'cloudflare-dns'
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
  'AI & ML': '#9b88d5', 'Data & Workflow': '#75a6b5', 'Developer Tools': '#b38b6c',
  'API & Integration': '#d18d69', FinOps: '#9aa968', Runtime: '#7f9a9c',
}

function openSourceTool(
  typeId: string,
  displayName: string,
  description: string,
  category: ComponentCategory,
  symbol: string,
  ports: ComponentPort[],
  documentation: string,
  availability: ComponentAvailability = 'open-source',
): ComponentDefinition {
  const component = definition(typeId, displayName, description, category, symbol, categoryAccent[category], {
    name,
    namespace: { type: 'string', title: 'Namespace', pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' },
    replicas: { type: 'number', title: 'Replicas', minimum: 1, maximum: 100 },
    release: { type: 'string', title: 'Release or version', pattern: '^.{0,60}$' },
  }, ['name'], ports, [], [documentation])
  component.availability = availability
  return component
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
  availability: ComponentAvailability = 'open-source',
) => {
  const gatewayTypes = ['envoy-gateway', 'traefik', 'kong', 'nginx', 'haproxy', 'envoy-proxy', 'apisix', 'caddy', 'contour']
  const databaseTypes = ['mysql', 'mariadb', 'valkey', 'clickhouse', 'cassandra', 'sqlite', 'tidb', 'influxdb', 'questdb', 'duckdb', 'druid', 'etcd', 'ferretdb', 'yugabytedb']
  const messagingTypes = ['nats', 'rabbitmq', 'kafka', 'pulsar', 'activemq-artemis', 'mosquitto', 'emqx']
  const ports: ComponentPort[] = typeId === 'argocd'
    ? [
        { id: 'repository', direction: 'input', connectionTypes: ['gitops-source'], allowedComponentTypes: ['github'] },
        { id: 'cluster', direction: 'input', connectionTypes: ['workload'], allowedComponentTypes: ['eks-cluster'] },
        { id: 'aws-identity', direction: 'input', connectionTypes: ['cloud-identity'], allowedComponentTypes: ['aws-iam-role'] },
        { id: 'http', direction: 'input', connectionTypes: ['http-service'], allowedComponentTypes: ['kgateway'] },
        { id: 'deployments', direction: 'output', connectionTypes: ['gitops-deployment'], allowedComponentTypes: ['kubernetes-workload', 'kgateway', 'postgresql', 'openfga', 'otel-collector', 'prometheus', 'loki', 'tempo', 'grafana', 'external-dns', 'cert-manager'] },
      ]
    : typeId === 'external-dns'
      ? [
          { id: 'cluster', direction: 'input', connectionTypes: ['workload'], allowedComponentTypes: ['eks-cluster'] },
          { id: 'provider', direction: 'input', connectionTypes: ['dns-provider'], allowedComponentTypes: ['cloudflare-dns'] },
          { id: 'records', direction: 'output', connectionTypes: ['dns-record'], allowedComponentTypes: ['kgateway'] },
          { id: 'delivery', direction: 'input', connectionTypes: ['gitops-deployment'], allowedComponentTypes: ['argocd'] },
        ]
      : typeId === 'cert-manager'
        ? [
            { id: 'cluster', direction: 'input', connectionTypes: ['workload'], allowedComponentTypes: ['eks-cluster'] },
            { id: 'dns-provider', direction: 'input', connectionTypes: ['dns-provider'], allowedComponentTypes: ['cloudflare-dns'] },
            { id: 'certificate', direction: 'output', connectionTypes: ['tls-certificate'], allowedComponentTypes: ['kgateway'] },
            { id: 'delivery', direction: 'input', connectionTypes: ['gitops-deployment'], allowedComponentTypes: ['argocd'] },
          ]
        : gatewayTypes.includes(typeId)
    ? [
        { id: 'route', direction: 'input' as const, connectionTypes: ['http-route'], protocols: ['HTTP', 'HTTPS'], allowedComponentTypes: ['kubernetes-service'] },
        { id: 'service', direction: 'output' as const, connectionTypes: ['http-service'], protocols: ['HTTP', 'HTTPS'], allowedComponentTypes: ['kubernetes-workload'] },
      ]
    : typeId === 'keda'
      ? [{ id: 'scaled-workload', direction: 'output', connectionTypes: ['autoscaling'], allowedComponentTypes: ['kubernetes-workload'] }]
      : ['openbao', 'external-secrets'].includes(typeId)
        ? [{ id: 'secrets', direction: 'output', connectionTypes: ['secrets'], allowedComponentTypes: ['kubernetes-workload'] }]
        : databaseTypes.includes(typeId)
          ? [
              { id: 'client', direction: 'input', connectionTypes: ['database-client'], protocols: ['TCP'], allowedComponentTypes: ['kubernetes-workload'] },
              { id: 'database', direction: 'output', connectionTypes: ['database'], protocols: ['TCP'] },
            ]
          : messagingTypes.includes(typeId)
            ? [
                { id: 'client', direction: 'input', connectionTypes: ['messaging-client'], allowedComponentTypes: ['kubernetes-workload'] },
                { id: 'endpoint', direction: 'output', connectionTypes: ['messaging-endpoint'] },
              ]
            : flowPorts(portType)
  return openSourceTool(typeId, displayName, description, category, symbol, ports, documentation, availability)
}

const extendedCatalog: ComponentDefinition[] = [
  tool('opentofu', 'OpenTofu', 'Infrastructure as code for provisioning and managing cloud resources.', 'Infrastructure', 'TF', 'infrastructure', 'https://opentofu.org/docs/'),
  tool('crossplane', 'Crossplane', 'Compose infrastructure and platform APIs with Kubernetes.', 'Infrastructure', 'XP', 'infrastructure', 'https://docs.crossplane.io/'),
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

const additionalCatalog: ComponentDefinition[] = [
  // KloudLab's own infrastructure toolchain and AWS resources.
  openSourceTool('pulumi', 'Pulumi', 'Infrastructure as code using Go and cloud provider SDKs.', 'Infrastructure', 'PUL', [
    { id: 'source', direction: 'input', connectionTypes: ['iac-source'], allowedComponentTypes: ['github', 'gitlab'] },
    { id: 'state', direction: 'input', connectionTypes: ['object-storage'], allowedComponentTypes: ['aws-s3'] },
    { id: 'provider', direction: 'output', connectionTypes: ['pulumi-program'], allowedComponentTypes: ['pulumi-aws-provider'] },
  ], 'https://www.pulumi.com/docs/'),
  openSourceTool('github', 'GitHub', 'Git repository and collaboration platform used by KloudLab.', 'Source Control', 'GH', [
    { id: 'repository', direction: 'output', connectionTypes: ['iac-source'], allowedComponentTypes: ['pulumi', 'github-actions'] },
    { id: 'gitops', direction: 'output', connectionTypes: ['gitops-source'], allowedComponentTypes: ['argocd'] },
    { id: 'gitops-update', direction: 'input', connectionTypes: ['gitops-update'], allowedComponentTypes: ['github-actions'] },
  ], 'https://docs.github.com/', 'managed-service'),
  openSourceTool('github-actions', 'GitHub Actions', 'Repository workflows that validate code, publish images, and update GitOps manifests.', 'CI/CD', 'GHA', [
    { id: 'repository', direction: 'input', connectionTypes: ['iac-source'], allowedComponentTypes: ['github'] },
    { id: 'oidc', direction: 'output', connectionTypes: ['oidc-token'], allowedComponentTypes: ['aws-iam-role'] },
    { id: 'images', direction: 'output', connectionTypes: ['container-image'], allowedComponentTypes: ['amazon-ecr'] },
    { id: 'gitops-update', direction: 'output', connectionTypes: ['gitops-update'], allowedComponentTypes: ['github'] },
    { id: 'job-complete', direction: 'output', connectionTypes: ['workflow-dependency'], allowedComponentTypes: ['github-actions'] },
    { id: 'needs', direction: 'input', connectionTypes: ['workflow-dependency'], allowedComponentTypes: ['github-actions'] },
  ], 'https://docs.github.com/actions', 'managed-service'),
  definition('aws-iam-role', 'AWS IAM role', 'Scoped AWS permissions assumed by GitHub Actions or EKS workloads through short-lived identity.', 'Security', 'IAM', categoryAccent.Security, {
    name,
    trustSource: { type: 'string', title: 'Trusted identity source' },
    permissionScope: { type: 'string', title: 'Permission scope' },
  }, ['name'], [
    { id: 'provisioning', direction: 'input', connectionTypes: ['cloud-resource'], allowedComponentTypes: ['pulumi-aws-provider'] },
    { id: 'trust', direction: 'input', connectionTypes: ['oidc-token', 'pod-identity', 'role-assumption'], allowedComponentTypes: ['github-actions', 'eks-cluster', 'aws-iam-role'] },
    { id: 'identity', direction: 'output', connectionTypes: ['cloud-identity'], allowedComponentTypes: ['pulumi-aws-provider', 'amazon-ecr', 'eks-cluster', 'argocd', 'kubernetes-workload', 'aws-s3'] },
    { id: 'assume-role', direction: 'output', connectionTypes: ['role-assumption'], allowedComponentTypes: ['aws-iam-role'] },
  ], [], ['https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html']),
  openSourceTool('pulumi-aws-provider', 'Pulumi AWS Provider', 'Pulumi provider package used by KloudLab to provision AWS infrastructure.', 'Infrastructure', 'AWS', [
    { id: 'program', direction: 'input', connectionTypes: ['pulumi-program'], allowedComponentTypes: ['pulumi'], required: true, multiple: false },
    { id: 'identity', direction: 'input', connectionTypes: ['cloud-identity'], allowedComponentTypes: ['aws-iam-role'] },
    { id: 'resources', direction: 'output', connectionTypes: ['cloud-resource'], allowedComponentTypes: ['aws-vpc', 'eks-cluster', 'aws-iam-role', 'aws-s3', 'aws-kms', 'aws-route53', 'aws-subnet', 'aws-security-group', 'aws-nat-gateway', 'aws-vpc-peering'] },
  ], 'https://www.pulumi.com/registry/packages/aws/'),
  openSourceTool('aws-s3', 'Amazon S3 bucket', 'Object storage for Pulumi state, telemetry, and application data.', 'Storage', 'S3', [
    { id: 'provisioning', direction: 'input', connectionTypes: ['cloud-resource'], allowedComponentTypes: ['pulumi-aws-provider'] },
    { id: 'encryption', direction: 'input', connectionTypes: ['encryption-key'], allowedComponentTypes: ['aws-kms'] },
    { id: 'access', direction: 'input', connectionTypes: ['cloud-identity'], allowedComponentTypes: ['aws-iam-role'] },
    { id: 'objects', direction: 'output', connectionTypes: ['object-storage'] },
  ], 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html', 'cloud-hosting'),
  openSourceTool('aws-kms', 'AWS KMS key', 'Customer managed encryption key with rotation for state and secrets.', 'Security', 'KMS', [
    { id: 'provisioning', direction: 'input', connectionTypes: ['cloud-resource'], allowedComponentTypes: ['pulumi-aws-provider'] },
    { id: 'key', direction: 'output', connectionTypes: ['encryption-key'], allowedComponentTypes: ['aws-s3'] },
  ], 'https://docs.aws.amazon.com/kms/latest/developerguide/overview.html', 'cloud-hosting'),
  openSourceTool('aws-route53', 'Amazon Route 53', 'DNS hosting and health checks for public and private zones.', 'Networking', 'R53', [
    { id: 'provisioning', direction: 'input', connectionTypes: ['cloud-resource'], allowedComponentTypes: ['pulumi-aws-provider'] },
    { id: 'dns', direction: 'output', connectionTypes: ['dns-record'] },
  ], 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html', 'cloud-hosting'),
  openSourceTool('aws-subnet', 'AWS subnet', 'Public or private address range inside an Amazon VPC.', 'Networking', 'SUB', [
    { id: 'provisioning', direction: 'input', connectionTypes: ['cloud-resource'], allowedComponentTypes: ['pulumi-aws-provider'] },
    { id: 'network', direction: 'input', connectionTypes: ['network'], allowedComponentTypes: ['aws-vpc'], required: true, multiple: false },
    { id: 'subnet', direction: 'output', connectionTypes: ['network'] },
  ], 'https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html', 'cloud-hosting'),
  openSourceTool('aws-security-group', 'AWS security group', 'Stateful network rules for cloud network interfaces.', 'Security', 'SG', [
    { id: 'provisioning', direction: 'input', connectionTypes: ['cloud-resource'], allowedComponentTypes: ['pulumi-aws-provider'] },
    { id: 'network', direction: 'input', connectionTypes: ['network'], allowedComponentTypes: ['aws-vpc'], required: true, multiple: false },
    { id: 'rules', direction: 'output', connectionTypes: ['network-policy'] },
  ], 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html', 'cloud-hosting'),
  openSourceTool('aws-nat-gateway', 'AWS NAT Gateway', 'Managed outbound internet access for private subnets.', 'Networking', 'NAT', [
    { id: 'provisioning', direction: 'input', connectionTypes: ['cloud-resource'], allowedComponentTypes: ['pulumi-aws-provider'] },
    { id: 'network', direction: 'input', connectionTypes: ['network'], allowedComponentTypes: ['aws-subnet'], required: true, multiple: false },
    { id: 'egress', direction: 'output', connectionTypes: ['network-egress'] },
  ], 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html', 'cloud-hosting'),
  definition('amazon-ecr', 'Amazon ECR', 'Private container registry for KloudLab API and frontend images.', 'Artifact Registry', 'ECR', categoryAccent['Artifact Registry'], {
    name,
    region,
  }, ['name', 'region'], [
    { id: 'identity', direction: 'input', connectionTypes: ['cloud-identity'], allowedComponentTypes: ['aws-iam-role'] },
    { id: 'push', direction: 'input', connectionTypes: ['container-image'], allowedComponentTypes: ['github-actions'] },
    { id: 'image', direction: 'output', connectionTypes: ['container-image'], allowedComponentTypes: ['kubernetes-workload'] },
  ], [], ['https://docs.aws.amazon.com/AmazonECR/latest/userguide/what-is-ecr.html']),
  definition('cloudflare-dns', 'Cloudflare DNS', 'Public DNS provider for KloudLab hostnames and ExternalDNS records.', 'Networking', 'CF', categoryAccent.Networking, {
    name,
    zone: { type: 'string', title: 'DNS zone', pattern: '^[a-zA-Z0-9.-]+$' },
  }, ['name', 'zone'], [
    { id: 'provider', direction: 'output', connectionTypes: ['dns-provider'], allowedComponentTypes: ['external-dns'] },
  ], [], ['https://developers.cloudflare.com/dns/']),
  definition('aws-vpc-peering', 'AWS VPC peering mesh', 'Private connectivity between the management, app, and observability VPCs.', 'Networking', 'PEER', categoryAccent.Networking, {
    name,
  }, ['name'], [
    { id: 'provisioning', direction: 'input', connectionTypes: ['cloud-resource'], allowedComponentTypes: ['pulumi-aws-provider'] },
    { id: 'networks', direction: 'input', connectionTypes: ['network'], allowedComponentTypes: ['aws-vpc'] },
    { id: 'peering', direction: 'output', connectionTypes: ['vpc-peering'], allowedComponentTypes: ['eks-cluster'] },
  ], [], ['https://docs.aws.amazon.com/vpc/latest/peering/what-is-vpc-peering.html']),

  // Infrastructure, containers, delivery, and API routing.
  tool('ansible', 'Ansible', 'Agentless automation for operating systems, networks, and applications.', 'Infrastructure', 'ANS', 'automation', 'https://docs.ansible.com/'),
  tool('packer', 'Packer', 'Build identical machine images for multiple platforms.', 'Infrastructure', 'PKR', 'machine-image', 'https://developer.hashicorp.com/packer/docs'),
  tool('terragrunt', 'Terragrunt', 'Keep infrastructure as code configurations DRY across environments.', 'Infrastructure', 'TG', 'iac-source', 'https://terragrunt.gruntwork.io/docs/'),
  tool('atlantis', 'Atlantis', 'Run infrastructure plans and applies from pull requests.', 'Infrastructure', 'ATL', 'iac-source', 'https://www.runatlantis.io/docs/'),
  tool('sops', 'Mozilla SOPS', 'Encrypt configuration files and secrets with age, PGP, or cloud KMS.', 'Security', 'SOPS', 'secrets', 'https://getsops.io/docs/'),
  tool('aws-cdk', 'AWS Cloud Development Kit', 'Define AWS infrastructure using familiar programming languages.', 'Infrastructure', 'CDK', 'cloud-resource', 'https://docs.aws.amazon.com/cdk/v2/guide/home.html'),
  tool('nginx', 'NGINX', 'Web server, reverse proxy, and HTTP load balancer.', 'Gateway', 'NGX', 'http', 'https://nginx.org/en/docs/'),
  tool('haproxy', 'HAProxy', 'High availability TCP and HTTP load balancer and proxy.', 'Gateway', 'HAP', 'http', 'https://www.haproxy.org/#docs'),
  tool('envoy-proxy', 'Envoy Proxy', 'Layer 4 and layer 7 proxy for service and edge traffic.', 'Gateway', 'ENV', 'http', 'https://www.envoyproxy.io/docs/'),
  tool('apisix', 'Apache APISIX', 'Extensible API gateway with routing, authentication, and traffic policies.', 'Gateway', 'APX', 'http', 'https://apisix.apache.org/docs/'),
  tool('caddy', 'Caddy', 'Web server and reverse proxy with automatic HTTPS.', 'Gateway', 'CAD', 'http', 'https://caddyserver.com/docs/'),
  tool('contour', 'Contour', 'Kubernetes ingress controller powered by Envoy.', 'Gateway', 'CNT', 'http', 'https://projectcontour.io/docs/'),
  tool('headscale', 'Headscale', 'Self-hosted control server for a WireGuard based private network.', 'Networking', 'HS', 'network', 'https://headscale.net/stable/'),
  tool('wireguard', 'WireGuard', 'Modern, lightweight VPN tunnel for secure network connectivity.', 'Networking', 'WG', 'network', 'https://www.wireguard.com/'),
  tool('kube-vip', 'kube-vip', 'Virtual IP and load balancing for Kubernetes control planes and services.', 'Networking', 'VIP', 'network', 'https://kube-vip.io/docs/'),
  tool('docker', 'Docker Engine', 'Build and run OCI containers across development and production.', 'Runtime', 'DCK', 'container-image', 'https://docs.docker.com/engine/'),
  tool('podman', 'Podman', 'Daemonless container engine with Docker compatible workflows.', 'Runtime', 'POD', 'container-image', 'https://docs.podman.io/'),
  tool('containerd', 'containerd', 'Industry standard container runtime for Kubernetes and other platforms.', 'Runtime', 'CTD', 'container-image', 'https://containerd.io/docs/'),
  tool('buildah', 'Buildah', 'Build OCI container images without a long-running daemon.', 'CI/CD', 'BLD', 'container-image', 'https://buildah.io/'),
  tool('kubernetes', 'Kubernetes', 'Open source orchestration platform for containerized workloads.', 'Compute', 'K8S', 'workload', 'https://kubernetes.io/docs/'),
  tool('k3s', 'K3s', 'Lightweight Kubernetes distribution for edge and resource constrained clusters.', 'Compute', 'K3S', 'workload', 'https://docs.k3s.io/'),
  tool('kind', 'kind', 'Run local Kubernetes clusters using container nodes.', 'Compute', 'KIND', 'workload', 'https://kind.sigs.k8s.io/'),
  tool('kubevirt', 'KubeVirt', 'Run and manage virtual machines alongside Kubernetes containers.', 'Compute', 'KV', 'workload', 'https://kubevirt.io/user-guide/'),
  tool('openfaas', 'OpenFaaS', 'Build and operate serverless functions on Kubernetes or containers.', 'Application Platform', 'FAAS', 'workload', 'https://docs.openfaas.com/'),
  tool('wasmcloud', 'wasmCloud', 'Build portable WebAssembly applications and distributed services.', 'Application Platform', 'WASM', 'workload', 'https://wasmcloud.com/docs/'),
  tool('argo-rollouts', 'Argo Rollouts', 'Progressive delivery with canary, blue-green, and analysis strategies.', 'GitOps', 'AR', 'gitops-deployment', 'https://argo-rollouts.readthedocs.io/'),
  tool('flagger', 'Flagger', 'Progressive delivery operator for Kubernetes.', 'GitOps', 'FLG', 'gitops-deployment', 'https://docs.flagger.app/'),
  tool('kargo', 'Kargo', 'Promote software changes through multi-stage Kubernetes delivery.', 'GitOps', 'KGO', 'gitops-deployment', 'https://docs.kargo.io/'),
  tool('keptn', 'Keptn', 'Cloud native application lifecycle orchestration and delivery automation.', 'GitOps', 'KEPTN', 'gitops-deployment', 'https://keptn.sh/docs/'),
  tool('dagger', 'Dagger', 'Portable programmable CI/CD pipelines that run in containers.', 'CI/CD', 'DAG', 'workflow', 'https://docs.dagger.io/'),
  tool('earthly', 'Earthly', 'Reproducible build automation using containerized targets.', 'CI/CD', 'EARTH', 'workflow', 'https://docs.earthly.dev/'),
  tool('woodpecker', 'Woodpecker CI', 'Lightweight container based continuous integration server.', 'CI/CD', 'WP', 'workflow', 'https://woodpecker-ci.org/docs/'),
  tool('buildpacks', 'Cloud Native Buildpacks', 'Turn source code into production ready OCI container images.', 'CI/CD', 'CNB', 'container-image', 'https://buildpacks.io/docs/'),
  tool('gitlab-ci', 'GitLab CI/CD', 'Pipelines, runners, and deployment workflows for GitLab repositories.', 'CI/CD', 'GLCI', 'workflow', 'https://docs.gitlab.com/ci/', 'open-core'),
  tool('gitlab', 'GitLab', 'Source control, code review, CI/CD, and project collaboration.', 'Source Control', 'GL', 'git-source', 'https://docs.gitlab.com/', 'open-core'),
  tool('nexus', 'Nexus Repository', 'Repository manager for packages, containers, and build artifacts.', 'Artifact Registry', 'NX', 'artifact', 'https://help.sonatype.com/en/sonatype-nexus-repository.html'),
  tool('oci-distribution', 'OCI Distribution', 'Open source implementation of the OCI container registry protocol.', 'Artifact Registry', 'OCI', 'artifact', 'https://distribution.github.io/distribution/'),
  tool('chartmuseum', 'ChartMuseum', 'Open source Helm chart repository server.', 'Artifact Registry', 'CM', 'artifact', 'https://chartmuseum.com/docs/'),

  // Databases, queues, storage, and identity.
  tool('sqlite', 'SQLite', 'Embedded SQL database for local applications and edge workloads.', 'Database', 'SQL', 'database', 'https://sqlite.org/docs.html'),
  tool('tidb', 'TiDB', 'Distributed SQL database compatible with the MySQL ecosystem.', 'Database', 'TIDB', 'database', 'https://docs.pingcap.com/tidb/stable/'),
  tool('influxdb', 'InfluxDB', 'Time series database for metrics, events, and operational data.', 'Database', 'INF', 'database', 'https://docs.influxdata.com/'),
  tool('questdb', 'QuestDB', 'High performance time series database with SQL support.', 'Database', 'QDB', 'database', 'https://questdb.com/docs/'),
  tool('duckdb', 'DuckDB', 'In-process analytical database for local and embedded workloads.', 'Database', 'DUCK', 'database', 'https://duckdb.org/docs/'),
  tool('druid', 'Apache Druid', 'Real-time analytics database for event driven workloads.', 'Database', 'DR', 'database', 'https://druid.apache.org/docs/latest/'),
  tool('etcd', 'etcd', 'Consistent distributed key value store used for critical cluster state.', 'Database', 'ETCD', 'database', 'https://etcd.io/docs/'),
  tool('ferretdb', 'FerretDB', 'Open source document database compatible with the MongoDB wire protocol.', 'Database', 'FER', 'database', 'https://docs.ferretdb.io/'),
  tool('yugabytedb', 'YugabyteDB', 'Distributed SQL database for resilient cloud native applications.', 'Database', 'YB', 'database', 'https://docs.yugabyte.com/'),
  tool('pulsar', 'Apache Pulsar', 'Distributed messaging and event streaming platform.', 'Messaging', 'PULSAR', 'messaging', 'https://pulsar.apache.org/docs/'),
  tool('activemq-artemis', 'Apache ActiveMQ Artemis', 'High performance multi protocol message broker.', 'Messaging', 'AMQ', 'messaging', 'https://activemq.apache.org/components/artemis/documentation/'),
  tool('mosquitto', 'Eclipse Mosquitto', 'Lightweight MQTT broker for IoT and device messaging.', 'Messaging', 'MQTT', 'messaging', 'https://mosquitto.org/documentation/'),
  tool('emqx', 'EMQX', 'Scalable MQTT messaging platform for connected devices.', 'Messaging', 'EMQX', 'messaging', 'https://docs.emqx.com/'),
  tool('strimzi', 'Strimzi', 'Operators for running Apache Kafka on Kubernetes.', 'Messaging', 'STR', 'messaging', 'https://strimzi.io/documentation/'),
  tool('seaweedfs', 'SeaweedFS', 'Distributed object, file, and key value storage system.', 'Storage', 'SW', 'storage', 'https://github.com/seaweedfs/seaweedfs/wiki'),
  tool('garage', 'Garage', 'Self-hosted, geo-distributed S3 compatible object storage.', 'Storage', 'GAR', 'storage', 'https://garagehq.deuxfleurs.fr/documentation/'),
  tool('juicefs', 'JuiceFS', 'Cloud native shared file system with object storage backends.', 'Storage', 'JFS', 'storage', 'https://juicefs.com/docs/'),
  tool('glusterfs', 'GlusterFS', 'Scale out distributed file storage for unstructured data.', 'Storage', 'GLU', 'storage', 'https://docs.gluster.org/'),
  tool('openstack-swift', 'OpenStack Swift', 'Distributed object storage service for large data sets.', 'Storage', 'SWIFT', 'storage', 'https://docs.openstack.org/swift/latest/'),
  tool('authentik', 'Authentik', 'Identity provider for SSO, OAuth2, SAML, and application access.', 'Identity', 'AK', 'identity', 'https://docs.goauthentik.io/'),
  tool('zitadel', 'ZITADEL', 'Identity platform for secure login, organizations, and access control.', 'Identity', 'ZID', 'identity', 'https://zitadel.com/docs/'),
  tool('spire', 'SPIRE', 'Workload identity issuing and attesting SPIFFE identities.', 'Security', 'SPIRE', 'identity', 'https://spiffe.io/docs/latest/spire/'),
  tool('spicedb', 'SpiceDB', 'Relationship based authorization database inspired by Zanzibar.', 'Identity', 'SPICE', 'identity', 'https://authzed.com/docs/spicedb'),
  tool('ory-hydra', 'Ory Hydra', 'Open source OAuth 2.0 and OpenID Connect server.', 'Identity', 'HYDRA', 'identity', 'https://www.ory.sh/docs/hydra/'),
  tool('casbin', 'Casbin', 'Authorization library for access control models and policies.', 'Identity', 'CAS', 'identity', 'https://casbin.org/docs/'),

  // Observability, security, AI/ML, and data platforms.
  tool('thanos', 'Thanos', 'Highly available Prometheus compatible metrics storage and querying.', 'Observability', 'TH', 'telemetry', 'https://thanos.io/tip/thanos/'),
  tool('grafana-mimir', 'Grafana Mimir', 'Horizontally scalable, long term Prometheus metrics backend.', 'Observability', 'MIMIR', 'telemetry', 'https://grafana.com/docs/mimir/latest/'),
  tool('grafana-alloy', 'Grafana Alloy', 'OpenTelemetry collector distribution for metrics, logs, and traces.', 'Observability', 'ALLOY', 'telemetry', 'https://grafana.com/docs/alloy/latest/'),
  tool('signoz', 'SigNoz', 'Open source observability platform for traces, metrics, and logs.', 'Observability', 'SZ', 'telemetry', 'https://signoz.io/docs/'),
  tool('openobserve', 'OpenObserve', 'Open source platform for logs, metrics, traces, and analytics.', 'Observability', 'OO', 'telemetry', 'https://openobserve.ai/docs/'),
  tool('vector', 'Vector', 'High performance observability data pipeline and telemetry agent.', 'Observability', 'VEC', 'telemetry', 'https://vector.dev/docs/'),
  tool('fluentd', 'Fluentd', 'Unified log collection and routing across data sources.', 'Observability', 'FD', 'telemetry', 'https://docs.fluentd.org/'),
  tool('zabbix', 'Zabbix', 'Infrastructure monitoring for networks, servers, and applications.', 'Observability', 'ZBX', 'telemetry', 'https://www.zabbix.com/documentation/current/'),
  tool('netdata', 'Netdata', 'Real time monitoring and troubleshooting for systems and services.', 'Observability', 'ND', 'telemetry', 'https://learn.netdata.cloud/docs/'),
  tool('pyroscope', 'Grafana Pyroscope', 'Continuous profiling for applications and services.', 'Observability', 'PYR', 'telemetry', 'https://grafana.com/docs/pyroscope/latest/'),
  tool('opa', 'Open Policy Agent', 'General purpose policy engine for cloud native systems.', 'Security', 'OPA', 'security', 'https://www.openpolicyagent.org/docs/latest/'),
  tool('cosign', 'Cosign', 'Sign, verify, and attest container images and software artifacts.', 'Security', 'COS', 'security', 'https://docs.sigstore.dev/cosign/'),
  tool('syft', 'Syft', 'Generate software bills of materials from container images and filesystems.', 'Security', 'SYFT', 'security', 'https://oss.anchore.com/docs/'),
  tool('grype', 'Grype', 'Scan container images and filesystems for known vulnerabilities.', 'Security', 'GRY', 'security', 'https://oss.anchore.com/docs/'),
  tool('renovate', 'Renovate', 'Automate dependency updates across repositories and ecosystems.', 'Security', 'REN', 'security', 'https://docs.renovatebot.com/'),
  tool('tetragon', 'Tetragon', 'eBPF based runtime security and observability for Kubernetes.', 'Security', 'TET', 'security', 'https://tetragon.io/docs/'),
  tool('wazuh', 'Wazuh', 'Open source security monitoring, threat detection, and compliance platform.', 'Security', 'WAZ', 'security', 'https://documentation.wazuh.com/'),
  tool('crowdsec', 'CrowdSec', 'Collaborative behavior detection and security blocking engine.', 'Security', 'CS', 'security', 'https://docs.crowdsec.net/'),
  tool('kubeflow', 'Kubeflow', 'Machine learning platform for training and serving on Kubernetes.', 'AI & ML', 'KF', 'workload', 'https://www.kubeflow.org/docs/'),
  tool('mlflow', 'MLflow', 'Track experiments and manage machine learning model lifecycles.', 'AI & ML', 'MLF', 'workflow', 'https://mlflow.org/docs/latest/'),
  tool('kserve', 'KServe', 'Standardized model inference serving on Kubernetes.', 'AI & ML', 'KS', 'workload', 'https://kserve.github.io/website/'),
  tool('ray', 'Ray', 'Distributed compute framework for AI and Python applications.', 'AI & ML', 'RAY', 'workload', 'https://docs.ray.io/'),
  tool('vllm', 'vLLM', 'High throughput inference and serving engine for large language models.', 'AI & ML', 'VLLM', 'workload', 'https://docs.vllm.ai/'),
  tool('ollama', 'Ollama', 'Run and serve large language models on local or hosted infrastructure.', 'AI & ML', 'OLL', 'workload', 'https://docs.ollama.com/'),
  tool('feast', 'Feast', 'Open source feature store for machine learning systems.', 'AI & ML', 'FEAST', 'database', 'https://docs.feast.dev/'),
  tool('bentoml', 'BentoML', 'Package and deploy machine learning models as production services.', 'AI & ML', 'BENTO', 'workload', 'https://docs.bentoml.com/'),
  tool('airflow', 'Apache Airflow', 'Author, schedule, and monitor data engineering workflows.', 'Data & Workflow', 'AF', 'workflow', 'https://airflow.apache.org/docs/'),
  tool('dagster', 'Dagster', 'Orchestrate data assets, pipelines, and machine learning workflows.', 'Data & Workflow', 'DAG', 'workflow', 'https://docs.dagster.io/'),
  tool('spark', 'Apache Spark', 'Distributed engine for large scale data processing and analytics.', 'Data & Workflow', 'SPARK', 'workflow', 'https://spark.apache.org/docs/latest/'),
  tool('flink', 'Apache Flink', 'Stateful stream processing for event driven applications.', 'Data & Workflow', 'FLINK', 'messaging', 'https://flink.apache.org/documentation/'),
  tool('trino', 'Trino', 'Distributed SQL query engine for data across heterogeneous sources.', 'Data & Workflow', 'TRINO', 'database', 'https://trino.io/docs/current/'),
  tool('superset', 'Apache Superset', 'Explore data and build dashboards with a modern BI platform.', 'Data & Workflow', 'SUPER', 'telemetry', 'https://superset.apache.org/docs/'),
  tool('dbt-core', 'dbt Core', 'Transform analytics data with modular SQL and software engineering workflows.', 'Data & Workflow', 'DBT', 'workflow', 'https://docs.getdbt.com/docs/core/about-core-setup'),
  tool('openlineage', 'OpenLineage', 'Collect and share lineage metadata for data pipelines.', 'Data & Workflow', 'OL', 'telemetry', 'https://openlineage.io/docs/'),
  tool('go', 'Go', 'Programming language and runtime used by KloudLab infrastructure components.', 'Developer Tools', 'GO', 'artifact', 'https://go.dev/doc/'),
  tool('openfeature', 'OpenFeature', 'Vendor neutral APIs for feature flagging in applications.', 'Developer Tools', 'OF', 'workload', 'https://openfeature.dev/docs/'),
  tool('grpc', 'gRPC', 'High performance remote procedure call framework for service APIs.', 'API & Integration', 'gRPC', 'http', 'https://grpc.io/docs/'),
  tool('apache-camel', 'Apache Camel', 'Integration framework for connecting APIs, services, and data systems.', 'API & Integration', 'CAMEL', 'messaging', 'https://camel.apache.org/manual/'),
  tool('temporal', 'Temporal', 'Durable execution engine for reliable application workflows.', 'API & Integration', 'TEMP', 'workflow', 'https://docs.temporal.io/'),
  tool('opencost', 'OpenCost', 'Measure Kubernetes infrastructure spend and allocate costs to teams.', 'FinOps', 'OC', 'telemetry', 'https://opencost.io/docs/'),
  tool('kubecost', 'Kubecost', 'Kubernetes cost monitoring and optimization with a free open source core.', 'FinOps', 'KCOST', 'telemetry', 'https://docs.kubecost.com/architecture'),
]

export const catalog: ComponentDefinition[] = [
  definition('aws-vpc', 'Amazon VPC', 'Isolated network boundary for cloud resources.', 'Infrastructure', 'VPC', '#5f7f6b', {
    name,
    cidr: { type: 'string', title: 'IPv4 CIDR', pattern: '^([0-9]{1,3}\\.){3}[0-9]{1,3}/([0-9]|[1-2][0-9]|3[0-2])$' },
    region,
    availabilityZones: { type: 'number', title: 'Availability zones', minimum: 2, maximum: 6 },
  }, ['name', 'cidr', 'region', 'availabilityZones'], [
    { id: 'provisioning', direction: 'input', connectionTypes: ['cloud-resource'], allowedComponentTypes: ['pulumi-aws-provider'] },
    { id: 'network', direction: 'output', connectionTypes: ['network'] },
  ], [
    { id: 'vpc.cidr', scope: 'configuration', severity: 'error', message: 'Use a valid IPv4 network range.' },
    { id: 'vpc.capacity', scope: 'configuration', severity: 'warning', message: 'This network CIDR may be too small for a growing cluster.', description: 'Small address pools can run out as nodes, pods, load balancers, and private endpoints consume addresses.', options: ['Choose a larger VPC CIDR, such as a /20 or larger address block.', 'Keep this range only if pod and subnet capacity has been calculated for expected growth.'] },
  ], ['https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html'], { kind: 'pulumi-go', reference: 'components/network', version: '1.0.0' }),

  definition('eks-cluster', 'Amazon EKS', 'Managed Kubernetes control plane with private worker subnets.', 'Compute', 'EKS', '#447eb4', {
    name,
    region,
    kubernetesVersion: { type: 'string', title: 'Kubernetes version', enum: ['1.36', '1.34', '1.33', '1.32'] },
    apiAccess: { type: 'string', title: 'API endpoint', enum: ['Private', 'Private and public'] },
    availabilityZones: { type: 'number', title: 'Availability zones', minimum: 1, maximum: 6 },
  }, ['name', 'region', 'kubernetesVersion', 'apiAccess', 'availabilityZones'], [
    { id: 'provisioning', direction: 'input', connectionTypes: ['cloud-resource'], allowedComponentTypes: ['pulumi-aws-provider'] },
    { id: 'iam-role', direction: 'input', connectionTypes: ['cloud-identity'], allowedComponentTypes: ['aws-iam-role'] },
    { id: 'network', direction: 'input', connectionTypes: ['network'], required: true, multiple: false },
    { id: 'peering', direction: 'input', connectionTypes: ['vpc-peering'], allowedComponentTypes: ['aws-vpc-peering'] },
    { id: 'workloads', direction: 'output', connectionTypes: ['workload'] },
    { id: 'telemetry', direction: 'output', connectionTypes: ['telemetry'] },
    { id: 'pod-identity', direction: 'output', connectionTypes: ['pod-identity'], allowedComponentTypes: ['aws-iam-role'] },
  ], [
    { id: 'eks.multi-az', scope: 'configuration', severity: 'warning', message: 'This cluster spans fewer than two availability zones.', description: 'A zone outage could make the whole cluster unavailable.', options: ['Use at least two availability zones for the cluster.', 'Keep one zone only for a deliberate development or cost-saving environment.'] },
  ], ['https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html'], { kind: 'pulumi-go', reference: 'components/eks', version: '1.0.0' }),

  definition('kubernetes-workload', 'Kubernetes workload', 'Application or platform service running in a cluster.', 'Compute', 'APP', '#7b70b2', {
    name,
    namespace: { type: 'string', title: 'Namespace', pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' },
    replicas: { type: 'number', title: 'Replicas', minimum: 1, maximum: 100 },
    exposure: { type: 'string', title: 'Exposure', enum: ['Private', 'Gateway'] },
  }, ['name', 'namespace', 'replicas', 'exposure'], [
    { id: 'cluster', direction: 'input', connectionTypes: ['workload'], required: true, multiple: false },
    { id: 'http', direction: 'input', connectionTypes: ['http-service'], protocols: ['HTTP', 'HTTPS'], allowedComponentTypes: ['kgateway', 'envoy-gateway', 'traefik', 'kong', 'nginx', 'haproxy', 'envoy-proxy', 'apisix', 'caddy', 'contour'], multiple: false },
    { id: 'image', direction: 'input', connectionTypes: ['container-image'], allowedComponentTypes: ['amazon-ecr'] },
    { id: 'aws-identity', direction: 'input', connectionTypes: ['cloud-identity'], allowedComponentTypes: ['aws-iam-role'] },
    { id: 'oidc', direction: 'input', connectionTypes: ['oidc'] },
    { id: 'identity', direction: 'input', connectionTypes: ['identity-decision'] },
    { id: 'database', direction: 'input', connectionTypes: ['database'], protocols: ['TCP'] },
    { id: 'database-client', direction: 'output', connectionTypes: ['database-client'], protocols: ['TCP'], allowedComponentTypes: ['postgresql', 'mysql', 'mariadb', 'valkey', 'clickhouse', 'cassandra', 'sqlite', 'tidb', 'influxdb', 'questdb', 'duckdb', 'druid', 'etcd', 'ferretdb', 'yugabytedb'] },
    { id: 'messaging-client', direction: 'output', connectionTypes: ['messaging-client'], allowedComponentTypes: ['nats', 'rabbitmq', 'kafka', 'pulsar', 'activemq-artemis', 'mosquitto', 'emqx'] },
    { id: 'messaging-endpoint', direction: 'input', connectionTypes: ['messaging-endpoint'], allowedComponentTypes: ['nats', 'rabbitmq', 'kafka', 'pulsar', 'activemq-artemis', 'mosquitto', 'emqx'] },
    { id: 'messaging-endpoint', direction: 'input', connectionTypes: ['messaging-endpoint'], allowedComponentTypes: ['nats', 'rabbitmq', 'kafka', 'pulsar', 'activemq-artemis', 'mosquitto', 'emqx'] },
    { id: 'delivery', direction: 'input', connectionTypes: ['gitops-deployment'], allowedComponentTypes: ['argocd', 'flux', 'argo-rollouts', 'flagger', 'kargo'] },
    { id: 'secrets', direction: 'input', connectionTypes: ['secrets'], allowedComponentTypes: ['infisical', 'openbao', 'external-secrets'] },
    { id: 'autoscaling', direction: 'input', connectionTypes: ['autoscaling'], allowedComponentTypes: ['keda'] },
    { id: 'service', direction: 'output', connectionTypes: ['http-service'], protocols: ['HTTP', 'HTTPS'], allowedComponentTypes: ['kubernetes-service'] },
    { id: 'authorization', direction: 'output', connectionTypes: ['authorization-check'] },
    { id: 'telemetry', direction: 'output', connectionTypes: ['telemetry'] },
  ], [
    { id: 'workload.private', scope: 'configuration', severity: 'warning', message: 'Gateway exposure is selected, but no gateway route reaches this workload.', description: 'The application is marked for gateway exposure but has no compatible route connection.', options: ['Connect a Kubernetes Service to an HTTP gateway route.', 'Set exposure to Private if the application should remain internal.'] },
    { id: 'workload.redundancy', scope: 'configuration', severity: 'warning', message: 'This workload has a single replica.', description: 'A single pod restart or node failure can interrupt the application.', options: ['Set replicas to 2 or more.', 'Keep one replica for a development workload where interruption is acceptable.'] },
    { id: 'workload.autoscaling', scope: 'architecture', severity: 'info', message: 'Consider autoscaling this workload.', description: 'The workload has multiple fixed replicas and no autoscaler is connected to it.', options: ['Add KEDA and connect it to this workload to scale from events or metrics.', 'Keep a fixed replica count if load is predictable.'] },
    { id: 'workload.secrets', scope: 'architecture', severity: 'info', message: 'No secrets manager is connected to this workload.', description: 'A secrets manager can centralize rotation and control which workloads can read credentials.', options: ['Add Infisical, OpenBao, or External Secrets Operator and connect its secret output.', 'Use your cloud provider’s managed secrets service if it fits the hosting environment.'] },
  ], ['https://kubernetes.io/docs/concepts/workloads/']),

  definition('kubernetes-service', 'Kubernetes Service', 'Stable in-cluster endpoint that routes HTTP traffic to application workloads.', 'Networking', 'SVC', '#4d9da4', {
    name,
    serviceType: { type: 'string', title: 'Service type', enum: ['ClusterIP', 'NodePort', 'LoadBalancer'] },
    port: { type: 'number', title: 'Service port', minimum: 1, maximum: 65535 },
    protocol: { type: 'string', title: 'Application protocol', enum: ['HTTP', 'HTTPS'] },
  }, ['name', 'serviceType', 'port', 'protocol'], [
    { id: 'backend', direction: 'input', connectionTypes: ['http-service'], protocols: ['HTTP', 'HTTPS'], allowedComponentTypes: ['kubernetes-workload'], required: true },
    { id: 'route', direction: 'output', connectionTypes: ['http-route'], protocols: ['HTTP', 'HTTPS'], allowedComponentTypes: ['kgateway', 'envoy-gateway', 'traefik', 'kong'] },
  ], [], ['https://kubernetes.io/docs/concepts/services-networking/service/']),

  definition('kgateway', 'Gateway', 'Routes approved HTTP traffic to application services.', 'Gateway', 'GW', '#d27f4d', {
    name,
    hostname: { type: 'string', title: 'Hostname', pattern: '^[a-zA-Z0-9.-]+$' },
    exposure: { type: 'string', title: 'Exposure', enum: ['Public', 'Private'] },
    tls: { type: 'string', title: 'TLS', enum: ['Managed certificate', 'Bring your own'] },
  }, ['name', 'hostname', 'exposure', 'tls'], [
    { id: 'cluster', direction: 'input', connectionTypes: ['workload'], required: true, multiple: false },
    { id: 'route', direction: 'input', connectionTypes: ['http-route'], protocols: ['HTTP', 'HTTPS'], allowedComponentTypes: ['kubernetes-service'] },
    { id: 'dns', direction: 'input', connectionTypes: ['dns-record'], allowedComponentTypes: ['external-dns'] },
    { id: 'certificate', direction: 'input', connectionTypes: ['tls-certificate'], allowedComponentTypes: ['cert-manager'] },
    { id: 'service', direction: 'output', connectionTypes: ['http-service'], protocols: ['HTTP', 'HTTPS'], allowedComponentTypes: ['kubernetes-workload', 'argocd', 'grafana'] },
    { id: 'delivery', direction: 'input', connectionTypes: ['gitops-deployment'], allowedComponentTypes: ['argocd'] },
  ], [
    { id: 'gateway.tls', scope: 'configuration', severity: 'error', message: 'Public routes must use TLS.' },
  ], ['https://gateway-api.sigs.k8s.io/']),

  definition('postgresql', 'PostgreSQL', 'Durable relational data store for application or identity services.', 'Database', 'PG', '#407f91', {
    name,
    engine: { type: 'string', title: 'Engine', enum: ['PostgreSQL 17', 'PostgreSQL 16'] },
    exposure: { type: 'string', title: 'Network access', enum: ['Private only', 'Public'] },
    backupDays: { type: 'number', title: 'Backup retention (days)', minimum: 1, maximum: 35 },
  }, ['name', 'engine', 'exposure', 'backupDays'], [
    { id: 'cluster', direction: 'input', connectionTypes: ['workload'], allowedComponentTypes: ['eks-cluster'] },
    { id: 'client', direction: 'input', connectionTypes: ['database-client'], protocols: ['TCP'], allowedComponentTypes: ['kubernetes-workload'] },
    { id: 'database', direction: 'output', connectionTypes: ['database'], protocols: ['TCP'] },
    { id: 'delivery', direction: 'input', connectionTypes: ['gitops-deployment'], allowedComponentTypes: ['argocd'] },
  ], [
    { id: 'database.private', scope: 'configuration', severity: 'warning', message: 'This database is configured for public network access.', description: 'A public database endpoint increases the chance of unauthorized access and data exposure.', options: ['Change network access to Private only.', 'If public access is required, restrict inbound CIDRs and require TLS and strong authentication.'] },
    { id: 'database.backup', scope: 'configuration', severity: 'warning', message: 'Database backup retention is under seven days.', description: 'A short retention window may not be enough to recover from delayed discovery or accidental deletion.', options: ['Increase backup retention to at least 7 days.', 'Use 14–35 days when recovery requirements or compliance needs justify it.'] },
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
    { id: 'cluster', direction: 'input', connectionTypes: ['workload'], allowedComponentTypes: ['eks-cluster'] },
    { id: 'database', direction: 'input', connectionTypes: ['database'], protocols: ['TCP'], required: true, multiple: false },
    { id: 'check', direction: 'input', connectionTypes: ['authorization-check'], required: true },
    { id: 'decision', direction: 'output', connectionTypes: ['identity-decision'] },
    { id: 'delivery', direction: 'input', connectionTypes: ['gitops-deployment'], allowedComponentTypes: ['argocd'] },
  ], [
    { id: 'openfga.private', scope: 'configuration', severity: 'error', message: 'Keep OpenFGA on a private endpoint.' },
  ], ['https://openfga.dev/docs']),

  definition('otel-collector', 'OpenTelemetry Collector', 'Receives and routes metrics, logs, and traces.', 'Observability', 'OTEL', '#6b7fbd', {
    name,
    mode: { type: 'string', title: 'Deployment mode', enum: ['Gateway', 'Agent'] },
    protocol: { type: 'string', title: 'OTLP transport', enum: ['gRPC', 'HTTP'] },
    authentication: { type: 'string', title: 'Receiver access', enum: ['Authenticated', 'Private network'] },
  }, ['name', 'mode', 'protocol', 'authentication'], [
    { id: 'cluster', direction: 'input', connectionTypes: ['workload'], allowedComponentTypes: ['eks-cluster'] },
    { id: 'telemetry', direction: 'input', connectionTypes: ['telemetry'], required: true },
    { id: 'metrics', direction: 'output', connectionTypes: ['metrics'] },
    { id: 'logs', direction: 'output', connectionTypes: ['logs'] },
    { id: 'traces', direction: 'output', connectionTypes: ['traces'] },
    { id: 'forward', direction: 'output', connectionTypes: ['telemetry'] },
    { id: 'delivery', direction: 'input', connectionTypes: ['gitops-deployment'], allowedComponentTypes: ['argocd'] },
  ], [
    { id: 'otel.auth', scope: 'configuration', severity: 'warning', message: 'Collector receivers do not require authentication.', description: 'Untrusted clients could send telemetry, consume resources, or inject misleading data.', options: ['Require authenticated receiver access.', 'Keep the receiver on a private network and restrict which workloads can reach it.'] },
  ], ['https://opentelemetry.io/docs/collector/']),

  definition('prometheus', 'Prometheus', 'Time-series metrics collection and querying.', 'Observability', 'P', '#d26951', {
    name,
    retention: { type: 'string', title: 'Retention', enum: ['7 days', '14 days', '30 days', '90 days'] },
    storage: { type: 'string', title: 'Storage', enum: ['Persistent volume', 'Object storage'] },
  }, ['name', 'retention', 'storage'], [
    { id: 'cluster', direction: 'input', connectionTypes: ['workload'], allowedComponentTypes: ['eks-cluster'] },
    { id: 'metrics', direction: 'input', connectionTypes: ['metrics'], required: true },
    { id: 'dashboard', direction: 'output', connectionTypes: ['observability-backend'] },
    { id: 'delivery', direction: 'input', connectionTypes: ['gitops-deployment'], allowedComponentTypes: ['argocd'] },
  ], [], ['https://prometheus.io/docs/introduction/overview/']),

  definition('loki', 'Loki', 'Log aggregation with label-based indexing.', 'Observability', 'L', '#7b69a5', {
    name,
    retention: { type: 'string', title: 'Retention', enum: ['7 days', '14 days', '30 days', '90 days'] },
    storage: { type: 'string', title: 'Storage', enum: ['Object storage'] },
  }, ['name', 'retention', 'storage'], [
    { id: 'cluster', direction: 'input', connectionTypes: ['workload'], allowedComponentTypes: ['eks-cluster'] },
    { id: 'logs', direction: 'input', connectionTypes: ['logs'], required: true },
    { id: 'storage', direction: 'input', connectionTypes: ['object-storage'], allowedComponentTypes: ['aws-s3'] },
    { id: 'dashboard', direction: 'output', connectionTypes: ['observability-backend'] },
    { id: 'delivery', direction: 'input', connectionTypes: ['gitops-deployment'], allowedComponentTypes: ['argocd'] },
  ], [], ['https://grafana.com/docs/loki/latest/']),

  definition('tempo', 'Tempo', 'Distributed tracing backend for OpenTelemetry traces.', 'Observability', 'T', '#4d8290', {
    name,
    retention: { type: 'string', title: 'Retention', enum: ['7 days', '14 days', '30 days', '90 days'] },
    storage: { type: 'string', title: 'Storage', enum: ['Object storage'] },
  }, ['name', 'retention', 'storage'], [
    { id: 'cluster', direction: 'input', connectionTypes: ['workload'], allowedComponentTypes: ['eks-cluster'] },
    { id: 'traces', direction: 'input', connectionTypes: ['traces'], required: true },
    { id: 'storage', direction: 'input', connectionTypes: ['object-storage'], allowedComponentTypes: ['aws-s3'] },
    { id: 'dashboard', direction: 'output', connectionTypes: ['observability-backend'] },
    { id: 'delivery', direction: 'input', connectionTypes: ['gitops-deployment'], allowedComponentTypes: ['argocd'] },
  ], [], ['https://grafana.com/docs/tempo/latest/']),

  definition('grafana', 'Grafana', 'Dashboards and alerts across approved observability sources.', 'Observability', 'G', '#d18c50', {
    name,
    access: { type: 'string', title: 'Access', enum: ['Private', 'Restricted'] },
    authentication: { type: 'string', title: 'Authentication', enum: ['OIDC'] },
  }, ['name', 'access', 'authentication'], [
    { id: 'cluster', direction: 'input', connectionTypes: ['workload'], allowedComponentTypes: ['eks-cluster'] },
    { id: 'sources', direction: 'input', connectionTypes: ['observability-backend'], required: true },
    { id: 'http', direction: 'input', connectionTypes: ['http-service'], allowedComponentTypes: ['kgateway'] },
    { id: 'delivery', direction: 'input', connectionTypes: ['gitops-deployment'], allowedComponentTypes: ['argocd'] },
  ], [
    { id: 'grafana.restricted', scope: 'configuration', severity: 'error', message: 'Grafana must not be publicly unauthenticated.' },
  ], ['https://grafana.com/docs/grafana/latest/']),

  definition('infisical', 'Infisical', 'Central secrets management with scoped workload access.', 'Security', 'SEC', '#748b5a', {
    name,
    deployment: { type: 'string', title: 'Deployment', enum: ['Self-hosted', 'Managed'] },
    recovery: { type: 'string', title: 'Recovery path', enum: ['Independent backup'] },
    secretReference: { type: 'string', title: 'Reference example', description: 'A path or identifier only. Never enter secret values.' },
  }, ['name', 'deployment', 'recovery'], [
    { id: 'secrets', direction: 'output', connectionTypes: ['secrets'], allowedComponentTypes: ['kubernetes-workload'] },
  ], [
    { id: 'secrets.recovery', scope: 'configuration', severity: 'warning', message: 'Secrets management needs an independent recovery path.' },
  ], ['https://infisical.com/docs/documentation/getting-started/introduction']),
  ...extendedCatalog,
  ...additionalCatalog,
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
  if (component.typeId === 'kubernetes-service') {
    defaults.port = 80
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
