import { spawn, type ChildProcess } from 'child_process'
import type { ExecutionResult } from '../../../packages/shared/src/types/execution'
import { EXECUTION_TIMEOUT_MS } from '../../../packages/shared/src/constants'

/** Grace period between SIGTERM and SIGKILL. */
const KILL_GRACE_MS = 1000
/** Maximum accumulated stdout + stderr before the process is killed. */
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
/** Output chunks are coalesced and flushed to callbacks on this interval. */
const FLUSH_INTERVAL_MS = 40
const TRUNCATED_MARKER = '\n[output truncated]\n'

/** Kill `child` and its whole process tree/group. */
function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid
  if (!pid) return
  if (process.platform === 'win32') {
    if (signal === 'SIGKILL') {
      try {
        spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true }).on('error', () => {})
      } catch {
        /* ignore */
      }
    } else {
      try { child.kill() } catch { /* ignore */ }
    }
    return
  }
  // POSIX: child was spawned detached, so it leads its own process group
  try {
    process.kill(-pid, signal)
  } catch {
    try { child.kill(signal) } catch { /* ignore */ }
  }
}

export class NativeExecutor {
  private process: ChildProcess | null = null
  private stdoutCallback: ((data: string) => void) | null = null
  private stderrCallback: ((data: string) => void) | null = null
  private cancelled = false
  private exited = false
  private killTimer: NodeJS.Timeout | null = null

  onStdout(callback: (data: string) => void): void {
    this.stdoutCallback = callback
  }

  onStderr(callback: (data: string) => void): void {
    this.stderrCallback = callback
  }

  async execute(
    command: string,
    args: string[],
    cwd: string,
    timeout: number = EXECUTION_TIMEOUT_MS
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const startTime = Date.now()
      let stdout = ''
      let stderr = ''
      let outputBytes = 0
      let truncated = false
      let timedOut = false
      let settled = false
      let pendingStdout = ''
      let pendingStderr = ''
      let flushTimer: NodeJS.Timeout | null = null
      let timeoutTimer: NodeJS.Timeout | null = null
      this.cancelled = false
      this.exited = false

      // Security: never use shell mode; only forward safe env vars (no API keys)
      const SAFE_ENV_KEYS = ['PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'TERM', 'TMPDIR', 'NODE_ENV', 'LC_ALL', 'LC_CTYPE']
      const safeEnv: Record<string, string> = {}
      for (const key of SAFE_ENV_KEYS) {
        if (process.env[key]) safeEnv[key] = process.env[key]!
      }

      const flush = (): void => {
        if (flushTimer) {
          clearTimeout(flushTimer)
          flushTimer = null
        }
        if (pendingStdout) {
          const out = pendingStdout
          pendingStdout = ''
          this.stdoutCallback?.(out)
        }
        if (pendingStderr) {
          const err = pendingStderr
          pendingStderr = ''
          this.stderrCallback?.(err)
        }
      }

      const scheduleFlush = (): void => {
        if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS)
      }

      const clearTimers = (): void => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer)
          timeoutTimer = null
        }
        if (this.killTimer) {
          clearTimeout(this.killTimer)
          this.killTimer = null
        }
        if (flushTimer) {
          clearTimeout(flushTimer)
          flushTimer = null
        }
      }

      const finish = (result: ExecutionResult): void => {
        if (settled) return
        settled = true
        flush()
        clearTimers()
        this.process = null
        resolve(result)
      }

      const onChunk = (stream: 'stdout' | 'stderr', data: Buffer): void => {
        if (truncated) return
        let text = data.toString()
        const remaining = MAX_OUTPUT_BYTES - outputBytes
        if (data.length > remaining) {
          text = data.subarray(0, Math.max(0, remaining)).toString()
          truncated = true
        }
        outputBytes += data.length
        if (stream === 'stdout') {
          stdout += text
          pendingStdout += text
        } else {
          stderr += text
          pendingStderr += text
        }
        if (truncated) {
          stderr += TRUNCATED_MARKER
          pendingStderr += TRUNCATED_MARKER
          this.terminate()
        }
        scheduleFlush()
      }

      let child: ChildProcess
      try {
        child = spawn(command, args, {
          cwd,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: safeEnv,
          detached: process.platform !== 'win32',
          windowsHide: true
        })
      } catch (error) {
        finish({
          stdout,
          stderr: stderr + '\n' + (error as Error).message,
          exitCode: -1,
          duration: Date.now() - startTime,
          status: 'error'
        })
        return
      }
      this.process = child

      child.stdout?.on('data', (data: Buffer) => onChunk('stdout', data))
      child.stderr?.on('data', (data: Buffer) => onChunk('stderr', data))

      child.on('exit', () => {
        this.exited = true
        if (this.killTimer) {
          clearTimeout(this.killTimer)
          this.killTimer = null
        }
      })

      child.on('close', (code) => {
        this.exited = true
        const duration = Date.now() - startTime

        let status: ExecutionResult['status'] = 'success'
        if (this.cancelled) {
          status = 'cancelled'
        } else if (timedOut) {
          status = 'timeout'
        } else if (truncated || code !== 0) {
          status = 'error'
        }

        finish({ stdout, stderr, exitCode: code, duration, status })
      })

      child.on('error', (error) => {
        this.exited = true
        finish({
          stdout,
          stderr: stderr + '\n' + error.message,
          exitCode: -1,
          duration: Date.now() - startTime,
          status: 'error'
        })
      })

      timeoutTimer = setTimeout(() => {
        timeoutTimer = null
        if (this.exited) return
        timedOut = true
        this.terminate()
      }, timeout)
    })
  }

  /** SIGTERM the process group, escalate to SIGKILL if it has not exited after the grace period. */
  private terminate(): void {
    const child = this.process
    if (!child || this.exited) return
    killTree(child, 'SIGTERM')
    if (this.killTimer) return
    this.killTimer = setTimeout(() => {
      this.killTimer = null
      if (this.process === child && !this.exited) {
        killTree(child, 'SIGKILL')
      }
    }, KILL_GRACE_MS)
  }

  cancel(): void {
    this.cancelled = true
    this.terminate()
  }
}
