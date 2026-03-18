import { useRef, useEffect } from 'react'
import { useExecutionStore } from '../../stores/execution-store'

export function ExecutionOutput(): JSX.Element {
  const { output, lastResult, isExecuting, error } = useExecutionStore()
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
            <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
            <span className="text-[10px] text-amber-400">Running</span>
          </div>
        )}
        {lastResult && !isExecuting && (
          <span
            className={`ml-2 text-[10px] ${
              lastResult.status === 'success' ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {lastResult.status} ({lastResult.duration}ms)
          </span>
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
