import { catalogById, type ComponentDefinition, type ComponentPort } from './catalog'

export interface ConnectionEndpoint {
  id: string
  typeId: string
  config?: Record<string, unknown>
}

export interface ExistingConnection {
  source: string
  sourcePort: string
  target: string
  targetPort: string
}

export interface CompatiblePortPair {
  source: ComponentPort
  target: ComponentPort
}

export type ConnectionCheck =
  | { valid: true; pair: CompatiblePortPair }
  | { valid: false; reason: string; options: string[] }

function effectiveProtocols(port: ComponentPort, config?: Record<string, unknown>): string[] | undefined {
  if (!port.protocols?.length) return undefined
  const configured = config?.protocol
  return typeof configured === 'string' ? port.protocols.filter((protocol) => protocol === configured) : port.protocols
}

function protocolsMatch(source: ComponentPort, target: ComponentPort, sourceConfig?: Record<string, unknown>, targetConfig?: Record<string, unknown>): boolean {
  const sourceProtocols = effectiveProtocols(source, sourceConfig)
  const targetProtocols = effectiveProtocols(target, targetConfig)
  if (!sourceProtocols?.length || !targetProtocols?.length) return true
  return sourceProtocols.some((protocol) => targetProtocols.includes(protocol))
}

export function compatiblePortPairs(
  source: ComponentDefinition,
  target: ComponentDefinition,
  sourceConfig?: Record<string, unknown>,
  targetConfig?: Record<string, unknown>,
): CompatiblePortPair[] {
  const pairs: CompatiblePortPair[] = []
  for (const sourcePort of source.ports.filter((port) => port.direction === 'output')) {
    if (sourcePort.allowedComponentTypes && !sourcePort.allowedComponentTypes.includes(target.typeId)) continue
    for (const targetPort of target.ports.filter((port) => port.direction === 'input')) {
      if (targetPort.allowedComponentTypes && !targetPort.allowedComponentTypes.includes(source.typeId)) continue
      const sharedType = sourcePort.connectionTypes.some((connectionType) => targetPort.connectionTypes.includes(connectionType))
      if (sharedType && protocolsMatch(sourcePort, targetPort, sourceConfig, targetConfig)) pairs.push({ source: sourcePort, target: targetPort })
    }
  }
  return pairs
}

function advertisedPorts(component: ComponentDefinition, direction: 'input' | 'output'): string {
  const types = [...new Set(component.ports.filter((port) => port.direction === direction).flatMap((port) => port.connectionTypes))]
  return types.length ? types.join(', ') : 'none'
}

function incompatiblePortReason(source: ComponentDefinition, target: ComponentDefinition, sourceConfig?: Record<string, unknown>, targetConfig?: Record<string, unknown>): string {
  const candidates = source.ports.filter((port) => port.direction === 'output').flatMap((sourcePort) =>
    target.ports.filter((port) => port.direction === 'input').map((targetPort) => ({ sourcePort, targetPort })))
  const sharedTypes = candidates.filter(({ sourcePort, targetPort }) =>
    sourcePort.connectionTypes.some((type) => targetPort.connectionTypes.includes(type)))
  if (!sharedTypes.length) {
    return `No matching port types: ${source.displayName} outputs ${advertisedPorts(source, 'output')}; ${target.displayName} accepts ${advertisedPorts(target, 'input')}.`
  }
  const allowedTypes = sharedTypes.filter(({ sourcePort, targetPort }) =>
    (!sourcePort.allowedComponentTypes || sourcePort.allowedComponentTypes.includes(target.typeId)) &&
    (!targetPort.allowedComponentTypes || targetPort.allowedComponentTypes.includes(source.typeId)))
  if (!allowedTypes.length) {
    const types = [...new Set(sharedTypes.flatMap(({ sourcePort }) => sourcePort.connectionTypes.filter((type) =>
      sharedTypes.some(({ targetPort }) => targetPort.connectionTypes.includes(type)))))].join(', ')
    return `${source.displayName} and ${target.displayName} share ${types} ports, but this component relationship is not supported.`
  }
  const protocolsMatchForAnyPair = allowedTypes.some(({ sourcePort, targetPort }) => protocolsMatch(sourcePort, targetPort, sourceConfig, targetConfig))
  if (!protocolsMatchForAnyPair) {
    const sourceProtocol = typeof sourceConfig?.protocol === 'string' ? sourceConfig.protocol : undefined
    const targetProtocol = typeof targetConfig?.protocol === 'string' ? targetConfig.protocol : undefined
    const detail = sourceProtocol && targetProtocol ? ` (${sourceProtocol} to ${targetProtocol})` : ''
    return `The matching ports do not support the configured protocols${detail}.`
  }
  return `No compatible ports: ${source.displayName} outputs ${advertisedPorts(source, 'output')}; ${target.displayName} accepts ${advertisedPorts(target, 'input')}.`
}

