import { useEffect, useRef, useState } from 'react'
import { sanitizeSvg } from '../../utils/sanitize'

/**
 * Custom flow diagram renderer — replaces mermaid for simple presentation diagrams.
 * Parses a subset of mermaid syntax (graph LR / graph TD) and renders clean SVG
 * with properly measured text, modern styling, and theme-aware colors.
 */

interface FlowNode {
  id: string
  label: string
  shape: 'rect' | 'round' | 'circle' | 'diamond' | 'stadium'
}

interface FlowEdge {
  from: string
  to: string
  label?: string
  style: 'solid' | 'dashed' | 'thick'
}

interface FlowGraph {
  direction: 'LR' | 'TD' | 'TB' | 'RL' | 'BT'
  nodes: Map<string, FlowNode>
  edges: FlowEdge[]
}

/** Parse mermaid-like graph syntax into nodes and edges */
function parseGraph(source: string): FlowGraph | null {
  const lines = source.trim().split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'))
  if (lines.length === 0) return null

  const headerMatch = lines[0].match(/^graph\s+(LR|TD|TB|RL|BT)\s*$/i)
  if (!headerMatch) return null

  const direction = headerMatch[1].toUpperCase() as FlowGraph['direction']
  const nodes = new Map<string, FlowNode>()
  const edges: FlowEdge[] = []

  function parseNodeRef(raw: string): FlowNode {
    raw = raw.trim()
    // Stadium: A(["label"])
    let m = raw.match(/^(\w+)\(\["(.+?)"\]\)$/)
    if (m) return { id: m[1], label: m[2], shape: 'stadium' }
    // Round with quotes: A("label")
    m = raw.match(/^(\w+)\("(.+?)"\)$/)
    if (m) return { id: m[1], label: m[2], shape: 'round' }
    // Round: A(label)
    m = raw.match(/^(\w+)\((.+?)\)$/)
    if (m) return { id: m[1], label: m[2], shape: 'round' }
    // Rect with quotes: A["label"]
    m = raw.match(/^(\w+)\["(.+?)"\]$/)
    if (m) return { id: m[1], label: m[2], shape: 'rect' }
    // Rect: A[label]
    m = raw.match(/^(\w+)\[(.+?)\]$/)
    if (m) return { id: m[1], label: m[2], shape: 'rect' }
    // Diamond: A{label} or A{"label"}
    m = raw.match(/^(\w+)\{["]?(.+?)["]?\}$/)
    if (m) return { id: m[1], label: m[2], shape: 'diamond' }
    // Circle: A((label))
    m = raw.match(/^(\w+)\(\((.+?)\)\)$/)
    if (m) return { id: m[1], label: m[2], shape: 'circle' }
    // Plain ID
    m = raw.match(/^(\w+)$/)
    if (m) return { id: m[1], label: m[1], shape: 'rect' }
    return { id: raw, label: raw, shape: 'rect' }
  }

  function ensureNode(ref: string): string {
    const node = parseNodeRef(ref)
    if (!nodes.has(node.id)) {
      nodes.set(node.id, node)
    } else if (node.label !== node.id) {
      // Update label if a more specific definition is found
      nodes.set(node.id, node)
    }
    return node.id
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/;$/, '').trim()
    if (!line) continue

    // Edge patterns: A --> B, A -->|label| B, A -.-> B, A ==> B
    // Split on arrow patterns
    const parts = line.split(/\s*(-->|-.->|==>|---)\s*/)

    if (parts.length >= 3) {
      for (let j = 0; j < parts.length - 2; j += 2) {
        let fromRaw = parts[j].trim()
        const arrow = parts[j + 1]
        let toRaw = parts[j + 2].trim()

        // Check for edge label: |label| at start of toRaw
        let edgeLabel: string | undefined
        const labelMatch = toRaw.match(/^\|(.+?)\|\s*(.+)$/)
        if (labelMatch) {
          edgeLabel = labelMatch[1]
          toRaw = labelMatch[2]
        }
        // Also check fromRaw for trailing |label|
        const fromLabelMatch = fromRaw.match(/^(.+?)\s*\|(.+?)\|$/)
        if (fromLabelMatch) {
          fromRaw = fromLabelMatch[1]
          edgeLabel = fromLabelMatch[2]
        }

        const fromId = ensureNode(fromRaw)
        const toId = ensureNode(toRaw)

        let style: FlowEdge['style'] = 'solid'
        if (arrow === '-.->') style = 'dashed'
        if (arrow === '==>') style = 'thick'

        edges.push({ from: fromId, to: toId, label: edgeLabel, style })
      }
    } else {
      // Standalone node definition
      ensureNode(line)
    }
  }

  return { direction, nodes, edges }
}

/** Measure text width using a hidden canvas */
const measureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
function measureText(text: string, fontSize: number = 13, fontWeight: number = 500): number {
  if (!measureCanvas) return text.length * fontSize * 0.6
  const ctx = measureCanvas.getContext('2d')!
  ctx.font = `${fontWeight} ${fontSize}px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif`
  return ctx.measureText(text).width
}

