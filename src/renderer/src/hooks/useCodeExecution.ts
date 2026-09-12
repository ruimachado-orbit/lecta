import { useCallback, useEffect } from 'react'
import { usePresentationStore } from '../stores/presentation-store'
import { useExecutionStore } from '../stores/execution-store'
import type { CodeBlockConfig } from '../../../../packages/shared/src/types/presentation'

/* -------------------------------------------------------------------------- */
/* Runtime status                                                              */
/* -------------------------------------------------------------------------- */

export type RuntimeId = 'javascript' | 'pyodide' | 'sqljs'
export type RuntimeState = 'idle' | 'loading' | 'ready' | 'error'

export interface RuntimeStatusEntry {
  id: RuntimeId
  label: string
  state: RuntimeState
  /** Human-readable reason, set when `state === 'error'`. */
  message?: string
}

export type RuntimeStatus = Record<RuntimeId, RuntimeStatusEntry>

const runtimeStatus: RuntimeStatus = {
  javascript: { id: 'javascript', label: 'JavaScript', state: 'idle' },
  pyodide: { id: 'pyodide', label: 'Python', state: 'idle' },
  sqljs: { id: 'sqljs', label: 'SQL', state: 'idle' }
}

const runtimeStatusListeners = new Set<(status: RuntimeStatus) => void>()

function setRuntimeStatus(id: RuntimeId, state: RuntimeState, message?: string): void {
  runtimeStatus[id] = { ...runtimeStatus[id], state, message }
  const snapshot = getRuntimeStatus()
  runtimeStatusListeners.forEach((listener) => {
    try {
      listener(snapshot)
    } catch {
      /* a bad listener must not break execution */
    }
  })
}

/** Snapshot of every embedded runtime's load state (no store dependency). */
export function getRuntimeStatus(): RuntimeStatus {
  return {
    javascript: { ...runtimeStatus.javascript },
    pyodide: { ...runtimeStatus.pyodide },
    sqljs: { ...runtimeStatus.sqljs }
  }
}

/** Subscribe to runtime load-state changes. Returns an unsubscribe function. */
export function subscribeRuntimeStatus(listener: (status: RuntimeStatus) => void): () => void {
  runtimeStatusListeners.add(listener)
  return () => {
    runtimeStatusListeners.delete(listener)
  }
}

/* -------------------------------------------------------------------------- */
/* Locally bundled runtime assets                                              */
/* -------------------------------------------------------------------------- */

/**
 * Directory URL of a bundled runtime, resolved against the renderer document so
 * it works under `file://` (packaged) and `http://localhost` (dev server).
 * The assets are emitted to `out/renderer/runtimes/*` by the `lecta-runtimes`
 * plugin in electron-vite.config.ts and served by its dev middleware.
 */
function runtimeDir(name: 'pyodide' | 'sqljs'): string {
  return new URL(`runtimes/${name}/`, document.baseURI).href
}

function missingRuntimeError(name: string, url: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause)
  return new Error(
    `${name} runtime is not available locally (expected at ${url}). ` +
      `Re-run the build so out/renderer/runtimes is regenerated. [${detail}]`
  )
}

/* --- Pyodide (Python) ----------------------------------------------------- */

let pyodideInstance: any = null
let pyodidePromise: Promise<any> | null = null

/** Loads (and caches) the bundled Pyodide runtime. Exported so the UI can warm it up and tests can drive it. */
export async function loadPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance
  if (pyodidePromise) return pyodidePromise

  const indexURL = runtimeDir('pyodide')
  const entry = `${indexURL}pyodide.mjs`

  setRuntimeStatus('pyodide', 'loading')
  pyodidePromise = (async () => {
    let mod: any
    try {
      mod = await import(/* @vite-ignore */ entry)
    } catch (err) {
      throw missingRuntimeError('Python (Pyodide)', entry, err)
    }
    // `indexURL` makes Pyodide resolve pyodide.asm.wasm / python_stdlib.zip
    // next to the module instead of falling back to the jsDelivr CDN.
    return mod.loadPyodide({ indexURL })
  })()

  try {
    pyodideInstance = await pyodidePromise
    setRuntimeStatus('pyodide', 'ready')
    return pyodideInstance
  } catch (err) {
    setRuntimeStatus('pyodide', 'error', err instanceof Error ? err.message : String(err))
    throw err
  } finally {
    pyodidePromise = null
  }
}

