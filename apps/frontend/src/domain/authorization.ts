export interface AuthorizationRule {
  id: string
  resourceType: string
  relation: string
  expression: string
}

export interface AuthorizationTuple {
  id: string
  subject: string
  relation: string
  resource: string
}

export interface AuthorizationModel {
  version: '1'
  rules: AuthorizationRule[]
  tuples: AuthorizationTuple[]
}

export function createDefaultAuthorizationModel(): AuthorizationModel {
  return {
    version: '1',
    rules: [
      { id: 'architecture-owner', resourceType: 'architecture', relation: 'owner', expression: 'user' },
      { id: 'architecture-editor', resourceType: 'architecture', relation: 'editor', expression: 'user or team#member' },
      { id: 'architecture-viewer', resourceType: 'architecture', relation: 'viewer', expression: 'user or team#member' },
      { id: 'architecture-can-view', resourceType: 'architecture', relation: 'can_view', expression: 'owner or editor or viewer' },
      { id: 'architecture-can-edit', resourceType: 'architecture', relation: 'can_edit', expression: 'owner or editor' },
      { id: 'component-owner', resourceType: 'component', relation: 'owner', expression: 'user' },
      { id: 'component-editor', resourceType: 'component', relation: 'editor', expression: 'user or team#member' },
      { id: 'component-viewer', resourceType: 'component', relation: 'viewer', expression: 'user or team#member' },
      { id: 'component-can-view', resourceType: 'component', relation: 'can_view', expression: 'owner or editor or viewer' },
      { id: 'component-can-edit', resourceType: 'component', relation: 'can_edit', expression: 'owner or editor' },
    ],
    tuples: [
      { id: 'sample-owner', subject: 'user:demo', relation: 'owner', resource: 'architecture:kloudlab-platform' },
      { id: 'sample-team-editor', subject: 'team:platform#member', relation: 'editor', resource: 'architecture:kloudlab-platform' },
      { id: 'sample-team-viewer', subject: 'team:reviewers#member', relation: 'viewer', resource: 'architecture:kloudlab-platform' },
    ],
  }
}

export function evaluateAuthorization(
  model: AuthorizationModel,
  subject: string,
  relation: string,
  resource: string,
): boolean {
  const resourceType = resource.split(':', 1)[0]
  if (!subject || !resourceType || !relation) return false

  const hasRelation = (requestedRelation: string, trail: Set<string>): boolean => {
    if (trail.has(requestedRelation)) return false
    const nextTrail = new Set(trail).add(requestedRelation)
    const rule = model.rules.find((item) => item.resourceType === resourceType && item.relation === requestedRelation)
    const grants = rule?.expression.split(/\s+or\s+/).map((part) => part.trim()).filter(Boolean) ?? [requestedRelation]
    return grants.some((grant) => {
      if (grant === 'user' || grant === 'team#member') {
        return model.tuples.some((tuple) => tuple.resource === resource && tuple.relation === requestedRelation && tuple.subject === subject)
      }
      return hasRelation(grant, nextTrail)
    })
  }

  return hasRelation(relation, new Set())
}

export function isAuthorizationModel(value: unknown): value is AuthorizationModel {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AuthorizationModel>
  if (candidate.version !== '1' || !Array.isArray(candidate.rules) || !Array.isArray(candidate.tuples)) return false
  if (candidate.rules.length > 100 || candidate.tuples.length > 1000) return false
  const validName = (part: unknown) => typeof part === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(part)
  const validId = (part: unknown) => typeof part === 'string' && /^[a-z][a-z0-9_-]{0,95}$/.test(part)
  return candidate.rules.every((rule) => Boolean(
    rule && typeof rule === 'object' &&
    validId(rule.id) && validName(rule.resourceType) && validName(rule.relation) &&
    typeof rule.expression === 'string' && rule.expression.length <= 500 &&
    /^[a-z0-9_# ]*$/.test(rule.expression),
  )) && candidate.tuples.every((tuple) => Boolean(
    tuple && typeof tuple === 'object' && validId(tuple.id) &&
    typeof tuple.subject === 'string' && tuple.subject.length <= 200 &&
    validName(tuple.relation) && typeof tuple.resource === 'string' && tuple.resource.length <= 200,
  ))
}
