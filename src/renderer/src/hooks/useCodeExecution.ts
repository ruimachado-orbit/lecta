import { useCallback, useEffect } from 'react'
import { usePresentationStore } from '../stores/presentation-store'
import { useExecutionStore } from '../stores/execution-store'
import type { CodeBlockConfig } from '../../../../packages/shared/src/types/presentation'

// Pyodide singleton (lazy loaded)
let pyodideInstance: any = null
let pyodideLoading = false

async function loadPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance
  if (pyodideLoading) {
    // Wait for the other load to finish
    while (pyodideLoading) {
      await new Promise((r) => setTimeout(r, 100))
    }
    return pyodideInstance
  }

  pyodideLoading = true
  try {
    // Dynamic import from CDN
    const { loadPyodide: load } = await import(
      /* @vite-ignore */ 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.mjs'
    )
    pyodideInstance = await load()
    return pyodideInstance
  } finally {
    pyodideLoading = false
  }
}

// sql.js singleton (lazy loaded)
let sqlJsInstance: any = null

async function loadSqlJs(): Promise<any> {
  if (sqlJsInstance) return sqlJsInstance

  // sql.js UMD script sets window.initSqlJs — dynamic import().default doesn't work reliably
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/sql.js@1.12.0/dist/sql-wasm.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load sql.js'))
    document.head.appendChild(script)
  })

  const initSqlJs = (window as any).initSqlJs
  if (typeof initSqlJs !== 'function') {
    throw new Error('sql.js failed to initialize — initSqlJs not found on window')
  }

  sqlJsInstance = await initSqlJs({
    locateFile: (file: string) =>
      `https://cdn.jsdelivr.net/npm/sql.js@1.12.0/dist/${file}`
  })

  return sqlJsInstance
}

export function useCodeExecution() {
  const { appendOutput, setExecuting, setResult, setError, clearOutput } =
    useExecutionStore()
  const presentation = usePresentationStore((s) => s.presentation)

  // Listen for native execution streaming
  useEffect(() => {
    window.electronAPI.onExecutionOutput((data) => {
      appendOutput(data, 'stdout')
    })
    window.electronAPI.onExecutionError((data) => {
      appendOutput(data, 'stderr')
    })
    window.electronAPI.onExecutionDone((result) => {
      setResult(result)
    })

    return () => {
      window.electronAPI.removeAllListeners('exec:output')
      window.electronAPI.removeAllListeners('exec:error')
      window.electronAPI.removeAllListeners('exec:done')
    }
  }, [appendOutput, setResult])

  const runCode = useCallback(
    async (code: string, config: CodeBlockConfig) => {
      clearOutput()
      setExecuting(true)

      const startTime = Date.now()

      try {
        switch (config.execution) {
          case 'sandpack':
            // Sandpack handles its own execution in-component
            // For simple JS, we can eval in a sandboxed iframe
            await runJavaScript(code, appendOutput)
            setResult({
              stdout: '',
              stderr: '',
              exitCode: 0,
              duration: Date.now() - startTime,
              status: 'success'
            })
            break

          case 'pyodide':
            await runPython(code, config.packages, appendOutput)
            setResult({
              stdout: '',
              stderr: '',
              exitCode: 0,
              duration: Date.now() - startTime,
              status: 'success'
            })
            break

          case 'sql':
            const tableOutput = await runSql(code, config.seedData, appendOutput, presentation?.rootPath)
            setResult({
              stdout: '',
              stderr: '',
              exitCode: 0,
              duration: Date.now() - startTime,
              status: 'success',
              tableOutput
            })
            break

          case 'native':
            if (!presentation) throw new Error('No presentation loaded')
            // Native execution is handled via IPC streaming
            await window.electronAPI.executeNative(
              config.command || 'node',
              config.args || [config.file],
              presentation.rootPath
            )
            break

          default:
            setError('No execution engine configured for this slide')
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        appendOutput(errorMsg, 'stderr')
        setResult({
          stdout: '',
          stderr: errorMsg,
          exitCode: 1,
          duration: Date.now() - startTime,
          status: 'error'
        })
      }
    },
    [presentation, appendOutput, setExecuting, setResult, setError, clearOutput]
  )

  const cancelCode = useCallback(async () => {
    await window.electronAPI.cancelExecution()
    setExecuting(false)
  }, [setExecuting])

  // Cmd+Enter shortcut to run code
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        const { slides, currentSlideIndex } = usePresentationStore.getState()
        const slide = slides[currentSlideIndex]
        if (slide?.codeContent && slide.config.code) {
          runCode(slide.codeContent, slide.config.code)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [runCode])

  return { runCode, cancelCode }
}

// --- Execution Engine Implementations ---

async function runJavaScript(
  code: string,
  onOutput: (text: string, stream: 'stdout' | 'stderr') => void
): Promise<void> {
  // Create a sandboxed iframe for safe JS execution
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  iframe.sandbox.add('allow-scripts')
  document.body.appendChild(iframe)

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      document.body.removeChild(iframe)
      reject(new Error('Execution timed out (30s)'))
    }, 30000)

    // Listen for messages from the iframe
    const handler = (event: MessageEvent) => {
      if (event.source === iframe.contentWindow) {
        const { type, data } = event.data
        if (type === 'console') {
          onOutput(data + '\n', 'stdout')
        } else if (type === 'error') {
          onOutput(data + '\n', 'stderr')
        } else if (type === 'done') {
          clearTimeout(timeout)
          window.removeEventListener('message', handler)
          document.body.removeChild(iframe)
          resolve()
        }
      }
    }

    window.addEventListener('message', handler)

    // Inject the code into the iframe
    const wrappedCode = `
      <script>
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        console.log = (...args) => {
          parent.postMessage({ type: 'console', data: args.map(a =>
            typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
          ).join(' ') }, '*');
        };
        console.error = (...args) => {
          parent.postMessage({ type: 'error', data: args.map(a => String(a)).join(' ') }, '*');
        };
        console.warn = console.log;

        try {
          ${code}
          parent.postMessage({ type: 'done' }, '*');
        } catch (e) {
          parent.postMessage({ type: 'error', data: e.message }, '*');
          parent.postMessage({ type: 'done' }, '*');
        }
      </script>
    `
    iframe.srcdoc = wrappedCode
  })
}

