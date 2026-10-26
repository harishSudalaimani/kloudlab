import type { CSSProperties } from 'react'
import type { ComponentFlowNode } from './CanvasNode'
import { catalogById, type ComponentDefinition, type ConfigProperty } from '../domain/catalog'
import type { CanvasEdgeDocument, ValidationIssue } from '../domain/canvas'
import { Icon } from './Icon'

export type InspectorTab = 'properties' | 'validate'

interface InspectorProps {
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  node: ComponentFlowNode | null
  edge: CanvasEdgeDocument | null
  nodes: ComponentFlowNode[]
  edges: CanvasEdgeDocument[]
  issues: ValidationIssue[]
  onConfigChange: (nodeId: string, key: string, value: string | number | boolean) => void
  onBeginEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onDeleteEdge: () => void
  onFocusNode: (nodeId: string) => void
  mobileOpen: boolean
  onMobileToggle: () => void
}

function fieldInput(
  property: ConfigProperty,
  value: unknown,
  onChange: (value: string | number | boolean) => void,
  onFocus: () => void,
) {
  if (property.enum) {
    return (
      <div className="select-wrap">
        <select value={String(value ?? '')} onFocus={onFocus} onChange={(event) => onChange(event.target.value)}>
          {property.enum.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <Icon name="chevron-down" size={14} />
      </div>
    )
  }
  if (property.type === 'number') {
    return (
      <input
        type="number"
        value={typeof value === 'number' ? value : ''}
        min={property.minimum}
        max={property.maximum}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
      />
    )
  }
  if (property.type === 'boolean') {
    return <label className="switch-row"><input type="checkbox" checked={Boolean(value)} onFocus={onFocus} onChange={(event) => onChange(event.target.checked)} /><span className="switch" /><span>{Boolean(value) ? 'Enabled' : 'Disabled'}</span></label>
  }
  return (
    <input
      type="text"
      value={typeof value === 'string' ? value : ''}
      placeholder={property.title}
      onFocus={onFocus}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function ComponentProperties({ component, node, onChange, onBeginEdit, onDuplicate, onDelete }: {
  component: ComponentDefinition
  node: ComponentFlowNode
  onChange: InspectorProps['onConfigChange']
  onBeginEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const required = new Set(component.configurationSchema.required)
  return (
    <div className="inspector-scroll">
      <div className="inspector-component-card">
        <div className="inspector-symbol" style={{ '--node-accent': component.accent } as CSSProperties}>{component.symbol}</div>
        <div className="inspector-component-meta">
          <span>{component.category}</span>
          <strong>{component.displayName}</strong>
        </div>
        <span className={`component-origin inspector-origin ${component.availability}`}>{component.availability === 'cloud-hosting' ? 'HOSTING' : component.availability === 'managed-service' ? 'MANAGED' : component.availability === 'open-core' ? 'OPEN CORE' : 'OPEN SOURCE'}</span>
        <span className="version-tag">v{node.data.componentVersion}</span>
      </div>
      <p className="component-description">{component.description}</p>
      <div className="field-section-title"><span>Configuration</span><span className="field-section-count">{Object.keys(component.configurationSchema.properties).length} fields</span></div>
      <div className="property-fields">
        {Object.entries(component.configurationSchema.properties).map(([key, property]) => (
          <label className="property-field" key={key}>
            <span className="property-label">{property.title}{required.has(key) && <i>Required</i>}</span>
            {fieldInput(property, node.data.config[key], (value) => onChange(node.id, key, value), onBeginEdit)}
            {property.description && <small>{property.description}</small>}
          </label>
        ))}
      </div>
      <div className="field-section-title ports-title"><span>Connections</span><span className="field-section-count">{component.ports.length} ports</span></div>
      <div className="inspector-port-list">
        {component.ports.map((port) => (
          <div className="inspector-port" key={port.id}>
            <span className={`port-direction ${port.direction}`}>{port.direction === 'input' ? 'IN' : 'OUT'}</span>
            <span className="inspector-port-name">{port.id}</span>
            <span className="inspector-port-type">{port.connectionTypes.join(' / ')}</span>
          </div>
        ))}
      </div>
      <div className="inspector-docs">
        <span className="inspector-section-heading">Documentation</span>
        {component.documentation.map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}><span>{new URL(url).hostname.replace(/^www\./, '')}</span><Icon name="external" size={13} /></a>)}
      </div>
      <div className="inspector-actions">
        <button className="button button-quiet" onClick={onDuplicate}><Icon name="copy" size={15} />Duplicate</button>
        <button className="button button-quiet danger-action" onClick={onDelete}><Icon name="trash" size={15} />Delete</button>
      </div>
    </div>
  )
}

export function Inspector(props: InspectorProps) {
  const component = props.node ? catalogById.get(props.node.data.typeId) ?? null : null
  const edgeDetails = props.edge
    ? {
        source: props.nodes.find((node) => node.id === props.edge?.source)?.data.title ?? 'Unknown component',
        target: props.nodes.find((node) => node.id === props.edge?.target)?.data.title ?? 'Unknown component',
      }
    : null
  const errorCount = props.issues.filter((issue) => issue.severity === 'error').length
  const warningCount = props.issues.filter((issue) => issue.severity === 'warning').length

  return (
    <aside className={`inspector-panel${props.mobileOpen ? ' mobile-open' : ''}`}>
      <div className="inspector-header">
        <div>
          <span className="eyebrow">ARCHITECTURE</span>
          <h2>Inspector</h2>
        </div>
        <button className="icon-button inspector-collapse" aria-label={props.mobileOpen ? 'Collapse inspector' : 'Expand inspector'} title={props.mobileOpen ? 'Collapse inspector' : 'Expand inspector'} onClick={props.onMobileToggle}><Icon name="chevron-down" size={16} /></button>
        <div className="inspector-header-status"><span className={errorCount ? 'status-dot error' : 'status-dot'} />{errorCount ? `${errorCount} issues` : 'Ready'}</div>
      </div>
      <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
        <button className={props.tab === 'properties' ? 'active' : ''} role="tab" aria-selected={props.tab === 'properties'} onClick={() => props.onTabChange('properties')}>
          <Icon name="sliders" size={14} />Properties
        </button>
        <button className={props.tab === 'validate' ? 'active' : ''} role="tab" aria-selected={props.tab === 'validate'} onClick={() => props.onTabChange('validate')}>
          <Icon name="check" size={14} />Validate
          {(errorCount + warningCount) > 0 && <span className="tab-count">{errorCount + warningCount}</span>}
        </button>
      </div>

      {props.tab === 'validate' ? (
        <div className="validation-panel">
          <div className="validation-summary">
            <div className={`validation-badge ${errorCount ? 'has-errors' : 'is-valid'}`}><Icon name={errorCount ? 'alert' : 'check'} size={18} /></div>
            <div><strong>{errorCount ? 'Needs attention' : 'No issues found'}</strong><span>{errorCount ? `${errorCount} items need attention` : 'Settings and connections look good.'}</span></div>
          </div>
          <div className="validation-counts">
            <div><span className="validation-count error-count">{errorCount}</span><span>Errors</span></div>
            <div><span className="validation-count warning-count">{warningCount}</span><span>Warnings</span></div>
          </div>
          {props.issues.length === 0 ? (
            <div className="validation-empty"><span className="success-mark"><Icon name="check" size={17} /></span><strong>Everything looks good</strong><p>No issues were found in component settings or connections.</p></div>
          ) : (
            <div className="issue-list">
              {props.issues.map((issue) => (
                <button className={`issue-row ${issue.severity}`} key={issue.id} onClick={() => issue.nodeId && props.onFocusNode(issue.nodeId)}>
                  <Icon name={issue.severity === 'error' ? 'alert' : 'alert'} size={15} />
                  <span>{issue.message}{issue.nodeId && <small>{props.nodes.find((node) => node.id === issue.nodeId)?.data.title}</small>}</span>
                  {issue.nodeId && <Icon name="chevron-right" size={14} />}
                </button>
              ))}
            </div>
          )}
          <div className="validation-note"><Icon name="shield" size={15} /><span>Confirm the requirements of your chosen platform before deployment.</span></div>
        </div>
      ) : component && props.node ? (
        <ComponentProperties component={component} node={props.node} onChange={props.onConfigChange} onBeginEdit={props.onBeginEdit} onDuplicate={props.onDuplicate} onDelete={props.onDelete} />
      ) : edgeDetails ? (
        <div className="edge-inspector">
          <div className="edge-preview"><span className="edge-preview-dot" /><span>{edgeDetails.source}</span><Icon name="arrow-up-right" size={15} /><span>{edgeDetails.target}</span></div>
          <span className="eyebrow">CONNECTION</span>
          <h3>Component relationship</h3>
          <p>This relationship is part of the design. It does not configure traffic routes or permissions.</p>
          <button className="button button-danger" onClick={props.onDeleteEdge}><Icon name="trash" size={15} />Remove connection</button>
        </div>
      ) : (
        <div className="inspector-empty">
          <div className="empty-art"><span /><span /><span /></div>
          <strong>Select a component</strong>
          <p>Choose a component on the canvas to edit its configuration and connections.</p>
          <div className="inspector-summary-grid">
            <div><span>Components</span><strong>{props.nodes.length}</strong></div>
            <div><span>Connections</span><strong>{props.edges.length}</strong></div>
          </div>
          <div className="inspector-help"><Icon name="command" size={14} /><span>Use <kbd>⌘</kbd> + <kbd>Z</kbd> to undo</span></div>
        </div>
      )}
    </aside>
  )
}
