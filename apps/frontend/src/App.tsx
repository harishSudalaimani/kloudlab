import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ChangeEvent, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from '@xyflow/react'
import { CanvasNode, type ComponentFlowNode } from './components/CanvasNode'
import { Icon } from './components/Icon'
import { Inspector, type InspectorTab } from './components/Inspector'
import { SiteNavigation, type AppPage, type Theme } from './components/SiteNavigation'
import { AboutPage } from './pages/AboutPage'
import { AuthPage } from './pages/AuthPage'
import { HomePage } from './pages/HomePage'
import { authDisplayName, useAuth } from './auth/AuthProvider'
import { ApiError, apiRequest, type SavedArchitecture } from './auth/api'
import { catalog, catalogById, categories, defaultConfig, type ComponentDefinition, type ComponentCategory } from './domain/catalog'
import { checkConnection, type ConnectionCheck, type ExistingConnection } from './domain/connections'
import {
  ACTIVE_KEY,
  createEmptyCanvas,
  migrateStarterCanvas,
  normalizeCanvasDocument,
  createStarterCanvas,
  isCanvasDocument,
  makeId,
  validateCanvas,
  type CanvasDocument,
} from './domain/canvas'

type SaveState = 'saved' | 'saving' | 'unsaved'

const nodeTypes = { component: CanvasNode }
const edgeStyle = { stroke: '#79a8cf', strokeWidth: 1.8 }
const edgeMarker = { type: MarkerType.ArrowClosed, color: edgeStyle.stroke }
const edgeOptions = { type: 'smoothstep', animated: false, style: edgeStyle, markerEnd: edgeMarker, interactionWidth: 28 }
const fallbackViewport = { x: 0, y: 0, zoom: 0.8 }
const canvasFitOptions = { padding: 0.08 }
const canvasSnapGrid: [number, number] = [16, 16]
const canvasPanButtons = [0]
const flowProOptions = { hideAttribution: false }

function fromDocument(document: CanvasDocument): { nodes: ComponentFlowNode[]; edges: Edge[] } {
  return {
    nodes: document.nodes.map((item) => {
      const component = catalogById.get(item.typeId)
      return {
        id: item.id,
        type: 'component',
        position: item.position,
        data: {
          typeId: item.typeId,
          componentVersion: item.componentVersion,
          title: String(item.config.name ?? component?.displayName ?? 'Component'),
          config: item.config,
        },
      }
    }),
    edges: document.edges.map((item) => ({
      id: item.id,
      source: item.source,
      sourceHandle: 'output',
      target: item.target,
      targetHandle: 'input',
      data: { sourcePortId: item.sourcePort, targetPortId: item.targetPort },
      type: 'smoothstep',
      style: edgeStyle,
      markerEnd: edgeMarker,
      interactionWidth: 28,
    })),
  }
}

function readDocument(storageKey = ACTIVE_KEY): CanvasDocument {
  try {
    const active = localStorage.getItem(storageKey)
    if (active) {
      const parsed: unknown = JSON.parse(active)
      if (isCanvasDocument(parsed)) return migrateStarterCanvas(parsed)
    }
  } catch { /* Storage may be disabled; use the example document. */ }
  return createStarterCanvas()
}

function documentFromFlow(
  base: CanvasDocument,
  nodes: ComponentFlowNode[],
  edges: Edge[],
): CanvasDocument {
  return {
    ...normalizeCanvasDocument(base),
    nodes: nodes.map((node) => ({
      id: node.id,
      typeId: node.data.typeId,
      componentVersion: node.data.componentVersion,
      position: { x: node.position.x, y: node.position.y },
      config: node.data.config,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourcePort: typeof edge.data?.sourcePortId === 'string' ? edge.data.sourcePortId : edge.sourceHandle ?? '',
      target: edge.target,
      targetPort: typeof edge.data?.targetPortId === 'string' ? edge.data.targetPortId : edge.targetHandle ?? '',
    })),
  }
}

function semanticConnections(edges: Edge[]): ExistingConnection[] {
  return edges.map((edge) => ({
    source: edge.source,
    sourcePort: typeof edge.data?.sourcePortId === 'string' ? edge.data.sourcePortId : edge.sourceHandle ?? '',
    target: edge.target,
    targetPort: typeof edge.data?.targetPortId === 'string' ? edge.data.targetPortId : edge.targetHandle ?? '',
  }))
}

function checkFlowConnection(connection: Connection, nodes: ComponentFlowNode[], edges: Edge[]): ConnectionCheck {
  if (!connection.source || !connection.target || connection.sourceHandle !== 'output' || connection.targetHandle !== 'input') {
    return { valid: false, reason: 'Connections must go from an output point to an input point.', options: ['Choose the source component’s right-side output and the destination’s left-side input.'] }
  }
  const source = nodes.find((node) => node.id === connection.source)
  const target = nodes.find((node) => node.id === connection.target)
  if (!source || !target) return { valid: false, reason: 'One of the selected components is missing.', options: ['Choose two components that are still on the canvas.'] }
  return checkConnection(
    { id: source.id, typeId: source.data.typeId, config: source.data.config },
    { id: target.id, typeId: target.data.typeId, config: target.data.config },
    semanticConnections(edges),
  )
}

