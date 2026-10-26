import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ChangeEvent, type CSSProperties } from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { CanvasNode, type ComponentFlowNode, type ComponentNodeData } from './components/CanvasNode'
import { Icon } from './components/Icon'
import { Inspector, type InspectorTab } from './components/Inspector'
import { catalog, catalogById, categories, defaultConfig, type ComponentDefinition, type ComponentCategory } from './domain/catalog'
import {
  ACTIVE_KEY,
  createEmptyCanvas,
  createStarterCanvas,
  isCanvasDocument,
  makeId,
  STORAGE_KEY,
  validateCanvas,
  type CanvasDocument,
  type CanvasEdgeDocument,
} from './domain/canvas'

type SavedArchitecture = { document: CanvasDocument; updatedAt: string }
type SaveState = 'saved' | 'saving' | 'unsaved'

const nodeTypes = { component: CanvasNode }
const edgeStyle = { stroke: '#82978a', strokeWidth: 1.8 }
const edgeOptions = { type: 'smoothstep', animated: false, style: edgeStyle }

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
      sourceHandle: item.sourcePort,
      target: item.target,
      targetHandle: item.targetPort,
      type: 'smoothstep',
      style: edgeStyle,
    })),
  }
}

function readDocument(): CanvasDocument {
  try {
    const active = localStorage.getItem(ACTIVE_KEY)
    if (active) {
      const parsed: unknown = JSON.parse(active)
      if (isCanvasDocument(parsed)) return parsed
    }
  } catch { /* Storage may be disabled; use the example document. */ }
  return createStarterCanvas()
}

function readLibrary(): SavedArchitecture[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item): item is SavedArchitecture =>
      Boolean(item && typeof item === 'object' && isCanvasDocument((item as SavedArchitecture).document) && typeof (item as SavedArchitecture).updatedAt === 'string'),
    )
  } catch { return [] }
}

function documentFromFlow(
  base: CanvasDocument,
  nodes: ComponentFlowNode[],
  edges: Edge[],
): CanvasDocument {
  return {
    ...base,
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
      sourcePort: edge.sourceHandle ?? '',
      target: edge.target,
      targetPort: edge.targetHandle ?? '',
    })),
  }
}

function componentConnectionValid(connection: Connection, nodes: ComponentFlowNode[], edges: Edge[]): boolean {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return false
  if (connection.source === connection.target) return false
  const source = nodes.find((node) => node.id === connection.source)
  const target = nodes.find((node) => node.id === connection.target)
  const sourceComponent = source && catalogById.get(source.data.typeId)
  const targetComponent = target && catalogById.get(target.data.typeId)
  const output = sourceComponent?.ports.find((port) => port.id === connection.sourceHandle && port.direction === 'output')
  const input = targetComponent?.ports.find((port) => port.id === connection.targetHandle && port.direction === 'input')
  if (!output || !input || !output.connectionTypes.some((type) => input.connectionTypes.includes(type))) return false
  const sameConnection = edges.some((edge) => edge.source === connection.source && edge.sourceHandle === connection.sourceHandle && edge.target === connection.target && edge.targetHandle === connection.targetHandle)
  if (sameConnection) return false
  if (output.multiple === false && edges.some((edge) => edge.source === connection.source && edge.sourceHandle === connection.sourceHandle)) return false
  if (input.multiple === false && edges.some((edge) => edge.target === connection.target && edge.targetHandle === connection.targetHandle)) return false
  return true
}

