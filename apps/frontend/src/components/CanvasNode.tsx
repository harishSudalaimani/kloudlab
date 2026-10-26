import { Fragment, type CSSProperties } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { catalogById } from '../domain/catalog'

export interface ComponentNodeData extends Record<string, unknown> {
  typeId: string
  componentVersion: string
  title: string
  config: Record<string, unknown>
}

export type ComponentFlowNode = Node<ComponentNodeData, 'component'>

export function CanvasNode({ data, selected }: NodeProps<ComponentFlowNode>) {
  const component = catalogById.get(data.typeId)
  if (!component) return null
  const inputs = component.ports.filter((port) => port.direction === 'input')
  const outputs = component.ports.filter((port) => port.direction === 'output')

  return (
    <article className={`component-node${selected ? ' is-selected' : ''}`} style={{ '--node-accent': component.accent } as CSSProperties}>
      {inputs.map((port, index) => (
        <Handle
          key={`input-${port.id}`}
          id={port.id}
          type="target"
          position={Position.Left}
          style={{ top: `${((index + 1) / (inputs.length + 1)) * 100}%` }}
          className="node-handle node-handle-input"
          isConnectable
        />
      ))}
      <div className="component-node-head">
        <div className="component-glyph">{component.symbol}</div>
        <span className="component-node-kind">{component.category}</span>
        <span className="component-node-version">v{data.componentVersion}</span>
      </div>
      <div className="component-node-title" title={data.title}>{data.title || component.displayName}</div>
      <div className="component-node-subtitle">{component.displayName}</div>
      <div className="component-node-footer">
        <span className="node-port-count"><i className="port-dot input-dot" />{inputs.length} in</span>
        <span className="node-port-count">{outputs.length} out<i className="port-dot output-dot" /></span>
      </div>
      {inputs.map((port, index) => (
        <span
          aria-hidden="true"
          key={`input-label-${port.id}`}
          className="node-port-label node-port-label-input"
          style={{ top: `${((index + 1) / (inputs.length + 1)) * 100}%` }}
        >
          {port.id}
        </span>
      ))}
      {outputs.map((port, index) => (
        <Fragment key={`output-${port.id}`}>
          <span
            aria-hidden="true"
            className="node-port-label node-port-label-output"
            style={{ top: `${((index + 1) / (outputs.length + 1)) * 100}%` }}
          >
            {port.id}
          </span>
          <Handle
            id={port.id}
            type="source"
            position={Position.Right}
            style={{ top: `${((index + 1) / (outputs.length + 1)) * 100}%` }}
            className="node-handle node-handle-output"
            isConnectable
          />
        </Fragment>
      ))}
    </article>
  )
}
