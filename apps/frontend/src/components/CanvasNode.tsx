import { type CSSProperties } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { catalogById } from '../domain/catalog'

export interface ComponentNodeData extends Record<string, unknown> {
  typeId: string
  componentVersion: string
  title: string
  config: Record<string, unknown>
  connectionTarget?: boolean
  connectionSource?: boolean
}

export type ComponentFlowNode = Node<ComponentNodeData, 'component'>

function announcePortClick(nodeId: string, direction: 'input' | 'output') {
  window.dispatchEvent(new CustomEvent('kloudlab:connector-click', { detail: { nodeId, direction } }))
}

export function CanvasNode({ id, data, selected }: NodeProps<ComponentFlowNode>) {
  const component = catalogById.get(data.typeId)
  if (!component) return null

  return (
    <article className={`component-node${selected ? ' is-selected' : ''}${data.connectionSource ? ' is-connection-source' : ''}${data.connectionTarget ? ' is-connection-target' : ''}`} style={{ '--node-accent': component.accent } as CSSProperties}>
      <Handle id="input" type="target" position={Position.Left} className="node-handle node-handle-input" isConnectable onClick={(event) => { event.stopPropagation(); announcePortClick(id, 'input') }} title="Choose as connection target" />
      <div className="component-node-head">
        <div className="component-glyph">{component.symbol}</div>
        <span className="component-node-kind">{component.category}</span>
        <span className="component-node-version">v{data.componentVersion}</span>
      </div>
      <div className="component-node-title" title={data.title}>{data.title || component.displayName}</div>
      <div className="component-node-subtitle">
        <span>{component.displayName}</span>
        <i className={`component-origin ${component.availability}`}>{component.availability === 'cloud-hosting' ? 'CLOUD' : component.availability === 'managed-service' ? 'MANAGED' : component.availability === 'open-core' ? 'OPEN CORE' : 'OPEN SOURCE'}</i>
      </div>
      <div className="component-node-footer">
        <span className="node-port-count"><i className="port-dot input-dot" />Input</span>
        <span className="node-port-count">Output<i className="port-dot output-dot" /></span>
      </div>
      <Handle id="output" type="source" position={Position.Right} className="node-handle node-handle-output" isConnectable onClick={(event) => { event.stopPropagation(); announcePortClick(id, 'output') }} title="Choose as connection source" />
    </article>
  )
}