interface NodeLayout {
  id: string
  x: number
  y: number
  w: number
  h: number
  node: FlowNode
}

/** Simple layout: arrange nodes in a grid based on graph topology */
function layoutGraph(graph: FlowGraph): { nodes: NodeLayout[]; width: number; height: number } {
  const nodeList = Array.from(graph.nodes.values())
  const isHorizontal = graph.direction === 'LR' || graph.direction === 'RL'

  // Calculate node sizes
  const nodePadH = 18 // horizontal padding inside node
  const nodePadV = 10 // vertical padding
  const fontSize = 13
  const nodeH = fontSize + nodePadV * 2

  const nodeSizes = new Map<string, { w: number; h: number }>()
  for (const node of nodeList) {
    const textW = measureText(node.label, fontSize, 500)
    const w = Math.max(textW + nodePadH * 2, 60)
    nodeSizes.set(node.id, { w, h: nodeH })
  }

  // Topological ordering using BFS from roots
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const node of nodeList) {
    inDegree.set(node.id, 0)
    adj.set(node.id, [])
  }
  for (const edge of graph.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1)
    adj.get(edge.from)?.push(edge.to)
  }

  // Assign ranks (levels)
  const rank = new Map<string, number>()
  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) { queue.push(id); rank.set(id, 0) }
  }
  // If no roots found (cycle), just use order
  if (queue.length === 0) {
    nodeList.forEach((n, i) => { queue.push(n.id); rank.set(n.id, i) })
  }

  let qi = 0
  while (qi < queue.length) {
    const current = queue[qi++]
    const currentRank = rank.get(current) || 0
    for (const next of adj.get(current) || []) {
      if (!rank.has(next) || rank.get(next)! < currentRank + 1) {
        rank.set(next, currentRank + 1)
      }
      inDegree.set(next, (inDegree.get(next) || 0) - 1)
      if (inDegree.get(next) === 0) {
        queue.push(next)
      }
    }
  }
  // Ensure all nodes have ranks
  for (const node of nodeList) {
    if (!rank.has(node.id)) rank.set(node.id, 0)
  }

  // Group by rank
  const rankGroups = new Map<number, string[]>()
  for (const [id, r] of rank) {
    if (!rankGroups.has(r)) rankGroups.set(r, [])
    rankGroups.get(r)!.push(id)
  }

  const gapMain = 45  // gap between ranks
  const gapCross = 20 // gap between nodes in same rank

  const layouts: NodeLayout[] = []
  let totalMain = 0
  let maxCross = 0
  const sortedRanks = Array.from(rankGroups.keys()).sort((a, b) => a - b)

  for (const r of sortedRanks) {
    const group = rankGroups.get(r)!
    let crossOffset = 0
    let maxMain = 0

    for (const id of group) {
      const size = nodeSizes.get(id)!
      const node = graph.nodes.get(id)!
      const mainSize = isHorizontal ? size.w : size.h
      const crossSize = isHorizontal ? size.h : size.w

      layouts.push({
        id,
        x: isHorizontal ? totalMain : crossOffset,
        y: isHorizontal ? crossOffset : totalMain,
        w: size.w,
        h: size.h,
        node,
      })

      crossOffset += crossSize + gapCross
      maxMain = Math.max(maxMain, mainSize)
    }

    totalMain += maxMain + gapMain
    maxCross = Math.max(maxCross, crossOffset - gapCross)
  }

  // Center nodes within their rank
  for (const r of sortedRanks) {
    const group = rankGroups.get(r)!
    const groupLayouts = layouts.filter(l => group.includes(l.id))

    if (isHorizontal) {
      const totalH = groupLayouts.reduce((sum, l) => sum + l.h, 0) + (groupLayouts.length - 1) * gapCross
      const startY = (maxCross - totalH) / 2
      let cy = startY
      for (const l of groupLayouts) {
        l.y = cy
        cy += l.h + gapCross
      }
    } else {
      const totalW = groupLayouts.reduce((sum, l) => sum + l.w, 0) + (groupLayouts.length - 1) * gapCross
      const startX = (maxCross - totalW) / 2
      let cx = startX
      for (const l of groupLayouts) {
        l.x = cx
        cx += l.w + gapCross
      }
    }
  }

  const width = isHorizontal ? totalMain - gapMain : maxCross
  const height = isHorizontal ? maxCross : totalMain - gapMain

  return { nodes: layouts, width: Math.max(width, 100), height: Math.max(height, 40) }
}

