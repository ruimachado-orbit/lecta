import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

let mermaidInitialized = false

function initMermaid() {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      primaryColor: '#6366f1',
      primaryTextColor: '#e2e8f0',
      primaryBorderColor: '#818cf8',
      lineColor: '#475569',
      secondaryColor: '#1e293b',
      tertiaryColor: '#334155',
      background: '#0f172a',
      mainBkg: '#1e293b',
      nodeBorder: '#818cf8',
      clusterBkg: '#1e293b',
      clusterBorder: '#334155',
      titleColor: '#e2e8f0',
      edgeLabelBackground: '#1e293b',
      fontSize: '14px'
    },
    flowchart: { htmlLabels: true, curve: 'basis' },
    sequence: { actorMargin: 50 }
  })
  mermaidInitialized = true
}

interface MermaidDiagramProps {
  chart: string
}

export function MermaidDiagram({ chart }: MermaidDiagramProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initMermaid()

    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    async function render() {
      try {
        const { svg: rendered } = await mermaid.render(id, chart.trim())
        setSvg(rendered)
        setError(null)
      } catch (err) {
        setError((err as Error).message)
        setSvg('')
      }
    }

    render()
  }, [chart])

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 my-4 text-xs">
        <div className="text-red-400 font-medium mb-1">Mermaid diagram error</div>
        <pre className="text-red-300 whitespace-pre-wrap">{error}</pre>
        <pre className="text-gray-500 mt-2 whitespace-pre-wrap text-[10px]">{chart}</pre>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="my-4 flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
