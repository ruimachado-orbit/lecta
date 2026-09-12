/**
 * Lets the chat surface run the current slide's code through exactly the path the
 * Run button uses.
 *
 * `useCodeExecution()` owns the runtimes (Pyodide, sql.js, the JS worker and the
 * gated `exec:native` IPC) and lives in a component, so the chat cannot call it
 * directly — mounting a second copy would double-register the `exec:*` listeners
 * and duplicate native output. Instead the toolbar that already holds the hook
 * registers its `runCode` here, and the chat asks for a run through
 * `requestCodeRun()`. The request survives the code pane being closed: it is
 * parked until a runner registers (opening the pane mounts one).
 */
import type { CodeBlockConfig } from '../../../../../packages/shared/src/types/presentation'
import { useExecutionStore } from '../../stores/execution-store'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'

export type CodeRunner = (code: string, config: CodeBlockConfig) => void | Promise<void>

/** A finished run, as the chat and the agent see it. */
export interface CodeRunOutcome {
  slideIndex: number
  language: string
  status: 'success' | 'error' | 'timeout' | 'cancelled'
  output: string
  exitCode: number | null
  durationMs: number
}

/** How long a single run may take before the chat stops waiting for it. */
const RUN_TIMEOUT_MS = 120_000

/** Output kept per run — enough for a model to read, small enough for a prompt. */
const MAX_OUTPUT_CHARS = 8_000

let activeRunner: CodeRunner | null = null
/** A run asked for while no runner was mounted; consumed as soon as one is. */
let parkedRun: (() => void) | null = null

/**
 * Publish the component-owned `runCode`. Call from an effect and invoke the
 * returned function on unmount.
 */
export function registerCodeRunner(runner: CodeRunner): () => void {
  activeRunner = runner
  const parked = parkedRun
  parkedRun = null
  if (parked) parked()
  return () => {
    if (activeRunner === runner) activeRunner = null
  }
}

function truncate(text: string): string {
  return text.length > MAX_OUTPUT_CHARS
    ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (output truncated)`
    : text
}

/** Resolves when the execution store leaves the running state. */
function waitForRun(): Promise<void> {
  return new Promise((resolve, reject) => {
    let started = useExecutionStore.getState().isExecuting
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error('The run did not finish within 2 minutes.'))
    }, RUN_TIMEOUT_MS)

    const finish = (): void => {
      clearTimeout(timer)
      unsubscribe()
      resolve()
    }

    const unsubscribe = useExecutionStore.subscribe((state) => {
      if (state.isExecuting) {
        started = true
        return
      }
      if (started) finish()
    })
  })
}

function outcomeFromStore(slideIndex: number, language: string): CodeRunOutcome {
  const { output, lastResult, error } = useExecutionStore.getState()
  const parts = [output, lastResult?.stdout, lastResult?.stderr, error]
    .filter((p): p is string => !!p && p.length > 0)
  return {
    slideIndex,
    language,
    status: error ? 'error' : lastResult?.status ?? 'success',
    output: truncate(parts.join('\n').trim()) || '(no output)',
    exitCode: lastResult?.exitCode ?? null,
    durationMs: lastResult?.duration ?? 0
  }
}

/**
 * Run the current slide's code and resolve with its output.
 * Rejects with a user-readable message when there is nothing to run.
 */
export async function requestCodeRun(): Promise<CodeRunOutcome> {
  const { slides, currentSlideIndex } = usePresentationStore.getState()
  const slide = slides[currentSlideIndex]
  const config = slide?.config.code
  const code = slide?.codeContent

  if (!slide || !config || code === null || code === undefined) {
    throw new Error('This slide has no code to run.')
  }
  if (config.execution === 'none') {
    throw new Error(`The code on this slide is not executable (execution: ${config.execution}).`)
  }
  if (useExecutionStore.getState().isExecuting) {
    throw new Error('Code is already running on this slide — stop it first.')
  }

  // Show the output the user is about to get: the code pane also mounts the
  // toolbar that owns the runner, so this is what un-parks the request.
  useUIStore.getState().setPendingArtifactOpen('code')
  useUIStore.setState({ showRightPane: true })

  const done = waitForRun()
  const start = (): void => {
    void activeRunner?.(code, config)
  }
  if (activeRunner) start()
  else parkedRun = start

  try {
    await done
  } finally {
    parkedRun = null
  }
  return outcomeFromStore(currentSlideIndex, config.language)
}

/**
 * The most recent run visible in the app — whether it was started from the chat,
 * the Run button or Cmd+Enter. Read straight from the execution store so nothing
 * has to be mirrored.
 */
export function getLastExecution(): (CodeRunOutcome & { isExecuting: boolean }) | undefined {
  const { output, lastResult, isExecuting, error } = useExecutionStore.getState()
  if (!output && !lastResult && !error) return undefined
  const { slides, currentSlideIndex } = usePresentationStore.getState()
  const language = slides[currentSlideIndex]?.config.code?.language ?? 'unknown'
  return { ...outcomeFromStore(currentSlideIndex, language), isExecuting }
}

/** One-line summary for a chat bubble or a tool result. */
export function formatRunOutcome(outcome: CodeRunOutcome): string {
  const exit = outcome.exitCode === null ? '' : `, exit ${outcome.exitCode}`
  return `Ran slide ${outcome.slideIndex + 1} (${outcome.language}) — ${outcome.status}${exit}, ${outcome.durationMs}ms\n\n\`\`\`\n${outcome.output}\n\`\`\``
}