/* --- sql.js (SQL) --------------------------------------------------------- */

let sqlJsInstance: any = null
let sqlJsPromise: Promise<any> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`script did not load: ${src}`))
    document.head.appendChild(script)
  })
}

/** Loads (and caches) the bundled sql.js runtime. Exported so the UI can warm it up and tests can drive it. */
export async function loadSqlJs(): Promise<any> {
  if (sqlJsInstance) return sqlJsInstance
  if (sqlJsPromise) return sqlJsPromise

  const dir = runtimeDir('sqljs')
  const entry = `${dir}sql-wasm.js`

  setRuntimeStatus('sqljs', 'loading')
  sqlJsPromise = (async () => {
    // sql.js ships a UMD bundle that assigns window.initSqlJs.
    try {
      await loadScript(entry)
    } catch (err) {
      throw missingRuntimeError('SQL (sql.js)', entry, err)
    }

    const initSqlJs = (window as any).initSqlJs
    if (typeof initSqlJs !== 'function') {
      throw missingRuntimeError('SQL (sql.js)', entry, 'initSqlJs was not defined')
    }

    // Emscripten refuses to fetch its .wasm when the page is on file:// (its
    // isFileURI() guard) and then has no XHR fallback in a browser build, so
    // the packaged app aborts with "both async and sync fetching of the wasm
    // failed". fetch() itself works there, so hand sql.js the bytes directly.
    let wasmBinary: ArrayBuffer | undefined
    try {
      const res = await fetch(`${dir}sql-wasm.wasm`)
      if (res.ok) wasmBinary = await res.arrayBuffer()
    } catch {
      /* fall back to locateFile below */
    }

    return initSqlJs({ wasmBinary, locateFile: (file: string) => `${dir}${file}` })
  })()

  try {
    sqlJsInstance = await sqlJsPromise
    setRuntimeStatus('sqljs', 'ready')
    return sqlJsInstance
  } catch (err) {
    setRuntimeStatus('sqljs', 'error', err instanceof Error ? err.message : String(err))
    throw err
  } finally {
    sqlJsPromise = null
  }
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

/** Cancels the in-flight in-renderer run (JS worker), if any. */
let cancelActiveJsRun: (() => void) | null = null

const NATIVE_DISABLED_HINT = 'Enable native execution in Settings'

/** IPC rejections arrive as "Error invoking remote method 'x': Error: msg". */
function cleanIpcError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^Error:\s*/, '')
}