function AppContent() {
  const initialDocument = useMemo(readDocument, [])
  const initialFlow = useMemo(() => fromDocument(initialDocument), [initialDocument])
  const [document, setDocument] = useState(initialDocument)
  const [nodes, setNodes] = useState<ComponentFlowNode[]>(initialFlow.nodes)
  const [edges, setEdges] = useState<Edge[]>(initialFlow.edges)
  const [library, setLibrary] = useState<SavedArchitecture[]>(readLibrary)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ComponentCategory | 'All'>('All')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('properties')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [toast, setToast] = useState('')
  const [mobileCatalogOpen, setMobileCatalogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const documentRef = useRef(document)
  const historyRef = useRef<CanvasDocument[]>([])
  const futureRef = useRef<CanvasDocument[]>([])
  const flow = useReactFlow<ComponentFlowNode, Edge>()

  nodesRef.current = nodes
  edgesRef.current = edges
  documentRef.current = document

  const currentDocument = useMemo(() => documentFromFlow(document, nodes, edges), [document, nodes, edges])
  const issues = useMemo(() => validateCanvas(currentDocument), [currentDocument])
  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.filter((issue) => issue.severity === 'warning').length
  const selectedNode = nodes.find((node) => node.selected) ?? null
  const selectedEdge = edges.find((edge) => edge.selected)
  const selectedEdgeDocument: CanvasEdgeDocument | null = selectedEdge ? {
    id: selectedEdge.id,
    source: selectedEdge.source,
    sourcePort: selectedEdge.sourceHandle ?? '',
    target: selectedEdge.target,
    targetPort: selectedEdge.targetHandle ?? '',
  } : null
  const filteredComponents = useMemo(() => catalog.filter((component) => {
    const matchesCategory = category === 'All' || component.category === category
    const search = query.trim().toLowerCase()
    return matchesCategory && (!search || `${component.displayName} ${component.description} ${component.category}`.toLowerCase().includes(search))
  }), [category, query])
  const canUndo = historyRef.current.length > 0
  const canRedo = futureRef.current.length > 0

  const notify = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2600)
  }, [])

  const checkpoint = useCallback(() => {
    historyRef.current = [...historyRef.current.slice(-49), documentFromFlow(documentRef.current, nodesRef.current, edgesRef.current)]
    futureRef.current = []
  }, [])

  const replaceDocument = useCallback((next: CanvasDocument) => {
    const parsed = fromDocument(next)
    setDocument(next)
    setNodes(parsed.nodes)
    setEdges(parsed.edges)
    nodesRef.current = parsed.nodes
    edgesRef.current = parsed.edges
    documentRef.current = next
    historyRef.current = []
    futureRef.current = []
    setSaveState('unsaved')
  }, [])

  useEffect(() => {
    setSaveState('saving')
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(currentDocument))
        setSaveState('saved')
      } catch {
        setSaveState('unsaved')
      }
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [currentDocument])

  const saveArchitecture = useCallback((quiet = false) => {
    const next = documentFromFlow(documentRef.current, nodesRef.current, edgesRef.current)
    const nextLibrary = [{ document: next, updatedAt: new Date().toISOString() }, ...readLibrary().filter((entry) => entry.document.id !== next.id)]
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextLibrary))
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(next))
      setLibrary(nextLibrary)
      setSaveState('saved')
      if (!quiet) notify('Architecture saved in this browser')
    } catch {
      notify('Browser storage is unavailable. Export a JSON backup instead.')
    }
  }, [notify])

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
    setInspectorTab('properties')
    setMobileCatalogOpen(false)
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
    if (!componentConnectionValid(connection, nodesRef.current, edgesRef.current)) return
    checkpoint()
    setEdges((current) => {
      const next = addEdge({ ...connection, id: makeId('edge'), ...edgeOptions }, current)
      edgesRef.current = next
      return next
    })
    setSaveState('unsaved')
  }, [checkpoint])

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
        replaceDocument({ ...parsed, id: makeId('canvas') })
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

  const newArchitecture = useCallback(() => {
    const next = createEmptyCanvas()
    replaceDocument(next)
    setLibraryOpen(false)
    notify('New architecture created')
  }, [notify, replaceDocument])

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
  const fitCanvas = () => flow.fitView({ padding: 0.18, duration: 400 })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target?.matches('input, textarea, select, [contenteditable="true"]')
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 's') {
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
        <a className="brand" href="#" aria-label="KloudLab home"><span className="brand-mark"><i /><i /><i /></span><span>kloud<span>lab</span></span></a>
        <div className="topbar-divider" />
        <div className="project-title-wrap">
          <input aria-label="Architecture name" className="project-title" value={document.name} onFocus={checkpoint} onChange={(event) => { setDocument((current) => ({ ...current, name: event.target.value })); setSaveState('unsaved') }} />
          <span className="save-indicator"><i className={`save-dot ${saveState}`} />{saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved to this browser' : 'Unsaved changes'}</span>
        </div>
        <div className="topbar-spacer" />
        <button className="button button-quiet library-trigger" onClick={() => setLibraryOpen(true)}><Icon name="folder" size={16} /><span>My architectures</span></button>
        <button className="button button-outline" onClick={exportDocument}><Icon name="download" size={15} /><span>Export</span></button>
        <button className="button button-primary" onClick={() => saveArchitecture()}><Icon name="save" size={15} /><span>Save</span><kbd>⌘S</kbd></button>
        <button className="icon-button mobile-menu" aria-label="Open component catalog" onClick={() => setMobileCatalogOpen(!mobileCatalogOpen)}><Icon name="menu" /></button>
      </header>

      <div className="workspace">
        <aside className={`catalog-panel${mobileCatalogOpen ? ' mobile-open' : ''}`}>
          <div className="catalog-header">
            <div><span className="eyebrow">DESIGN SYSTEM</span><h1>Components</h1></div>
            <button className="icon-button catalog-add" title="New architecture" onClick={newArchitecture}><Icon name="plus" size={17} /></button>
          </div>
          <p className="catalog-intro">Drag components onto the canvas to map your architecture.</p>
          <label className="search-field"><Icon name="search" size={15} /><input placeholder="Find a component" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>/</kbd></label>
          <div className="category-filters" aria-label="Filter components">
            <button className={category === 'All' ? 'active' : ''} onClick={() => setCategory('All')}>All <span>{catalog.length}</span></button>
            {categories.map((item) => <button className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}
          </div>
          <div className="catalog-list">
            {filteredComponents.length ? filteredComponents.map((component) => (
              <button className="catalog-item" key={component.typeId} draggable onDragStart={(event) => onCatalogDragStart(event, component)} onClick={() => addComponent(component)}>
                <span className="catalog-symbol" style={{ '--node-accent': component.accent } as CSSProperties}>{component.symbol}</span>
                <span className="catalog-item-copy"><strong>{component.displayName}</strong><small>{component.description}</small></span>
                <span className="catalog-item-add"><Icon name="plus" size={15} /></span>
              </button>
            )) : <div className="catalog-no-results"><Icon name="search" size={20} /><span>No components match</span><small>Try another name or category.</small></div>}
          </div>
          <div className="catalog-footer"><span className="catalog-status"><i />Catalog v1.0</span><span>13 components</span></div>
        </aside>

        <main className="canvas-column">
          <div className="canvas-toolbar">
            <div className="canvas-breadcrumb"><span>Architectures</span><Icon name="chevron-right" size={13} /><strong>{document.name || 'Untitled architecture'}</strong></div>
            <div className="canvas-toolbar-actions">
              <div className="history-controls">
                <button className="icon-button" title="Undo (⌘Z)" disabled={!canUndo} onClick={undo}><Icon name="undo" size={16} /></button>
                <button className="icon-button" title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo}><Icon name="redo" size={16} /></button>
              </div>
              <span className="toolbar-divider" />
              <button className="toolbar-validate" onClick={() => setInspectorTab('validate')}><span className={`validation-led ${errors ? 'led-error' : warnings ? 'led-warning' : ''}`} /><span>{errors ? `${errors} errors` : warnings ? `${warnings} warnings` : 'All checks passed'}</span><Icon name="chevron-right" size={14} /></button>
              <button className="icon-button fit-button" title="Fit canvas" onClick={fitCanvas}><Icon name="grid" size={16} /></button>
            </div>
          </div>
          <div className="canvas-area" onDrop={onCanvasDrop} onDragOver={(event) => event.preventDefault()}>
            <div className="canvas-hint"><span className="hint-dot" />Local draft <span className="hint-separator">·</span> Drag to connect ports</div>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={(connection) => componentConnectionValid(connection as Connection, nodesRef.current, edgesRef.current)}
              onNodeDragStart={checkpoint}
              onNodeDragStop={() => setSaveState('unsaved')}
              onNodeClick={() => setInspectorTab('properties')}
              onPaneClick={() => setInspectorTab('properties')}
              onMoveEnd={(_, viewport) => setDocument((current) => ({ ...current, viewport }))}
              onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
                const selectedNodeIds = new Set(selectedNodes.map((node) => node.id))
                const selectedEdgeIds = new Set(selectedEdges.map((edge) => edge.id))
                setNodes((current) => {
                  const next = current.map((node) => ({ ...node, selected: selectedNodeIds.has(node.id) }))
                  nodesRef.current = next
                  return next
                })
                setEdges((current) => {
                  const next = current.map((edge) => ({ ...edge, selected: selectedEdgeIds.has(edge.id) }))
                  edgesRef.current = next
                  return next
                })
              }}
              defaultViewport={document.viewport ?? { x: 0, y: 0, zoom: 0.8 }}
              fitView={nodes.length > 0 && !document.viewport}
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={1.6}
              snapToGrid
              snapGrid={[16, 16]}
              deleteKeyCode={null}
              selectionOnDrag
              panOnDrag={[1, 2]}
              proOptions={{ hideAttribution: false }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#d9dfd9" />
              <Controls position="bottom-right" showInteractive={false} />
              <MiniMap position="bottom-left" pannable zoomable nodeColor={(node) => catalogById.get((node.data as ComponentNodeData).typeId)?.accent ?? '#a0aaa2'} maskColor="rgba(241, 244, 239, 0.72)" />
            </ReactFlow>
            {nodes.length === 0 && <div className="canvas-empty"><div className="empty-grid"><span /><span /><span /><span /></div><strong>Your canvas is ready</strong><p>Choose a component from the catalog or drag one here to get started.</p><button className="button button-primary" onClick={() => addComponent(catalog[0])}><Icon name="plus" size={15} />Add your first component</button></div>}
          </div>
          <footer className="canvas-footer"><span><Icon name="layers" size={14} />{nodes.length} components</span><i /> <span>{edges.length} connections</span><span className="canvas-footer-spacer" /><span><Icon name="cloud" size={14} />Saved locally</span></footer>
        </main>

        <Inspector
          tab={inspectorTab}
          onTabChange={setInspectorTab}
          node={selectedNode}
          edge={selectedEdgeDocument}
          nodes={nodes}
          edges={currentDocument.edges}
          issues={issues}
          onConfigChange={updateConfig}
          onBeginEdit={checkpoint}
          onDuplicate={duplicateNode}
          onDelete={deleteSelection}
          onDeleteEdge={deleteSelection}
          onFocusNode={(nodeId) => {
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
        />
      </div>

      <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={importDocument} />
      <div className="bottom-left-actions"><button className="icon-button" title="Import architecture JSON" onClick={onImportClick}><Icon name="upload" size={16} /></button><span>Import JSON</span><span className="bottom-action-divider" /><button className="icon-button" title="Keyboard shortcuts" onClick={() => notify('⌘S save · ⌘Z undo · ⇧⌘Z redo · ⌘D duplicate · Delete remove')}><Icon name="command" size={15} /></button><span>Shortcuts</span></div>
      {toast && <div role="status" className="toast"><span className="toast-check"><Icon name="check" size={14} /></span>{toast}</div>}

      {libraryOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLibraryOpen(false) }}>
        <section className="library-dialog" role="dialog" aria-modal="true" aria-labelledby="library-title">
          <div className="dialog-header"><div><span className="eyebrow">YOUR WORKSPACE</span><h2 id="library-title">My architectures</h2></div><button className="icon-button" aria-label="Close" onClick={() => setLibraryOpen(false)}><Icon name="close" /></button></div>
          <p className="dialog-description">Saved drafts stay in this browser. Export a JSON file to move an architecture to another device.</p>
          <div className="library-toolbar"><span>{library.length} saved {library.length === 1 ? 'architecture' : 'architectures'}</span><button className="button button-primary" onClick={newArchitecture}><Icon name="plus" size={15} />New architecture</button></div>
          <div className="library-list">
            {library.length ? library.map((entry) => (
              <article className={`library-card${entry.document.id === document.id ? ' current' : ''}`} key={entry.document.id}>
                <div className="library-art"><span /><span /><span /><span /></div>
                <div className="library-card-main"><strong>{entry.document.name || 'Untitled architecture'}</strong><span>{entry.document.nodes.length} components <i>·</i> {entry.document.edges.length} connections <i>·</i> Edited {new Date(entry.updatedAt).toLocaleDateString()}</span></div>
                <button className="button button-outline library-open" onClick={() => { replaceDocument(entry.document); setLibraryOpen(false); notify('Architecture opened') }}>Open</button>
                <button className="icon-button library-delete" aria-label={`Delete ${entry.document.name}`} onClick={() => {
                  const next = library.filter((item) => item.document.id !== entry.document.id)
                  setLibrary(next)
                  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { notify('Could not update the browser architecture library') }
                }}><Icon name="trash" size={15} /></button>
              </article>
            )) : <div className="library-empty"><span className="library-empty-icon"><Icon name="folder" size={21} /></span><strong>No saved architectures yet</strong><p>Save this canvas to keep it in your browser, or create a new design.</p><button className="button button-primary" onClick={() => saveArchitecture()}><Icon name="save" size={15} />Save current architecture</button></div>}
          </div>
          <div className="dialog-footer"><Icon name="shield" size={15} /><span>Drafts remain on this device. Nothing is sent to a server.</span><button className="button button-quiet" onClick={onImportClick}><Icon name="upload" size={15} />Import JSON</button></div>
        </section>
      </div>}
    </div>
  )
}

export function App() {
  return <ReactFlowProvider><AppContent /></ReactFlowProvider>
}
