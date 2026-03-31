import React from 'react'
import type { CellOutput } from '../../../../../packages/shared/src/types/notebook'
import { sanitizeHtml } from '../../utils/sanitize'

interface CellOutputRendererProps {
  outputs: CellOutput[]
  rootPath?: string
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

function renderSingleOutput(output: CellOutput, rootPath: string | undefined, index: number) {
  const { outputType, text, html, imageData, traceback } = output

  // --- stream ---
  if (outputType === 'stream') {
    return (
      <pre
        key={index}
        className="m-0 whitespace-pre-wrap break-words rounded bg-gray-900 px-3 py-2 text-xs leading-relaxed text-gray-300"
      >
        {text}
      </pre>
    )
  }

  // --- error ---
  if (outputType === 'error') {
    return (
      <div
        key={index}
        className="rounded bg-red-950/60 px-3 py-2 text-xs"
      >
        {text && (
          <div className="mb-1 font-semibold text-red-400">{stripAnsi(text)}</div>
        )}
        {traceback && traceback.length > 0 && (
          <pre className="m-0 whitespace-pre-wrap break-words text-xs leading-relaxed text-red-300">
            {traceback.map((line) => stripAnsi(line)).join('\n')}
          </pre>
        )}
      </div>
    )
  }

  // --- execute_result / display_data ---
  if (outputType === 'execute_result' || outputType === 'display_data') {
    // HTML content (tables, DataFrames, etc.)
    if (html) {
      return (
        <div
          key={index}
          className="cell-output-html overflow-x-auto rounded bg-gray-950 px-3 py-2 text-xs text-gray-200 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-700 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-700 [&_th]:bg-gray-900 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
        />
      )
    }

    // Image from artifact path
    if (imageData && imageData.startsWith('artifacts/')) {
      const src = rootPath ? `lecta-file://${rootPath}/${imageData}` : imageData
      return (
        <div key={index} className="rounded bg-gray-950 px-3 py-2">
          <img src={src} alt="Cell output" className="max-w-full rounded" />
        </div>
      )
    }

    // Base64 image
    if (imageData) {
      return (
        <div key={index} className="rounded bg-gray-950 px-3 py-2">
          <img
            src={`data:image/png;base64,${imageData}`}
            alt="Cell output"
            className="max-w-full rounded"
          />
        </div>
      )
    }

    // Plain text fallback
    if (text) {
      return (
        <pre
          key={index}
          className="m-0 whitespace-pre-wrap break-words rounded bg-gray-900 px-3 py-2 text-xs leading-relaxed text-gray-300"
        >
          {text}
        </pre>
      )
    }
  }

  return null
}

export function CellOutputRenderer({ outputs, rootPath }: CellOutputRendererProps) {
  if (!outputs || outputs.length === 0) return null

  return (
    <div className="max-h-96 overflow-y-auto border-l-2 border-blue-500 pl-3">
      <div className="flex flex-col gap-1.5">
        {outputs.map((output, i) => renderSingleOutput(output, rootPath, i))}
      </div>
    </div>
  )
}