export function checkConnection(
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
  existing: ExistingConnection[],
  preferred?: { sourcePort?: string; targetPort?: string },
): ConnectionCheck {
  if (source.id === target.id) {
    return { valid: false, reason: 'A component cannot connect to itself.', options: ['Choose a different target component.'] }
  }
  const sourceComponent = catalogById.get(source.typeId)
  const targetComponent = catalogById.get(target.typeId)
  if (!sourceComponent || !targetComponent) {
    return { valid: false, reason: 'One of the selected components is missing from the catalog.', options: ['Remove the stale component and add it again from the catalog.'] }
  }

  let pairs = compatiblePortPairs(sourceComponent, targetComponent, source.config, target.config)
  if (!pairs.length) {
    return {
      valid: false,
      reason: incompatiblePortReason(sourceComponent, targetComponent, source.config, target.config),
      options: ['Choose components with matching port types and supported protocols.', 'Add a supported integration component between them, such as a Kubernetes Service for HTTP traffic.'],
    }
  }

  const sourcePortIsKnown = preferred?.sourcePort && sourceComponent.ports.some((port) => port.direction === 'output' && port.id === preferred.sourcePort)
  const targetPortIsKnown = preferred?.targetPort && targetComponent.ports.some((port) => port.direction === 'input' && port.id === preferred.targetPort)
  if (sourcePortIsKnown) pairs = pairs.filter((pair) => pair.source.id === preferred?.sourcePort)
  if (targetPortIsKnown) pairs = pairs.filter((pair) => pair.target.id === preferred?.targetPort)
  if (!pairs.length) {
    return { valid: false, reason: 'The saved port selection is not compatible with these components.', options: ['Remove this link and reconnect through compatible ports.'] }
  }

  const available = pairs.find(({ source: sourcePort, target: targetPort }) => {
    const outgoing = existing.filter((edge) => edge.source === source.id && edge.sourcePort === sourcePort.id)
    const incoming = existing.filter((edge) => edge.target === target.id && edge.targetPort === targetPort.id)
    const duplicate = existing.some((edge) => edge.source === source.id && edge.sourcePort === sourcePort.id && edge.target === target.id && edge.targetPort === targetPort.id)
    return !duplicate && (sourcePort.multiple !== false || outgoing.length === 0) && (targetPort.multiple !== false || incoming.length === 0)
  })
  if (!available) {
    const existingPair = pairs[0]
    const inputAtCapacity = existingPair.target.multiple === false && existing.some((edge) => edge.target === target.id && edge.targetPort === existingPair.target.id)
    return {
      valid: false,
      reason: inputAtCapacity ? `${targetComponent.displayName} already has a connection on its ${existingPair.target.id} input.` : 'This connection already exists or its output port is already in use.',
      options: ['Remove the existing connection first.', 'Choose a component with an available compatible port.'],
    }
  }
  return { valid: true, pair: available }
}