interface AppContentProps {
  theme: Theme
  accessToken: string
  apiConfigured: boolean
  subject: string
  accountName?: string
  onToggleTheme: () => void
  onNavigate: (page: AppPage) => void
  onLogout: () => void
}

function AppContent({ theme, accessToken, apiConfigured, subject, accountName, onToggleTheme, onNavigate, onLogout }: AppContentProps) {
  const apiReady = apiConfigured && Boolean(accessToken)
  const activeDraftKey = `${ACTIVE_KEY}.${encodeURIComponent(subject)}`
  const initialDocument = useMemo(() => readDocument(activeDraftKey), [activeDraftKey])
  const initialFlow = useMemo(() => fromDocument(initialDocument), [initialDocument])
  const [document, setDocument] = useState(initialDocument)
  const [nodes, setNodes] = useState<ComponentFlowNode[]>(initialFlow.nodes)
  const [edges, setEdges] = useState<Edge[]>(initialFlow.edges)
  const [library, setLibrary] = useState<SavedArchitecture[]>([])
  const [remoteIds, setRemoteIds] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ComponentCategory | 'All'>('All')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('properties')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [toast, setToast] = useState('')
  const [mobileCatalogOpen, setMobileCatalogOpen] = useState(false)
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false)
  const [canvasFullscreen, setCanvasFullscreen] = useState(false)
  const [connectionStart, setConnectionStart] = useState<string | null>(null)
  const [nodeContextMenu, setNodeContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasWindowRef = useRef<HTMLElement | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const documentRef = useRef(document)
  const historyRef = useRef<CanvasDocument[]>([])
  const futureRef = useRef<CanvasDocument[]>([])
  const flow = useReactFlow<ComponentFlowNode, Edge>()
  const isValidConnection = useCallback((connection: Connection | Edge) =>
    checkFlowConnection(connection as Connection, nodesRef.current, edgesRef.current).valid, [])
  const onCanvasMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    setDocument((current) => ({ ...current, viewport }))
  }, [])
  const showNodeProperties = useCallback(() => {
    setInspectorTab('properties')
    setMobileInspectorOpen(true)
  }, [])
  const onNodeContextMenu = useCallback((event: ReactMouseEvent, node: ComponentFlowNode) => {
    event.preventDefault()
    setConnectionStart(null)
    setMobileInspectorOpen(false)
    const canvasBounds = window.document.querySelector('.canvas-area')?.getBoundingClientRect()
    const nextNodes = nodesRef.current.map((item) => ({ ...item, selected: item.id === node.id }))
    const nextEdges = edgesRef.current.map((item) => ({ ...item, selected: false }))
    setNodes(nextNodes)
    setEdges(nextEdges)
    nodesRef.current = nextNodes
    edgesRef.current = nextEdges
    setNodeContextMenu({ nodeId: node.id, x: event.clientX - (canvasBounds?.left ?? 0), y: event.clientY - (canvasBounds?.top ?? 0) })
  }, [])
  const hideInspectorFromCanvas = useCallback(() => {
    setInspectorTab('properties')
    setMobileInspectorOpen(false)
    setConnectionStart(null)
    setNodeContextMenu(null)
  }, [])
  const stopNodeDrag = useCallback(() => setSaveState('unsaved'), [])

  nodesRef.current = nodes
  edgesRef.current = edges
  documentRef.current = document

  const currentDocument = useMemo(() => documentFromFlow(document, nodes, edges), [document, nodes, edges])
  const issues = useMemo(() => validateCanvas(currentDocument), [currentDocument])
  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.filter((issue) => issue.severity === 'warning').length
  const suggestions = issues.filter((issue) => issue.severity === 'info').length
  const selectedNode = nodes.find((node) => node.selected) ?? null
  const contextNode = nodeContextMenu ? nodes.find((node) => node.id === nodeContextMenu.nodeId) ?? null : null
  const canvasNodes = useMemo(() => connectionStart
    ? nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          connectionSource: node.id === connectionStart,
          connectionTarget: node.id !== connectionStart,
        },
      }))
    : nodes, [connectionStart, nodes])
  const filteredComponents = useMemo(() => catalog.filter((component) => {
    const matchesCategory = category === 'All' || component.category === category
    const search = query.trim().toLowerCase()
    const searchable = `${component.typeId} ${component.displayName} ${component.description} ${component.category} ${component.availability} ${component.ports.flatMap((port) => port.connectionTypes).join(' ')}`.toLowerCase()
    return matchesCategory && (!search || searchable.includes(search))
  }), [category, query])
  const canUndo = historyRef.current.length > 0
  const canRedo = futureRef.current.length > 0

  const notify = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2600)
  }, [])

  const refreshLibrary = useCallback(async () => {
    if (!apiReady) {
      setLibrary([])
      setRemoteIds(new Set())
      return
    }
    try {
      const nextLibrary = await apiRequest<SavedArchitecture[]>(accessToken, '/architectures')
      setLibrary(nextLibrary)
      setRemoteIds(new Set(nextLibrary.map((entry) => entry.document.id)))
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not load your saved architectures.')
    }
  }, [accessToken, apiReady, notify])

  useEffect(() => { void refreshLibrary() }, [refreshLibrary])

  const toggleCanvasFullscreen = useCallback(async () => {
    const canvasWindow = canvasWindowRef.current
    if (!canvasWindow) return
    try {
      if (window.document.fullscreenElement === canvasWindow) {
        await window.document.exitFullscreen()
      } else if (canvasWindow.requestFullscreen) {
        await canvasWindow.requestFullscreen()
      } else {
        setCanvasFullscreen((current) => !current)
      }
    } catch {
      notify('Full screen is unavailable in this browser window')
    }
  }, [notify])

  useEffect(() => {
    const updateFullscreenState = () => setCanvasFullscreen(window.document.fullscreenElement === canvasWindowRef.current)
    window.document.addEventListener('fullscreenchange', updateFullscreenState)
    return () => window.document.removeEventListener('fullscreenchange', updateFullscreenState)
  }, [])

  const navigateFromCanvas = useCallback((page: AppPage) => {
    try {
      localStorage.setItem(activeDraftKey, JSON.stringify(documentFromFlow(documentRef.current, nodesRef.current, edgesRef.current)))
    } catch { /* Keep navigation available if local saving is disabled. */ }
    onNavigate(page)
  }, [activeDraftKey, onNavigate])

  const checkpoint = useCallback(() => {
    historyRef.current = [...historyRef.current.slice(-49), documentFromFlow(documentRef.current, nodesRef.current, edgesRef.current)]
    futureRef.current = []
  }, [])

  const replaceDocument = useCallback((next: CanvasDocument) => {
  const normalized = migrateStarterCanvas(next)
    const parsed = fromDocument(normalized)
    setDocument(normalized)
    setNodes(parsed.nodes)
    setEdges(parsed.edges)
    setMobileInspectorOpen(false)
    setConnectionStart(null)
    setNodeContextMenu(null)
    nodesRef.current = parsed.nodes
    edgesRef.current = parsed.edges
    documentRef.current = normalized
    historyRef.current = []
    futureRef.current = []
    setSaveState('unsaved')
  }, [])

  useEffect(() => {
    setSaveState('saving')
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(activeDraftKey, JSON.stringify(currentDocument))
        setSaveState('saved')
      } catch {
        setSaveState('unsaved')
      }
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [activeDraftKey, currentDocument])

  const saveArchitecture = useCallback(async (quiet = false) => {
    if (!apiReady) {
      notify('Workspace saves are unavailable right now. Your draft is still saved on this device.')
      return
    }
    if (errors > 0) {
      notify(`Resolve the ${errors} validation error${errors === 1 ? '' : 's'} before saving this architecture.`)
      return
    }
    const next = documentFromFlow(documentRef.current, nodesRef.current, edgesRef.current)
    setSaveState('saving')
    try {
      let saved: SavedArchitecture
      const body = JSON.stringify(next)
      if (remoteIds.has(next.id)) {
        saved = await apiRequest<SavedArchitecture>(accessToken, `/architectures/${encodeURIComponent(next.id)}`, { method: 'PUT', body })
      } else {
        try {
          saved = await apiRequest<SavedArchitecture>(accessToken, '/architectures', { method: 'POST', body })
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error
          const current = await apiRequest<SavedArchitecture[]>(accessToken, '/architectures')
          if (!current.some((item) => item.document.id === next.id)) throw error
          saved = await apiRequest<SavedArchitecture>(accessToken, `/architectures/${encodeURIComponent(next.id)}`, { method: 'PUT', body })
        }
      }
      localStorage.setItem(activeDraftKey, JSON.stringify(next))
      setLibrary((current) => [saved, ...current.filter((entry) => entry.document.id !== next.id)])
      setRemoteIds((current) => new Set(current).add(next.id))
      setSaveState('saved')
      if (!quiet) notify('Architecture saved to your workspace')
    } catch (error) {
      setSaveState('unsaved')
      notify(error instanceof Error ? error.message : 'Could not save this architecture.')
    }
  }, [accessToken, activeDraftKey, apiConfigured, apiReady, errors, notify, remoteIds])

  const addComponent = useCallback((component: ComponentDefinition, position?: { x: number; y: number }) => {
    checkpoint()
    const existingCount = nodesRef.current.filter((node) => node.data.typeId === component.typeId).length
    const config = defaultConfig(component, existingCount ? `${existingCount + 1}` : '')
    const nextNode: ComponentFlowNode = {
      id: makeId(component.typeId),
      type: 'component',
      position: position ?? flow.screenToFlowPosition({ x: window.innerWidth * 0.52, y: window.innerHeight * 0.48 }),
      data: { typeId: component.typeId, componentVersion: component.version, title: String(config.name), config },
    }
    const nextNodes = [...nodesRef.current.map((node) => ({ ...node, selected: false })), nextNode]
    const nextEdges = edgesRef.current.map((edge) => ({ ...edge, selected: false }))
    setNodes(nextNodes)
    setEdges(nextEdges)
    nodesRef.current = nextNodes
    edgesRef.current = nextEdges
    setMobileCatalogOpen(false)
    setMobileInspectorOpen(false)
    setConnectionStart(null)
    setNodeContextMenu(null)
    setSaveState('unsaved')
  }, [checkpoint, flow])

  const onNodesChange = useCallback((changes: NodeChange<ComponentFlowNode>[]) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current)
      nodesRef.current = next
      return next
    })
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => {
      const next = applyEdgeChanges(changes, current)
      edgesRef.current = next
      return next
    })
  }, [])

  const onConnect = useCallback((connection: Connection) => {
    const check = checkFlowConnection(connection, nodesRef.current, edgesRef.current)
    if (!check.valid) {
      notify(check.reason)
      return
    }
    checkpoint()
    setEdges((current) => {
      const next = addEdge({
        ...connection,
        id: makeId('edge'),
        ...edgeOptions,
        data: { sourcePortId: check.pair.source.id, targetPortId: check.pair.target.id },
      }, current)
      edgesRef.current = next
      return next
    })
    setSaveState('unsaved')
    setConnectionStart(null)
  }, [checkpoint, notify])

  const onConnectorClick = useCallback((nodeId: string, direction: 'input' | 'output') => {
    if (direction === 'output') {
      setConnectionStart((current) => current === nodeId ? null : nodeId)
      return
    }
    if (!connectionStart) {
      notify('Choose an output point first')
      return
    }
    const connection = { source: connectionStart, sourceHandle: 'output', target: nodeId, targetHandle: 'input' }
    const check = checkFlowConnection(connection, nodesRef.current, edgesRef.current)
    if (!check.valid) {
      notify(`${check.reason} ${check.options[0]}`)
      setConnectionStart(null)
      return
    }
    onConnect(connection)
    setConnectionStart(null)
  }, [connectionStart, notify, onConnect])

  const deleteComponent = useCallback((nodeId: string) => {
    const target = nodesRef.current.find((node) => node.id === nodeId)
    if (!target) return
    checkpoint()
    const nextNodes = nodesRef.current.filter((node) => node.id !== nodeId)
    const nextEdges = edgesRef.current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
    setNodes(nextNodes)
    setEdges(nextEdges)
    nodesRef.current = nextNodes
    edgesRef.current = nextEdges
    setNodeContextMenu(null)
    setConnectionStart(null)
    setSaveState('unsaved')
    notify(`${target.data.title} removed · Undo to restore`)
  }, [checkpoint, notify])

  useEffect(() => {
    const handleConnectorClick = (event: Event) => {
      const { nodeId, direction } = (event as CustomEvent<{ nodeId: string; direction: 'input' | 'output' }>).detail
      onConnectorClick(nodeId, direction)
    }
    window.addEventListener('kloudlab:connector-click', handleConnectorClick)
    return () => window.removeEventListener('kloudlab:connector-click', handleConnectorClick)
  }, [onConnectorClick])

  useEffect(() => {
    if (!nodeContextMenu) return
    const dismissContextMenu = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.node-context-menu')) return
      setNodeContextMenu(null)
    }
    window.addEventListener('pointerdown', dismissContextMenu)
    return () => window.removeEventListener('pointerdown', dismissContextMenu)
  }, [nodeContextMenu])

  const removeConnection = useCallback((edgeId: string) => {
    checkpoint()
    const next = edgesRef.current.filter((item) => item.id !== edgeId)
    setEdges(next)
    edgesRef.current = next
    setSaveState('unsaved')
    setConnectionStart(null)
    notify('Connection removed · Undo to restore')
  }, [checkpoint, notify])
  const deleteConnection = useCallback((_event: ReactMouseEvent, edge: Edge) => removeConnection(edge.id), [removeConnection])

  const updateConfig = useCallback((nodeId: string, key: string, value: string | number | boolean) => {
    setNodes((current) => {
      const next = current.map((node) => node.id === nodeId ? {
        ...node,
        data: { ...node.data, title: key === 'name' ? String(value) : node.data.title, config: { ...node.data.config, [key]: value } },
      } : node)
      nodesRef.current = next
      return next
    })
    setSaveState('unsaved')
  }, [])

  const duplicateNode = useCallback(() => {
    if (!selectedNode) return
    checkpoint()
    const component = catalogById.get(selectedNode.data.typeId)
    if (!component) return
    const config = { ...selectedNode.data.config, name: `${String(selectedNode.data.config.name ?? component.displayName)} copy` }
    const duplicate: ComponentFlowNode = {
      ...selectedNode,
      id: makeId(selectedNode.data.typeId),
      position: { x: selectedNode.position.x + 44, y: selectedNode.position.y + 44 },
      selected: true,
      data: { ...selectedNode.data, title: String(config.name), config },
    }
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), duplicate])
    nodesRef.current = [...nodesRef.current.map((node) => ({ ...node, selected: false })), duplicate]
    setEdges((current) => {
      const next = current.map((edge) => ({ ...edge, selected: false }))
      edgesRef.current = next
      return next
    })
    setSaveState('unsaved')
  }, [checkpoint, selectedNode])

  const deleteSelection = useCallback(() => {
    const selectedNodeIds = new Set(nodesRef.current.filter((node) => node.selected).map((node) => node.id))
    const selectedEdgeIds = new Set(edgesRef.current.filter((edge) => edge.selected).map((edge) => edge.id))
    if (!selectedNodeIds.size && !selectedEdgeIds.size) return
    checkpoint()
    const nextNodes = nodesRef.current.filter((node) => !selectedNodeIds.has(node.id))
    const nextEdges = edgesRef.current.filter((edge) => !selectedEdgeIds.has(edge.id) && !selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target))
    setNodes(nextNodes)
    setEdges(nextEdges)
    nodesRef.current = nextNodes
    edgesRef.current = nextEdges
    setMobileInspectorOpen(false)
    setConnectionStart(null)
    setSaveState('unsaved')
  }, [checkpoint])

  const undo = useCallback(() => {
    const previous = historyRef.current.pop()
    if (!previous) return
    futureRef.current = [...futureRef.current, documentFromFlow(documentRef.current, nodesRef.current, edgesRef.current)]
    const parsed = fromDocument(previous)
    setDocument((current) => ({ ...current, name: previous.name, viewport: previous.viewport }))
    setNodes(parsed.nodes)
    setEdges(parsed.edges)
    nodesRef.current = parsed.nodes
    edgesRef.current = parsed.edges
    setSaveState('unsaved')
  }, [])

  const redo = useCallback(() => {
    const next = futureRef.current.pop()
    if (!next) return
    historyRef.current = [...historyRef.current, documentFromFlow(documentRef.current, nodesRef.current, edgesRef.current)]
    const parsed = fromDocument(next)
    setDocument((current) => ({ ...current, name: next.name, viewport: next.viewport }))
    setNodes(parsed.nodes)
    setEdges(parsed.edges)
    nodesRef.current = parsed.nodes
    edgesRef.current = parsed.edges
    setSaveState('unsaved')
  }, [])

  const exportDocument = useCallback(() => {
    const data = documentFromFlow(documentRef.current, nodesRef.current, edgesRef.current)
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = href
    anchor.download = `${data.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'architecture'}.kloudlab.json`
    anchor.click()
    URL.revokeObjectURL(href)
    notify('Architecture JSON exported')
  }, [notify])

  const importDocument = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result))
        if (!isCanvasDocument(parsed)) throw new Error('not a canvas document')
        replaceDocument({ ...migrateStarterCanvas(parsed), id: makeId('canvas') })
        setLibraryOpen(false)
        notify(`Opened ${file.name}`)
      } catch {
        notify('That file is not a supported KloudLab canvas JSON document')
      } finally {
        event.target.value = ''
      }
    }
    reader.readAsText(file)
  }, [notify, replaceDocument])

  const newArchitecture = useCallback(async () => {
    if (!apiReady) {
      notify('Creating workspace designs is unavailable right now. Please try again later.')
      return
    }
    try {
      await apiRequest<{ allowed: boolean }>(accessToken, '/workspaces/self/authorize-create', { method: 'POST', body: '{}' })
    } catch (error) {
      notify(error instanceof Error ? error.message : 'You do not have permission to create an architecture.')
      return
    }
    const next = createEmptyCanvas()
    replaceDocument(next)
    setLibraryOpen(false)
    notify('New architecture created')
  }, [accessToken, apiConfigured, apiReady, notify, replaceDocument])

  const onCatalogDragStart = (event: DragEvent<HTMLButtonElement>, component: ComponentDefinition) => {
    event.dataTransfer.setData('application/kloudlab-component', component.typeId)
    event.dataTransfer.effectAllowed = 'copy'
  }

  const onCanvasDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const typeId = event.dataTransfer.getData('application/kloudlab-component')
    const component = catalogById.get(typeId)
    if (!component) return
    addComponent(component, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const onImportClick = () => fileInputRef.current?.click()
  const fitCanvas = () => flow.fitView({ padding: 0.1, duration: 400 })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target?.matches('input, textarea, select, [contenteditable="true"]')
      const modifier = event.metaKey || event.ctrlKey
      if (event.key === 'Escape') {
        setConnectionStart(null)
        setNodeContextMenu(null)
        setMobileInspectorOpen(false)
      } else if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveArchitecture()
      } else if (modifier && event.key.toLowerCase() === 'z' && !event.shiftKey && !editing) {
        event.preventDefault()
        undo()
      } else if (modifier && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) && !editing) {
        event.preventDefault()
        redo()
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && !editing) {
        deleteSelection()
      } else if (modifier && event.key.toLowerCase() === 'd' && !editing) {
        event.preventDefault()
        duplicateNode()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelection, duplicateNode, redo, saveArchitecture, undo])

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigateFromCanvas('home') }} aria-label="KloudLab home"><span className="brand-mark"><i /><i /><i /></span><span>kloud<span>lab</span></span></a>
        <SiteNavigation page="playground" theme={theme} onNavigate={navigateFromCanvas} onToggleTheme={onToggleTheme} variant="workspace" />
        <div className="topbar-divider" />
        <div className="project-title-wrap">
          <input aria-label="Architecture name" className="project-title" value={document.name} onFocus={checkpoint} onChange={(event) => { setDocument((current) => ({ ...current, name: event.target.value })); setSaveState('unsaved') }} />
          <span className="save-indicator"><i className={`save-dot ${saveState}`} />{saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Draft saved locally' : 'Unsaved changes'}</span>
        </div>
        <div className="topbar-spacer" />
        <button className="button button-quiet library-trigger" onClick={() => { setLibraryOpen(true); void refreshLibrary() }}><Icon name="folder" size={16} /><span>My architectures</span></button>
        <button className="button button-outline" onClick={exportDocument}><Icon name="download" size={15} /><span>Export</span></button>
        <button className="button button-primary" disabled={!apiReady || errors > 0 || saveState === 'saving'} title={!apiReady ? 'Workspace saves are unavailable right now' : errors > 0 ? 'Resolve validation errors before saving' : 'Save this architecture'} onClick={() => void saveArchitecture()}><Icon name="save" size={15} /><span>Save</span><kbd>⌘S</kbd></button>
        <button className="button button-quiet account-trigger" title="Sign out" onClick={onLogout}><Icon name="user" size={15} /><span>{accountName || 'Account'}</span><Icon name="logout" size={14} /></button>
        <button className="icon-button mobile-menu" aria-label="Open component catalog" onClick={() => setMobileCatalogOpen(!mobileCatalogOpen)}><Icon name="menu" /></button>
      </header>

      <div className="workspace">
        <aside className={`catalog-panel${mobileCatalogOpen ? ' mobile-open' : ''}`}>
          <div className="catalog-header">
            <div><span className="eyebrow">COMPONENT LIBRARY</span><h1>Components <span className="component-count-badge">{catalog.length}</span></h1></div>
            <button className="icon-button catalog-add" title="New architecture" onClick={newArchitecture}><Icon name="plus" size={17} /></button>
          </div>
          <p className="catalog-intro">Browse {catalog.length} tools across your cloud native stack. Search by tool, category, or connection type.</p>
          <label className="search-field"><Icon name="search" size={15} /><input placeholder="Search tools and integrations" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>/</kbd></label>
          <div className="catalog-browser">
            <nav className="category-rail" aria-label="Component categories">
              <span className="category-rail-label">TOOL LAYERS</span>
              <button className={category === 'All' ? 'active' : ''} aria-pressed={category === 'All'} onClick={() => setCategory('All')}>
                <span>All tools</span><i>{catalog.length}</i>
              </button>
              {categories.map((item) => {
                const count = catalog.filter((component) => component.category === item).length
                return <button key={item} className={category === item ? 'active' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>
                  <span>{item}</span><i>{count}</i>
                </button>
              })}
            </nav>
            <section className="component-results" aria-label="Available components">
              <div className="component-results-heading"><span>{category === 'All' ? 'ALL COMPONENTS' : category.toUpperCase()}</span><strong>{filteredComponents.length}</strong></div>
              <div className="catalog-list">
                {filteredComponents.length ? filteredComponents.map((component) => (
                  <button className="catalog-item" key={component.typeId} style={{ '--node-accent': component.accent } as CSSProperties} draggable onDragStart={(event) => onCatalogDragStart(event, component)} onClick={() => addComponent(component)}>
                    <span className="catalog-symbol">{component.symbol}</span>
                    <span className="catalog-item-copy"><span className="catalog-item-title"><strong>{component.displayName}</strong><i className={`component-origin ${component.availability}`}>{component.availability === 'cloud-hosting' ? 'HOSTING' : component.availability === 'managed-service' ? 'MANAGED' : component.availability === 'open-core' ? 'OPEN CORE' : 'OPEN SOURCE'}</i></span><small>{component.description}</small></span>
                    <span className="catalog-item-add"><Icon name="plus" size={15} /></span>
                  </button>
                )) : <div className="catalog-no-results"><Icon name="search" size={20} /><span>No components match</span><small>Try another name or category.</small></div>}
              </div>
            </section>
          </div>
          <div className="catalog-footer"><span className="catalog-status"><i />Open-source ecosystem</span><span>{catalog.length} tools</span></div>
        </aside>

        <main ref={canvasWindowRef} className={`canvas-column${canvasFullscreen ? ' is-fullscreen' : ''}`}>
          <div className="canvas-toolbar">
            <span className="canvas-window-controls" aria-hidden="true"><i /><i /><i /></span>
            <div className="canvas-breadcrumb"><span>Architectures</span><Icon name="chevron-right" size={13} /><strong>{document.name || 'Untitled architecture'}</strong></div>
            <div className="canvas-toolbar-actions">
              <button className="toolbar-validate" onClick={() => { setInspectorTab('validate'); setMobileInspectorOpen(true) }}><span className={`validation-led ${errors ? 'led-error' : warnings ? 'led-warning' : ''}`} /><span>{errors ? `${errors} errors` : warnings ? `${warnings} warnings` : suggestions ? `${suggestions} suggestions` : 'No issues found'}</span><Icon name="chevron-right" size={14} /></button>
              <div className="history-controls">
                <button className="icon-button" title="Undo (⌘Z)" disabled={!canUndo} onClick={undo}><Icon name="undo" size={16} /></button>
                <button className="icon-button" title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo}><Icon name="redo" size={16} /></button>
              </div>
              <button className="icon-button fit-button" title="Fit all components" aria-label="Fit all components" onClick={fitCanvas}><Icon name="grid" size={16} /></button>
              <button className="toolbar-secondary" onClick={onImportClick}><Icon name="upload" size={14} /><span>Import</span></button>
              <button className="icon-button toolbar-shortcuts" title="Keyboard shortcuts" aria-label="Keyboard shortcuts" onClick={() => notify('⌘S save · ⌘Z undo · ⇧⌘Z redo · ⌘D duplicate · Delete remove')}><Icon name="command" size={15} /></button>
            </div>
          </div>
          <div className="canvas-area" onDrop={onCanvasDrop} onDragOver={(event) => event.preventDefault()}>
            {connectionStart && <div className="canvas-hint is-connecting"><span className="hint-dot" />Choose an input point to finish the connection<button onClick={() => setConnectionStart(null)}>Cancel</button></div>}
            <ReactFlow
              nodes={canvasNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onNodeDragStart={checkpoint}
              onNodeDragStop={stopNodeDrag}
              onNodeDoubleClick={showNodeProperties}
              onNodeContextMenu={onNodeContextMenu}
              onEdgeClick={deleteConnection}
              onPaneClick={hideInspectorFromCanvas}
              onMoveEnd={onCanvasMoveEnd}
              defaultViewport={document.viewport ?? fallbackViewport}
              fitView={nodes.length > 0 && !document.viewport}
              fitViewOptions={canvasFitOptions}
              minZoom={0.2}
              maxZoom={1.6}
              snapToGrid
              snapGrid={canvasSnapGrid}
              deleteKeyCode={null}
              panOnDrag={canvasPanButtons}
              proOptions={flowProOptions}
            >
              <Background variant={BackgroundVariant.Lines} gap={28} size={1} color={theme === 'dark' ? '#293a49' : '#d6e2d9'} />
              <Controls position="bottom-right" showInteractive={false} showFitView={false}>
                <ControlButton className="react-flow__controls-fullscreen" title={canvasFullscreen ? 'Exit full screen' : 'Full screen canvas'} aria-label={canvasFullscreen ? 'Exit full screen' : 'Full screen canvas'} onClick={toggleCanvasFullscreen}>
                  <Icon name={canvasFullscreen ? 'minimize' : 'maximize'} size={15} />
                </ControlButton>
              </Controls>
            </ReactFlow>
            {nodeContextMenu && contextNode && <div className="node-context-menu" style={{ left: Math.max(8, Math.min(nodeContextMenu.x, (window.document.querySelector<HTMLElement>('.canvas-area')?.clientWidth ?? window.innerWidth) - 225)), top: Math.max(8, Math.min(nodeContextMenu.y, (window.document.querySelector<HTMLElement>('.canvas-area')?.clientHeight ?? window.innerHeight) - 132)) }} onMouseDown={(event) => event.stopPropagation()}>
              <div className="node-context-title"><span className="catalog-symbol" style={{ '--node-accent': catalogById.get(contextNode.data.typeId)?.accent ?? '#8aa' } as CSSProperties}>{catalogById.get(contextNode.data.typeId)?.symbol ?? 'KL'}</span><span><small>COMPONENT</small><strong>{contextNode.data.title}</strong></span></div>
              <button onClick={() => { setNodeContextMenu(null); showNodeProperties() }}><Icon name="sliders" size={15} />Component settings</button>
              <button className="delete-context-action" onClick={() => deleteComponent(contextNode.id)}><Icon name="trash" size={15} />Delete component</button>
            </div>}
            {nodes.length === 0 && <div className="canvas-empty"><div className="empty-grid"><span /><span /><span /><span /></div><strong>Your canvas is ready</strong><p>Choose a component from the catalog or drag one here to get started.</p><button className="button button-primary" onClick={() => addComponent(catalog[0])}><Icon name="plus" size={15} />Add your first component</button></div>}
          </div>
          <footer className="canvas-footer"><span><Icon name="layers" size={14} />{nodes.length} components</span><i /> <span>{edges.length} connections</span><span className="canvas-footer-spacer" /><span><Icon name="cloud" size={14} />Local draft</span></footer>
        </main>

        {mobileInspectorOpen && <button className="inspector-backdrop" aria-label="Close panel" onClick={() => setMobileInspectorOpen(false)} />}
        <Inspector
          tab={inspectorTab}
          onTabChange={setInspectorTab}
          node={selectedNode}
          nodes={nodes}
          connectionCount={currentDocument.edges.length}
          issues={issues}
          onConfigChange={updateConfig}
          onBeginEdit={checkpoint}
          onDuplicate={duplicateNode}
          onDelete={deleteSelection}
          onFocusNode={(nodeId) => {
            setMobileInspectorOpen(true)
            setNodes((current) => {
              const next = current.map((node) => ({ ...node, selected: node.id === nodeId }))
              nodesRef.current = next
              return next
            })
            setEdges((current) => {
              const next = current.map((edge) => ({ ...edge, selected: false }))
              edgesRef.current = next
              return next
            })
            setInspectorTab('properties')
            flow.fitView({ nodes: [{ id: nodeId }], padding: 0.7, duration: 350 })
          }}
          onDeleteConnection={removeConnection}
          mobileOpen={mobileInspectorOpen}
          onMobileToggle={() => setMobileInspectorOpen((open) => !open)}
        />
      </div>

      <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={importDocument} />
      {toast && <div role="status" className="toast"><span className="toast-check"><Icon name="check" size={14} /></span>{toast}</div>}

      {libraryOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLibraryOpen(false) }}>
        <section className="library-dialog" role="dialog" aria-modal="true" aria-labelledby="library-title">
          <div className="dialog-header"><div><span className="eyebrow">YOUR WORKSPACE</span><h2 id="library-title">My architectures</h2></div><button className="icon-button" aria-label="Close" onClick={() => setLibraryOpen(false)}><Icon name="close" /></button></div>
          <p className="dialog-description">{apiReady ? 'Your saved architectures are available in this workspace.' : 'Workspace saves are unavailable right now. Your canvas draft remains on this device.'}</p>
          <div className="library-toolbar"><span>{library.length} saved {library.length === 1 ? 'architecture' : 'architectures'}</span><button className="button button-primary" onClick={() => void newArchitecture()}><Icon name="plus" size={15} />New architecture</button></div>
          <div className="library-list">
            {library.length ? library.map((entry) => (
              <article className={`library-card${entry.document.id === document.id ? ' current' : ''}`} key={entry.document.id}>
                <div className="library-art"><span /><span /><span /><span /></div>
                <div className="library-card-main"><strong>{entry.document.name || 'Untitled architecture'}</strong><span>{entry.document.nodes.length} components <i>·</i> {entry.document.edges.length} connections <i>·</i> Edited {new Date(entry.updatedAt).toLocaleDateString()}</span></div>
                <button className="button button-outline library-open" onClick={() => { replaceDocument(entry.document); setLibraryOpen(false); notify('Architecture opened') }}>Open</button>
                <button className="icon-button library-delete" aria-label={`Delete ${entry.document.name}`} onClick={() => {
                  void apiRequest<void>(accessToken, `/architectures/${encodeURIComponent(entry.document.id)}`, { method: 'DELETE' }).then(() => {
                    setLibrary((current) => current.filter((item) => item.document.id !== entry.document.id))
                    setRemoteIds((current) => { const next = new Set(current); next.delete(entry.document.id); return next })
                    notify('Architecture deleted from your workspace')
                  }).catch((error: unknown) => notify(error instanceof Error ? error.message : 'Could not delete this architecture.'))
                }}><Icon name="trash" size={15} /></button>
              </article>
            )) : <div className="library-empty"><span className="library-empty-icon"><Icon name="folder" size={21} /></span><strong>{apiReady ? 'No saved architectures yet' : 'Workspace unavailable'}</strong><p>{!apiReady ? 'Your canvas drafts remain saved on this device. Try again later to access workspace designs.' : errors > 0 ? 'Resolve the validation errors before saving this canvas.' : 'Save the current canvas to your workspace, or create a new design.'}</p><button className="button button-primary" disabled={!apiReady || errors > 0 || saveState === 'saving'} onClick={() => void saveArchitecture()}><Icon name="save" size={15} />Save current architecture</button></div>}
          </div>
          <div className="dialog-footer"><Icon name="shield" size={15} /><span>{apiReady ? 'Workspace access is active.' : 'Your current draft is saved on this device.'}</span><button className="button button-quiet" onClick={onImportClick}><Icon name="upload" size={15} />Import JSON</button></div>
        </section>
      </div>}
    </div>
  )
}