/** Render the flow diagram as SVG */
function renderSvg(graph: FlowGraph): string {
  const { nodes, width, height } = layoutGraph(graph)
  const pad = 20
  const svgW = width + pad * 2
  const svgH = height + pad * 2
  const isHorizontal = graph.direction === 'LR' || graph.direction === 'RL'

  const nodeMap = new Map<string, NodeLayout>()
  for (const n of nodes) nodeMap.set(n.id, n)

  // Build SVG
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;max-height:350px">`

  // Arrow marker
  svg += `<defs>
    <marker id="flow-arrow" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 3.5 L 0 7 z" class="flow-arrow-head" />
    </marker>
  </defs>`

  // Edges
  for (const edge of graph.edges) {
    const from = nodeMap.get(edge.from)
    const to = nodeMap.get(edge.to)
    if (!from || !to) continue

    let x1: number, y1: number, x2: number, y2: number

    if (isHorizontal) {
      x1 = pad + from.x + from.w
      y1 = pad + from.y + from.h / 2
      x2 = pad + to.x
      y2 = pad + to.y + to.h / 2
    } else {
      x1 = pad + from.x + from.w / 2
      y1 = pad + from.y + from.h
      x2 = pad + to.x + to.w / 2
      y2 = pad + to.y
    }

    const dashArray = edge.style === 'dashed' ? 'stroke-dasharray="6 4"' : ''
    const strokeWidth = edge.style === 'thick' ? 2 : 1.5

    // Curved path
    if (isHorizontal) {
      const midX = (x1 + x2) / 2
      svg += `<path d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}"
        class="flow-edge" fill="none" stroke-width="${strokeWidth}" ${dashArray} marker-end="url(#flow-arrow)" />`
    } else {
      const midY = (y1 + y2) / 2
      svg += `<path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}"
        class="flow-edge" fill="none" stroke-width="${strokeWidth}" ${dashArray} marker-end="url(#flow-arrow)" />`
    }

    // Edge label
    if (edge.label) {
      const lx = (x1 + x2) / 2
      const ly = (y1 + y2) / 2 - 8
      svg += `<text x="${lx}" y="${ly}" class="flow-edge-label" text-anchor="middle">${escapeHtml(edge.label)}</text>`
    }
  }

  // Nodes
  for (const layout of nodes) {
    const nx = pad + layout.x
    const ny = pad + layout.y
    const r = 10

    if (layout.node.shape === 'stadium' || layout.node.shape === 'round') {
      svg += `<rect x="${nx}" y="${ny}" width="${layout.w}" height="${layout.h}" rx="${layout.h / 2}" ry="${layout.h / 2}" class="flow-node" />`
    } else if (layout.node.shape === 'circle') {
      const cr = Math.max(layout.w, layout.h) / 2
      svg += `<circle cx="${nx + layout.w / 2}" cy="${ny + layout.h / 2}" r="${cr}" class="flow-node" />`
    } else if (layout.node.shape === 'diamond') {
      const cx = nx + layout.w / 2
      const cy = ny + layout.h / 2
      const hw = layout.w / 2 + 4
      const hh = layout.h / 2 + 4
      svg += `<polygon points="${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}" class="flow-node" />`
    } else {
      svg += `<rect x="${nx}" y="${ny}" width="${layout.w}" height="${layout.h}" rx="${r}" ry="${r}" class="flow-node" />`
    }

    // Text
    svg += `<text x="${nx + layout.w / 2}" y="${ny + layout.h / 2}" class="flow-node-text" dominant-baseline="central" text-anchor="middle">${escapeHtml(layout.node.label)}</text>`
  }

  svg += '</svg>'
  return svg
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function FlowDiagram({ chart }: { chart: string }): JSX.Element {
  const graph = parseGraph(chart)

  if (!graph || graph.nodes.size === 0) {
    return <MermaidFallback chart={chart} />
  }

  const svg = renderSvg(graph)

  return (
    <div
      className="flow-diagram"
      style={{ margin: '0.75rem 0', width: '100%', maxHeight: '350px', display: 'flex', justifyContent: 'center' }}
      dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }}
    />
  )
}

/** Fallback to mermaid for complex diagrams we can't parse */
function MermaidFallback({ chart }: { chart: string }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function render() {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: { fontSize: '13px', primaryColor: '#1e293b', primaryTextColor: '#e2e8f0', primaryBorderColor: '#475569', lineColor: '#64748b', mainBkg: '#1e293b', background: 'transparent' },
          flowchart: { htmlLabels: false, useMaxWidth: true },
        })
        const id = `mermaid-fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const { svg: rendered } = await mermaid.render(id, chart.trim())
        if (!cancelled) { setSvg(rendered); setError(null) }
      } catch (err) {
        if (!cancelled) { setError((err as Error).message); setSvg('') }
      }
    }
    render()
    return () => { cancelled = true }
  }, [chart])

  if (error) {
    return (
      <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '0.5rem', padding: '0.75rem', margin: '1rem 0', fontSize: '0.7rem' }}>
        <div style={{ color: '#f87171', fontWeight: 600, marginBottom: '0.25rem' }}>Diagram error</div>
        <pre style={{ color: '#94a3b8', whiteSpace: 'pre-wrap', fontSize: '0.65rem' }}>{chart}</pre>
      </div>
    )
  }

  return (
    <div ref={ref} className="mermaid-diagram" style={{ margin: '1.25rem 0', display: 'flex', justifyContent: 'center', width: '100%' }}
      dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }} />
  )
}
