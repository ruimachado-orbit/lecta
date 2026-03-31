import { spawn, type ChildProcess } from 'child_process'
import type { ExecutionResult } from '../../../packages/shared/src/types/execution'
import { EXECUTION_TIMEOUT_MS } from '../../../packages/shared/src/constants'

export class NativeExecutor {
  private process: ChildProcess | null = null
  private stdoutCallback: ((data: string) => void) | null = null
  private stderrCallback: ((data: string) => void) | null = null
  private cancelled = false

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
      this.cancelled = false

      // Security: never use shell mode; only forward safe env vars (no API keys)
      const SAFE_ENV_KEYS = ['PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'TERM', 'TMPDIR', 'NODE_ENV', 'LC_ALL', 'LC_CTYPE']
      const safeEnv: Record<string, string> = {}
      for (const key of SAFE_ENV_KEYS) {
        if (process.env[key]) safeEnv[key] = process.env[key]!
      }

      this.process = spawn(command, args, {
        cwd,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: safeEnv,
        timeout
      })

      this.process.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        stdout += text
        this.stdoutCallback?.(text)
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        stderr += text
        this.stderrCallback?.(text)
      })

      this.process.on('close', (code) => {
        const duration = Date.now() - startTime

        let status: ExecutionResult['status'] = 'success'
        if (this.cancelled) {
          status = 'cancelled'
        } else if (duration >= timeout) {
          status = 'timeout'
        } else if (code !== 0) {
          status = 'error'
        }

        resolve({
          stdout,
          stderr,
          exitCode: code,
          duration,
          status
        })

        this.process = null
      })

      this.process.on('error', (error) => {
        const duration = Date.now() - startTime
        resolve({
          stdout,
          stderr: stderr + '\n' + error.message,
          exitCode: -1,
          duration,
          status: 'error'
        })
        this.process = null
      })

      // Timeout safety net
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGTERM')
          setTimeout(() => {
            if (this.process && !this.process.killed) {
              this.process.kill('SIGKILL')
            }
          }, 3000)
        }
      }, timeout)
    })
  }

  cancel(): void {
    this.cancelled = true
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM')
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL')
        }
      }, 2000)
    }
  }
}
