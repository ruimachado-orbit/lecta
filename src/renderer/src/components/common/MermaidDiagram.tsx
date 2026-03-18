import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

let mermaidInitialized = false

function initMermaid() {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      primaryColor: '#ffffff',
      primaryTextColor: '#e5e5e5',
      primaryBorderColor: '#a3a3a3',
      lineColor: '#525252',
      secondaryColor: '#171717',
      tertiaryColor: '#262626',
      background: '#0a0a0a',
      mainBkg: '#171717',
      nodeBorder: '#a3a3a3',
      clusterBkg: '#171717',
      clusterBorder: '#262626',
      titleColor: '#e5e5e5',
      edgeLabelBackground: '#171717',
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
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 my-4 text-xs">
        <div className="text-red-400 font-medium mb-1">Mermaid diagram error</div>
        <pre className="text-gray-300 whitespace-pre-wrap">{error}</pre>
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