async function runPython(
  code: string,
  packages: string[] | undefined,
  onOutput: (text: string, stream: 'stdout' | 'stderr') => void
): Promise<void> {
  onOutput('Loading Python runtime...\n', 'stdout')
  const pyodide = await loadPyodide()

  // Install packages if needed
  if (packages && packages.length > 0) {
    onOutput(`Installing packages: ${packages.join(', ')}...\n`, 'stdout')
    await pyodide.loadPackagesFromImports(code)
    for (const pkg of packages) {
      try {
        await pyodide.runPythonAsync(`import micropip; await micropip.install("${pkg}")`)
      } catch {
        // Try loading from pyodide packages
        try {
          await pyodide.loadPackage(pkg)
        } catch (e) {
          onOutput(`Warning: Could not install ${pkg}\n`, 'stderr')
        }
      }
    }
  }

  // Redirect stdout/stderr
  pyodide.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
  `)

  try {
    await pyodide.runPythonAsync(code)

    const stdout = pyodide.runPython('sys.stdout.getvalue()')
    const stderr = pyodide.runPython('sys.stderr.getvalue()')

    if (stdout) onOutput(stdout, 'stdout')
    if (stderr) onOutput(stderr, 'stderr')
  } catch (err) {
    // Capture any partial output before reporting error
    try {
      const partialOut = pyodide.runPython('sys.stdout.getvalue()')
      if (partialOut) onOutput(partialOut, 'stdout')
    } catch { /* ignore */ }
    onOutput(String(err) + '\n', 'stderr')
  } finally {
    // Always reset stdout/stderr to prevent state pollution
    pyodide.runPython(`
import sys
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
    `)
  }
}

async function runSql(
  code: string,
  seedDataPath: string | undefined,
  onOutput: (text: string, stream: 'stdout' | 'stderr') => void,
  rootPath?: string
): Promise<{ columns: string[]; rows: (string | number | null)[][] } | undefined> {
  onOutput('Loading SQL engine...\n', 'stdout')

  const SQL = await loadSqlJs()
  const db = new SQL.Database()

  try {
    // Run seed data if provided
    if (seedDataPath && rootPath) {
      const seedPath = `${rootPath}/${seedDataPath}`
      const seedSql = await window.electronAPI.readFile(seedPath)
      db.run(seedSql)
      onOutput('Seed data loaded.\n', 'stdout')
    }

    // Execute the query
    const results = db.exec(code)

    if (results.length === 0) {
      onOutput('Query executed successfully. No results returned.\n', 'stdout')
      return undefined
    }

    const result = results[0]
    onOutput(`${result.values.length} row(s) returned.\n`, 'stdout')

    return {
      columns: result.columns,
      rows: result.values
    }
  } finally {
    db.close()
  }
}
