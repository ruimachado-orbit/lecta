import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import type { ArtifactConfig } from '../../../../../packages/shared/src/types/presentation'

interface ArtifactViewerProps {
  artifact: ArtifactConfig
  fullPath: string
  onClose: () => void
}

export function ArtifactViewer({ artifact, fullPath, onClose }: ArtifactViewerProps): JSX.Element {
  const [content, setContent] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isPdf = fullPath.match(/\.pdf$/i)
  const isImage = fullPath.match(/\.(png|jpe?g|gif|svg|webp)$/i)
  const isExcel = fullPath.match(/\.xlsx?$/i) || fullPath.match(/\.csv$/i)
  const isText = fullPath.match(/\.(txt|md|json|yaml|yml)$/i)
  const isNotebook = fullPath.match(/\.ipynb$/i)

  useEffect(() => {
    async function load() {
      try {
        if (isImage) {
          const buffer = await window.electronAPI.readArtifactAsBuffer(fullPath)
          const ext = fullPath.split('.').pop()?.toLowerCase()
          const mimeMap: Record<string, string> = {
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp'
          }
          const blob = new Blob([buffer], { type: mimeMap[ext || ''] || 'image/png' })
          setImageUrl(URL.createObjectURL(blob))
        } else if (isNotebook || isText || isExcel) {
          const text = await window.electronAPI.readFile(fullPath)
          setContent(text)
        }
      } catch (err) {
        setError((err as Error).message)
      }
    }
    load()

    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [fullPath])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-[80vw] max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-gray-200 font-medium">{artifact.label}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.electronAPI.openInSystemApp(fullPath)}
              className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
            >
              Open in App
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="text-red-400 text-sm">{error}</div>
          )}

          {isImage && imageUrl && (
            <div className="flex items-center justify-center h-full">
              <img src={imageUrl} alt={artifact.label} className="max-w-full max-h-full object-contain rounded" />
            </div>
          )}

          {isPdf && (
            <div className="text-center text-gray-400 py-8">
              <p className="mb-4">PDF preview</p>
              <button
                onClick={() => window.electronAPI.openInSystemApp(fullPath)}
                className="px-4 py-2 bg-white hover:bg-gray-200 text-black rounded-lg transition-colors"
              >
                Open PDF in System Viewer
              </button>
            </div>
          )}

          {isNotebook && content && (
            <NotebookPreview content={content} />
          )}

          {(isText || isExcel) && content && !isNotebook && (
            <pre className="text-gray-300 text-sm font-mono whitespace-pre-wrap bg-gray-950 rounded-lg p-4">
              {content}
            </pre>
          )}

          {!isImage && !isPdf && !isText && !isExcel && !isNotebook && (
            <div className="text-center text-gray-400 py-8">
              <p className="mb-4">Cannot preview this file type</p>
              <button
                onClick={() => window.electronAPI.openInSystemApp(fullPath)}
                className="px-4 py-2 bg-white hover:bg-gray-200 text-black rounded-lg transition-colors"
              >
                Open in System App
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Render a .ipynb file as a Jupyter-style preview */
function NotebookPreview({ content }: { content: string }): JSX.Element {
  let cells: any[] = []
  let kernelLang = 'python'
  try {
    const nb = JSON.parse(content)
    cells = nb.cells ?? []
    kernelLang = nb.metadata?.kernelspec?.language ?? nb.metadata?.language_info?.name ?? 'python'
  } catch {
    return <pre className="text-red-400 text-sm">Failed to parse notebook JSON</pre>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">
        Kernel: {kernelLang} &middot; {cells.length} cells
      </div>
      {cells.map((cell: any, i: number) => {
        const source = Array.isArray(cell.source) ? cell.source.join('') : (cell.source ?? '')
        const cellType = cell.cell_type

        if (cellType === 'markdown') {
          return (
            <div key={i} className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  h1: ({ children }) => <h1 className="text-xl font-bold text-white mb-1">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-bold text-white mb-1">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-semibold text-white mb-1">{children}</h3>,
                  p: ({ children }) => <p className="text-sm text-gray-300 leading-relaxed my-1">{children}</p>,
                  ul: ({ children }) => <ul className="text-sm text-gray-300 list-disc pl-5 my-1">{children}</ul>,
                  ol: ({ children }) => <ol className="text-sm text-gray-300 list-decimal pl-5 my-1">{children}</ol>,
                  strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
                  code: ({ children }) => <code className="bg-gray-800 text-gray-200 px-1 rounded text-xs font-mono">{children}</code>,
                  table: ({ children }) => <table className="text-xs border-collapse my-2 w-full">{children}</table>,
                  th: ({ children }) => <th className="border border-gray-700 bg-gray-900 px-2 py-1 text-left text-gray-300 font-semibold">{children}</th>,
                  td: ({ children }) => <td className="border border-gray-700 px-2 py-1 text-gray-400">{children}</td>,
                }}
              >
                {source}
              </ReactMarkdown>
            </div>
          )
        }

        if (cellType === 'code') {
          const outputs = cell.outputs ?? []
          return (
            <div key={i} className="rounded-lg border border-gray-800 bg-gray-950">
              <div className="px-3 py-1 border-b border-gray-800 flex items-center gap-2">
                <span className="text-[9px] font-bold text-green-400 bg-green-900/40 px-1.5 py-0.5 rounded">{kernelLang.toUpperCase()}</span>
                <span className="text-[9px] text-gray-600">[{i + 1}]</span>
              </div>
              <div className="[&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-3 [&_pre]:text-xs [&_code]:text-xs [&_code]:!bg-transparent overflow-x-auto">
                <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{'```' + kernelLang + '\n' + source + '\n```'}</ReactMarkdown>
              </div>
              {outputs.length > 0 && (
                <div className="border-t border-gray-800 px-4 py-2">
                  {outputs.map((out: any, oi: number) => {
                    if (out.output_type === 'stream') {
                      const text = Array.isArray(out.text) ? out.text.join('') : (out.text ?? '')
                      return <pre key={oi} className="text-xs text-gray-400 whitespace-pre-wrap">{text}</pre>
                    }
                    if (out.output_type === 'execute_result' || out.output_type === 'display_data') {
                      const plain = out.data?.['text/plain']
                      const text = Array.isArray(plain) ? plain.join('') : (plain ?? '')
                      return <pre key={oi} className="text-xs text-gray-400 whitespace-pre-wrap">{text}</pre>
                    }
                    if (out.output_type === 'error') {
                      return <pre key={oi} className="text-xs text-red-400 whitespace-pre-wrap">{out.evalue ?? 'Error'}</pre>
                    }
                    return null
                  })}
                </div>
              )}
            </div>
          )
        }

        // Raw cell
        return (
          <div key={i} className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
            <pre className="text-xs text-gray-400 whitespace-pre-wrap">{source}</pre>
          </div>
        )
      })}
    </div>
  )
}
