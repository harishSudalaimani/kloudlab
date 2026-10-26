import { useState, type CSSProperties } from 'react'
import type { ComponentFlowNode } from './CanvasNode'
import { catalogById, type ComponentDefinition, type ConfigProperty } from '../domain/catalog'
import type { ValidationIssue } from '../domain/canvas'
import { Icon } from './Icon'

export type InspectorTab = 'properties' | 'validate'

interface InspectorProps {
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  node: ComponentFlowNode | null
  nodes: ComponentFlowNode[]
  connectionCount: number
  issues: ValidationIssue[]
  onConfigChange: (nodeId: string, key: string, value: string | number | boolean) => void
  onBeginEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onDeleteConnection: (edgeId: string) => void
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
      <div className="component-ports">
        <span className="inspector-section-heading">Compatible connections</span>
        {component.ports.map((port) => <div className="component-port-row" key={`${port.direction}-${port.id}`}>
          <i className={port.direction}>{port.direction === 'input' ? 'IN' : 'OUT'}</i>
          <span><strong>{port.id}</strong><small>{port.connectionTypes.join(' · ')}{port.protocols?.length ? ` · ${port.protocols.join('/')}` : ''}{port.allowedComponentTypes?.length ? ` · ${port.allowedComponentTypes.map((typeId) => catalogById.get(typeId)?.displayName ?? typeId).join(', ')}` : ''}{port.required ? ' · required' : ''}{port.multiple === false ? ' · one connection' : ''}</small></span>
        </div>)}
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
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null)
  const component = props.node ? catalogById.get(props.node.data.typeId) ?? null : null
  const errorCount = props.issues.filter((issue) => issue.severity === 'error').length
  const warningCount = props.issues.filter((issue) => issue.severity === 'warning').length
  const infoCount = props.issues.filter((issue) => issue.severity === 'info').length
  const statusTitle = errorCount ? 'Needs attention' : warningCount ? 'Review recommendations' : infoCount ? 'Improvement ideas' : 'No issues found'
  const statusDescription = errorCount
    ? `${errorCount} blocking issue${errorCount === 1 ? '' : 's'} found.`
    : warningCount
      ? `${warningCount} risk${warningCount === 1 ? '' : 's'} to review.`
      : infoCount
        ? `${infoCount} improvement${infoCount === 1 ? '' : 's'} available.`
        : 'Settings and connections look good.'

  return (
    <aside className={`inspector-panel${props.mobileOpen ? ' mobile-open' : ''}`} role="dialog" aria-modal="true" aria-label={props.tab === 'validate' ? 'Design review' : 'Component settings'}>
      <div className="inspector-header">
        <div>
          <span className="eyebrow">DESIGN TOOLS</span>
          <h2>{props.tab === 'validate' ? 'Design review' : 'Component settings'}</h2>
        </div>
        <button className="icon-button inspector-collapse" aria-label="Close panel" title="Close" onClick={props.onMobileToggle}><Icon name="close" size={16} /></button>
        <div className="inspector-header-status"><span className={`status-dot${errorCount ? ' error' : warningCount ? ' warning' : infoCount ? ' info' : ''}`} />{errorCount ? `${errorCount} errors` : warningCount ? `${warningCount} warnings` : infoCount ? `${infoCount} suggestions` : 'Ready'}</div>
      </div>
      <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
        <button className={props.tab === 'properties' ? 'active' : ''} role="tab" aria-selected={props.tab === 'properties'} onClick={() => props.onTabChange('properties')}>
          <Icon name="sliders" size={14} />Properties
        </button>
        <button className={props.tab === 'validate' ? 'active' : ''} role="tab" aria-selected={props.tab === 'validate'} onClick={() => props.onTabChange('validate')}>
          <Icon name="check" size={14} />Validate
          {(errorCount + warningCount + infoCount) > 0 && <span className="tab-count">{errorCount + warningCount + infoCount}</span>}
        </button>
      </div>

      {props.tab === 'validate' ? (
        <div className="validation-panel">
          <div className="validation-summary">
            <div className={`validation-badge ${errorCount ? 'has-errors' : warningCount ? 'has-warnings' : infoCount ? 'has-info' : 'is-valid'}`}><Icon name={errorCount ? 'alert' : warningCount ? 'alert' : infoCount ? 'info' : 'check'} size={18} /></div>
            <div><strong>{statusTitle}</strong><span>{statusDescription}</span></div>
          </div>
          <div className="validation-counts">
            <div><span className="validation-count error-count">{errorCount}</span><span>Errors</span></div>
            <div><span className="validation-count warning-count">{warningCount}</span><span>Warnings</span></div>
            <div><span className="validation-count info-count">{infoCount}</span><span>Info</span></div>
          </div>
          {props.issues.length === 0 ? (
            <div className="validation-empty"><span className="success-mark"><Icon name="check" size={17} /></span><strong>Everything looks good</strong><p>No validation findings for the current architecture.</p></div>
          ) : (
            <div className="issue-list">
              {props.issues.map((issue) => (
                <article className={`issue-card ${issue.severity}`} key={issue.id}>
                  <button className={`issue-row ${issue.severity}`} aria-expanded={expandedIssueId === issue.id} onClick={() => setExpandedIssueId((current) => current === issue.id ? null : issue.id)}>
                    <Icon name={issue.severity === 'info' ? 'info' : 'alert'} size={15} />
                    <span><strong>{issue.message}</strong>{issue.nodeId && <small>{props.nodes.find((node) => node.id === issue.nodeId)?.data.title}</small>}</span>
                    <span className={`issue-severity-label ${issue.severity}`}>{issue.severity}</span>
                    <Icon name="chevron-down" size={14} />
                  </button>
                  {expandedIssueId === issue.id && <div className="issue-details">
                    <p>{issue.description ?? issue.message}</p>
                    <strong>Options to consider</strong>
                    <ul>{(issue.options ?? (issue.nodeId ? ['Review the component settings and correct the configuration.', 'Check the component documentation for supported values.'] : ['Review the architecture structure and update the design.'])).map((option) => <li key={option}>{option}</li>)}</ul>
                    {issue.nodeId && <button className="issue-locate" onClick={() => props.onFocusNode(issue.nodeId!)}><Icon name="cursor" size={13} />Show component</button>}
                    {issue.edgeId && <button className="issue-remove" onClick={() => props.onDeleteConnection(issue.edgeId!)}><Icon name="trash" size={13} />Remove invalid connection</button>}
                  </div>}
                </article>
              ))}
            </div>
          )}
          <div className="validation-note"><Icon name="shield" size={15} /><span>Open a finding to see why it matters and which options can resolve it.</span></div>
        </div>
      ) : component && props.node ? (
        <ComponentProperties component={component} node={props.node} onChange={props.onConfigChange} onBeginEdit={props.onBeginEdit} onDuplicate={props.onDuplicate} onDelete={props.onDelete} />
      ) : (
        <div className="inspector-empty">
          <div className="empty-art"><span /><span /><span /></div>
          <strong>Select a component</strong>
          <p>Choose a component on the canvas to edit its configuration and connections.</p>
          <div className="inspector-summary-grid">
            <div><span>Components</span><strong>{props.nodes.length}</strong></div>
            <div><span>Connections</span><strong>{props.connectionCount}</strong></div>
          </div>
          <div className="inspector-help"><Icon name="command" size={14} /><span>Use <kbd>⌘</kbd> + <kbd>Z</kbd> to undo</span></div>
        </div>
      )}
    </aside>
  )
}
