import { useMemo, useState } from 'react'
import { evaluateAuthorization, type AuthorizationModel, type AuthorizationRule, type AuthorizationTuple } from '../domain/authorization'
import { Icon } from './Icon'

interface AuthorizationDialogProps {
  open: boolean
  architectureName: string
  model: AuthorizationModel
  openFgaOnCanvas: boolean
  onChange: (model: AuthorizationModel) => void
  onAddOpenFga: () => void
  onClose: () => void
}

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'architecture'
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function AuthorizationDialog({ open, architectureName, model, openFgaOnCanvas, onChange, onAddOpenFga, onClose }: AuthorizationDialogProps) {
  const resourceDefault = `architecture:${slug(architectureName)}`
  const [subject, setSubject] = useState('user:demo')
  const [relation, setRelation] = useState('owner')
  const [resource, setResource] = useState(resourceDefault)
  const [checkSubject, setCheckSubject] = useState('team:platform#member')
  const [checkRelation, setCheckRelation] = useState('can_edit')
  const [checkResource, setCheckResource] = useState(resourceDefault)
  const [accessResult, setAccessResult] = useState<boolean | null>(null)
  const [newRuleType, setNewRuleType] = useState('architecture')
  const [newRuleRelation, setNewRuleRelation] = useState('')
  const [newRuleExpression, setNewRuleExpression] = useState('user')
  const directRelations = useMemo(() => model.rules.filter((rule) => /\b(user|team#member)\b/.test(rule.expression)), [model.rules])
  const checkRelations = useMemo(() => model.rules.filter((rule) => rule.relation.startsWith('can_')), [model.rules])
  const activeRelation = directRelations.some((rule) => rule.relation === relation) ? relation : directRelations[0]?.relation ?? relation

  if (!open) return null

  const addTuple = () => {
    if (!subject.trim() || !resource.trim() || !relation) return
    const tuple: AuthorizationTuple = { id: makeId('tuple'), subject: subject.trim(), relation: activeRelation, resource: resource.trim() }
    onChange({ ...model, tuples: [...model.tuples, tuple] })
  }

  const updateRule = (id: string, expression: string) => {
    const safeExpression = expression.toLowerCase().replace(/[^a-z0-9_# ]/g, '')
    onChange({ ...model, rules: model.rules.map((rule) => rule.id === id ? { ...rule, expression: safeExpression } : rule) })
  }

  const removeRule = (id: string) => onChange({ ...model, rules: model.rules.filter((rule) => rule.id !== id) })

  const addRule = () => {
    const name = newRuleRelation.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    if (!name || model.rules.some((rule) => rule.resourceType === newRuleType && rule.relation === name)) return
    const expression = newRuleExpression.toLowerCase().replace(/[^a-z0-9_# ]/g, '').trim() || 'user'
    const rule: AuthorizationRule = { id: makeId('rule'), resourceType: newRuleType, relation: name, expression }
    onChange({ ...model, rules: [...model.rules, rule] })
    setNewRuleRelation('')
  }

  const runCheck = () => setAccessResult(evaluateAuthorization(model, checkSubject.trim(), checkRelation, checkResource.trim()))

  const previewTypes = [...new Set(model.rules.map((rule) => rule.resourceType))]

  return (
    <div className="authorization-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="authorization-dialog" role="dialog" aria-modal="true" aria-labelledby="authorization-title">
        <header className="authorization-header">
          <div className="authorization-brand-icon"><Icon name="shield" size={21} /></div>
          <div><span className="eyebrow">RELATIONSHIP-BASED ACCESS</span><h2 id="authorization-title">Access model</h2><p>Shape who can view and change this architecture.</p></div>
          <button className="icon-button" aria-label="Close access model" onClick={onClose}><Icon name="close" /></button>
        </header>

        <div className="authorization-status">
          <span className={`authorization-status-dot${openFgaOnCanvas ? ' connected' : ''}`} />
          <span>{openFgaOnCanvas ? 'OpenFGA component is on this canvas' : 'OpenFGA component has not been added'}</span>
          {!openFgaOnCanvas && <button onClick={onAddOpenFga}><Icon name="plus" size={14} />Add OpenFGA</button>}
        </div>

        <div className="authorization-content">
          <div className="authorization-workbench">
            <section className="authorization-section">
              <div className="authorization-section-heading"><div><small>01</small><h3>Relations</h3></div><span>{model.rules.length} rules</span></div>
              <p className="authorization-help">Define direct relationships and combine them into permissions with <code>or</code>.</p>
              <div className="authorization-rules">
                {model.rules.map((rule) => (
                  <div className="authorization-rule" key={rule.id}>
                    <span className="rule-resource">{rule.resourceType}</span>
                    <strong>{rule.relation}</strong>
                    <span className="rule-equals">=</span>
                    <input aria-label={`${rule.resourceType} ${rule.relation} rule`} value={rule.expression} onChange={(event) => updateRule(rule.id, event.target.value)} />
                    <button aria-label={`Remove ${rule.relation} relation`} disabled={model.rules.length <= 1} onClick={() => removeRule(rule.id)}><Icon name="x" size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="authorization-add-rule">
                <select value={newRuleType} onChange={(event) => setNewRuleType(event.target.value)} aria-label="New rule resource">
                  <option value="architecture">architecture</option>
                  <option value="component">component</option>
                </select>
                <input value={newRuleRelation} onChange={(event) => setNewRuleRelation(event.target.value)} placeholder="relation name" aria-label="New relation name" />
                <input value={newRuleExpression} onChange={(event) => setNewRuleExpression(event.target.value)} placeholder="user or editor" aria-label="New relation rule" />
                <button className="icon-button" aria-label="Add relation" title="Add relation" onClick={addRule}><Icon name="plus" size={17} /></button>
              </div>
            </section>

            <section className="authorization-section">
              <div className="authorization-section-heading"><div><small>02</small><h3>Relationships</h3></div><span>{model.tuples.length} tuples</span></div>
              <p className="authorization-help">Grant a subject a relation to a resource.</p>
              <div className="authorization-tuple-form">
                <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="user:harish or team:platform#member" /></label>
                <label>Relation<select value={activeRelation} onChange={(event) => setRelation(event.target.value)}>{directRelations.map((rule) => <option key={rule.id} value={rule.relation}>{rule.relation}</option>)}</select></label>
                <label>Resource<input value={resource} onChange={(event) => setResource(event.target.value)} placeholder="architecture:platform" /></label>
                <button className="button button-primary" onClick={addTuple}><Icon name="plus" size={14} />Add relationship</button>
              </div>
              <div className="authorization-tuples">
                {model.tuples.length ? model.tuples.map((tuple) => (
                  <div className="authorization-tuple" key={tuple.id}><span>{tuple.subject}</span><i>is</i><strong>{tuple.relation}</strong><i>of</i><span>{tuple.resource}</span><button aria-label="Remove relationship" onClick={() => onChange({ ...model, tuples: model.tuples.filter((item) => item.id !== tuple.id) })}><Icon name="trash" size={14} /></button></div>
                )) : <div className="authorization-empty">No relationships yet. Add one above.</div>}
              </div>
            </section>

            <section className="authorization-section access-check-section">
              <div className="authorization-section-heading"><div><small>03</small><h3>Try an access check</h3></div></div>
              <div className="authorization-check-form">
                <input value={checkSubject} onChange={(event) => { setCheckSubject(event.target.value); setAccessResult(null) }} aria-label="Check subject" />
                <span>can</span>
                <select value={checkRelation} onChange={(event) => { setCheckRelation(event.target.value); setAccessResult(null) }} aria-label="Permission to check">
                  {(checkRelations.length ? checkRelations : model.rules).map((rule) => <option key={rule.id} value={rule.relation}>{rule.relation}</option>)}
                </select>
                <span>on</span>
                <input value={checkResource} onChange={(event) => { setCheckResource(event.target.value); setAccessResult(null) }} aria-label="Check resource" />
                <button className="button button-outline" onClick={runCheck}>Check</button>
              </div>
              {accessResult !== null && <div className={`authorization-result ${accessResult ? 'allowed' : 'denied'}`}><Icon name={accessResult ? 'check' : 'x'} size={15} />{accessResult ? 'Access allowed by this model' : 'Access denied by this model'}</div>}
            </section>
          </div>

          <aside className="authorization-preview">
            <div className="authorization-preview-heading"><span className="preview-code-icon">{'{}'}</span><div><small>MODEL PREVIEW</small><strong>Relationship rules</strong></div></div>
            <pre>{previewTypes.map((resourceType) => {
              const rules = model.rules.filter((rule) => rule.resourceType === resourceType)
              return [`type ${resourceType}`, '  relations', ...rules.map((rule) => `    define ${rule.relation}: ${rule.expression}`), ''].join('\n')
            }).join('\n')}</pre>
            <div className="authorization-preview-note"><Icon name="info" size={14} /><span>This model is saved with the design. Runtime enforcement connects later.</span></div>
          </aside>
        </div>

        <footer className="authorization-footer"><span><Icon name="shield" size={15} />OpenFGA-inspired model</span><button className="button button-quiet" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  )
}
