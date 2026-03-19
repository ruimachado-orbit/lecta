import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

// Force fresh init every time the module loads (dev HMR compatibility)
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: 'transparent',
    primaryTextColor: '#e2e8f0',
    primaryBorderColor: '#475569',
    lineColor: '#64748b',
    secondaryColor: 'transparent',
    tertiaryColor: 'transparent',
    background: 'transparent',
    mainBkg: 'transparent',
    nodeBorder: '#475569',
    clusterBkg: 'transparent',
    clusterBorder: '#334155',
    titleColor: '#f1f5f9',
    edgeLabelBackground: 'transparent',
    fontSize: '13px',
    fontFamily: '-apple-system, "SF Pro Text", Inter, system-ui, sans-serif',
  },
  flowchart: {
    htmlLabels: false,
    curve: 'basis',
    nodeSpacing: 50,
    rankSpacing: 60,
    padding: 16,
    useMaxWidth: true,
  },
  sequence: { actorMargin: 50, noteMargin: 10, messageFontSize: 13, actorFontSize: 13 },
})

interface MermaidDiagramProps {
  chart: string
}

export function MermaidDiagram({ chart }: MermaidDiagramProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    async function render() {
      try {
        const { svg: rendered } = await mermaid.render(id, chart.trim())
        // Make SVG responsive
        const fixed = rendered.replace(/style="max-width:[^"]*"/, 'style="width:100%;height:auto"')
        setSvg(fixed)
        setError(null)

        // After render, fix any remaining text overflow by measuring
        requestAnimationFrame(() => {
          const container = containerRef.current
          if (!container) return
          const svgEl = container.querySelector('svg')
          if (!svgEl) return

          // Find all foreignObject elements and ensure they're wide enough
          svgEl.querySelectorAll('foreignObject').forEach((fo) => {
            const div = fo.querySelector('div')
            if (div) {
              const textWidth = div.scrollWidth
              const currentWidth = fo.getAttribute('width')
              if (currentWidth && textWidth > Number(currentWidth)) {
                const newWidth = textWidth + 20
                const widthDiff = newWidth - Number(currentWidth)
                fo.setAttribute('width', String(newWidth))
                // Also widen the parent rect
                const nodeGroup = fo.closest('.node')
                if (nodeGroup) {
                  const rect = nodeGroup.querySelector('rect')
                  if (rect) {
                    const rw = Number(rect.getAttribute('width') || 0)
                    rect.setAttribute('width', String(rw + widthDiff))
                    // Shift rect x to keep centered
                    const rx = Number(rect.getAttribute('x') || 0)
                    rect.setAttribute('x', String(rx - widthDiff / 2))
                  }
                }
              }
            }
          })
        })
      } catch (err) {
        setError((err as Error).message)
        setSvg('')
      }
    }
    render()
  }, [chart])

  if (error) {
    return (
      <div style={{
        background: 'rgba(239,68,68,0.06)',
        border: '1px solid rgba(239,68,68,0.15)',
        borderRadius: '0.5rem',
        padding: '0.75rem',
        margin: '1rem 0',
        fontSize: '0.7rem',
      }}>
        <div style={{ color: '#f87171', fontWeight: 600, marginBottom: '0.25rem' }}>Diagram error</div>
        <pre style={{ color: '#94a3b8', whiteSpace: 'pre-wrap', fontSize: '0.65rem' }}>{chart}</pre>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