const THEME_STORAGE_KEY = 'kloudlab.theme'

function currentPage(): AppPage {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/about' || path === '/playground' || path === '/login' || path === '/signup') return path.slice(1) as AppPage
  return 'home'
}

function storedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch { return 'dark' }
}

export function App() {
  return <AuthRoutes />
}

function AuthRoutes() {
  const auth = useAuth()
  const [page, setPage] = useState<AppPage>(currentPage)
  const [theme, setTheme] = useState<Theme>(storedTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* Theme still applies for this session. */ }
  }, [theme])

  useEffect(() => {
    const onPopState = () => setPage(currentPage())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((nextPage: AppPage) => {
    const authPage = nextPage === 'login' || nextPage === 'signup'
    const currentReturnTo = page === 'login' || page === 'signup'
      ? new URLSearchParams(window.location.search).get('returnTo')
      : null
    const originPath = page === 'playground' ? '/playground' : page === 'about' ? '/about' : '/'
    const returnTo = authPage ? `?returnTo=${encodeURIComponent(currentReturnTo ?? originPath)}` : ''
    const path = (nextPage === 'home' ? '/' : `/${nextPage}`) + returnTo
    if (`${window.location.pathname}${window.location.search}` !== path) window.history.pushState({}, '', path)
    setPage(nextPage)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [page])
  const toggleTheme = useCallback(() => setTheme((current) => current === 'dark' ? 'light' : 'dark'), [])

  if (page === 'playground') {
    if (auth.loading) return <div className="site-root auth-loading" data-theme={theme}><span className="save-dot saving" />Checking your KloudLab session…</div>
    if (!auth.user) return <div className="site-root" data-theme={theme}><AuthPage mode="login" theme={theme} onNavigate={navigate} onToggleTheme={toggleTheme} /></div>
    return <div className="site-root" data-theme={theme}><ReactFlowProvider><AppContent theme={theme} accessToken={auth.accessToken ?? ''} apiConfigured={auth.apiConfigured} subject={auth.user?.sub ?? ''} accountName={authDisplayName(auth.user)} onToggleTheme={toggleTheme} onNavigate={navigate} onLogout={auth.logout} /></ReactFlowProvider></div>
  }
  return (
    <div className="site-root" data-theme={theme}>
      {page === 'about'
        ? <AboutPage theme={theme} authenticated={Boolean(auth.user)} accountName={authDisplayName(auth.user)} onNavigate={navigate} onToggleTheme={toggleTheme} onLogout={auth.logout} />
        : page === 'login' || page === 'signup'
          ? <AuthPage mode={page} theme={theme} onNavigate={navigate} onToggleTheme={toggleTheme} />
          : <HomePage theme={theme} authenticated={Boolean(auth.user)} accountName={authDisplayName(auth.user)} onNavigate={navigate} onToggleTheme={toggleTheme} onLogout={auth.logout} />}
    </div>
  )
}