export function useCodeExecution() {
  const { appendOutput, setExecuting, setResult, setError, clearOutput } =
    useExecutionStore()
  const presentation = usePresentationStore((s) => s.presentation)

  // Listen for native execution streaming
  useEffect(() => {
    window.electronAPI.onExecutionOutput((data: string) => {
      appendOutput(data, 'stdout')
    })
    window.electronAPI.onExecutionError((data: string) => {
      appendOutput(data, 'stderr')
    })
    window.electronAPI.onExecutionDone((result: any) => {
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
            // For simple JS, we run in a sandboxed worker
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
            try {
              await window.electronAPI.executeNative(
                config.command || 'node',
                config.args || [config.file],
                presentation.rootPath
              )
            } catch (err) {
              // The main process refuses when native execution is disabled in
              // Settings or the command is not allowed — show its reason plus
              // the actionable hint.
              throw new Error(`${cleanIpcError(err)}\n${NATIVE_DISABLED_HINT}.`)
            }
            break

          default:
            setError('No execution engine configured for this slide')
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        appendOutput(errorMsg + '\n', 'stderr')
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
    cancelActiveJsRun?.()
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

const JS_TIMEOUT_MS = 30000

/**
 * Runs user JavaScript inside a Worker created from a `blob:` URL.
 *
 * A sandboxed iframe cannot be used: Chromium refuses to load a `blob:`
 * document (or a `blob:` script) into an opaque-origin frame — `sandbox`
 * without `allow-same-origin` — with "Not allowed to load local resource",
 * and `srcdoc` inherits the app CSP, which has no `'unsafe-inline'`.
 * `worker-src 'self' blob:` is already allowed, a worker has no DOM and no
 * handle on the parent window, and `terminate()` gives a hard timeout/cancel.
 *
 * Exported so the sandbox can be exercised directly by tests.
 */
export async function runJavaScript(
  code: string,
  onOutput: (text: string, stream: 'stdout' | 'stderr') => void
): Promise<void> {
  // Split so the user's code line numbers can be recovered from worker errors.
  const prologue = `
const __send = (type, data) => {
  try { self.postMessage({ __lecta: 1, type, data }) }
  catch (e) { self.postMessage({ __lecta: 1, type: 'error', data: '[value could not be sent to the output panel]' }) }
};
const __fmt = (v) => {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.stack || String(v);
  try { return typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v) }
  catch (e) { return String(v) }
};
const __join = (args) => Array.prototype.map.call(args, __fmt).join(' ');
const __log = function () { __send('console', __join(arguments)) };
self.console.log = __log;
self.console.info = __log;
self.console.debug = __log;
self.console.warn = __log;
self.console.dir = __log;
self.console.error = function () { __send('error', __join(arguments)) };
self.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  __send('error', (r && r.stack) || String(r));
});
Promise.resolve()
  .then(async () => {
`
  const epilogue = `
  })
  .then(() => __send('done'))
  .catch((err) => {
    __send('error', (err && err.stack) || String(err));
    __send('done');
  });
`
  // Lines of generated code that precede the user's first line.
  const prologueLines = prologue.split('\n').length - 1
  const workerSource = prologue + code + epilogue

  const blobUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))

  let worker: Worker
  try {
    worker = new Worker(blobUrl)
  } catch (err) {
    URL.revokeObjectURL(blobUrl)
    setRuntimeStatus('javascript', 'error', err instanceof Error ? err.message : String(err))
    throw new Error(
      `JavaScript sandbox could not start: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  setRuntimeStatus('javascript', 'ready')

  return new Promise<void>((resolve, reject) => {
    let settled = false

    const cleanup = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
      URL.revokeObjectURL(blobUrl)
      if (cancelActiveJsRun === cancel) cancelActiveJsRun = null
    }

    const finish = (): void => {
      cleanup()
      resolve()
    }

    const cancel = (): void => {
      if (settled) return
      onOutput('Execution cancelled.\n', 'stderr')
      finish()
    }

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Execution timed out (30s)'))
    }, JS_TIMEOUT_MS)

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || data.__lecta !== 1) return
      if (data.type === 'console') {
        onOutput(data.data + '\n', 'stdout')
      } else if (data.type === 'error') {
        onOutput(data.data + '\n', 'stderr')
      } else if (data.type === 'done') {
        finish()
      }
    }

    // Fires when the worker script itself fails to parse (a syntax error in
    // the user's code) — still resolve so the run completes.
    worker.onerror = (event: ErrorEvent) => {
      const line = event.lineno ? event.lineno - prologueLines : 0
      const where = line > 0 ? ` (line ${line})` : ''
      onOutput((event.message || 'Script error') + where + '\n', 'stderr')
      finish()
    }
    worker.onmessageerror = () => {
      onOutput('A value from your code could not be transferred to the output panel.\n', 'stderr')
    }

    cancelActiveJsRun = cancel
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
    try {
      // Bundled Pyodide packages resolve locally; anything else is fetched
      // from the Pyodide CDN the first time it is used.
      await pyodide.loadPackagesFromImports(code)
    } catch (err) {
      onOutput(`Warning: could not resolve imports offline (${String(err)})\n`, 'stderr')
    }
    for (const pkg of packages) {
      try {
        await pyodide.runPythonAsync(`import micropip; await micropip.install("${pkg}")`)
      } catch {
        // Try loading from pyodide packages
        try {
          await pyodide.loadPackage(pkg)
        } catch {
          onOutput(`Package ${pkg} needs internet on first use.\n`, 'stderr')
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
