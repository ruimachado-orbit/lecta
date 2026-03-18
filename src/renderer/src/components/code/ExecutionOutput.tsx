import { useRef, useEffect } from 'react'
import { useExecutionStore } from '../../stores/execution-store'

export function ExecutionOutput(): JSX.Element {
  const { output, lastResult, isExecuting, error, clearOutput } = useExecutionStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom as output streams in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [output])

  const isEmpty = !output && !error && !lastResult

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Output header */}
      <div className="h-7 bg-gray-900 border-b border-gray-800 flex items-center px-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
          Output
        </span>
        {isExecuting && (
          <div className="ml-2 flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
            <span className="text-[10px] text-gray-300">Running</span>
          </div>
        )}
        {lastResult && !isExecuting && (
          <span
            className={`ml-2 text-[10px] ${
              lastResult.status === 'success' ? 'text-gray-300' : 'text-red-400'
            }`}
          >
            {lastResult.status} ({lastResult.duration}ms)
          </span>
        )}
        <div className="flex-1" />
        {!isEmpty && (
          <button onClick={clearOutput}
            className="p-0.5 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
            title="Clear output">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        )}
      </div>

      {/* Output content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-sm">
        {isEmpty ? (
          <div className="text-gray-600 text-xs">
            Click Run or press Cmd+Enter to execute code
          </div>
        ) : (
          <>
            {output && (
              <pre className="whitespace-pre-wrap text-gray-300 leading-relaxed">
                {output}
              </pre>
            )}
            {error && (
              <pre className="whitespace-pre-wrap text-red-400 leading-relaxed mt-1">
                {error}
              </pre>
            )}
            {lastResult?.stderr && (
              <pre className="whitespace-pre-wrap text-red-400 leading-relaxed mt-1">
                {lastResult.stderr}
              </pre>
            )}

            {/* Table output for SQL */}
            {lastResult?.tableOutput && (
              <div className="mt-2 overflow-x-auto">
                <table className="border-collapse text-xs">
                  <thead>
                    <tr>
                      {lastResult.tableOutput.columns.map((col, i) => (
                        <th
                          key={i}
                          className="bg-gray-800 border border-gray-700 px-3 py-1.5 text-left text-gray-300 font-medium"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lastResult.tableOutput.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className="border border-gray-700 px-3 py-1 text-gray-400"
                          >
                            {cell === null ? (
                              <span className="text-gray-600 italic">NULL</span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
