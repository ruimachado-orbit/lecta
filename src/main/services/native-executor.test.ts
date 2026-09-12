import { describe, it, expect } from 'vitest'
import { NativeExecutor, MAX_OUTPUT_BYTES } from './native-executor'

describe('NativeExecutor', () => {
  it('executes a simple command and captures stdout', async () => {
    const executor = new NativeExecutor()
    const result = await executor.execute('echo', ['hello world'], process.cwd())
    expect(result.status).toBe('success')
    expect(result.stdout.trim()).toBe('hello world')
    expect(result.exitCode).toBe(0)
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  it('captures stderr from a failing command', async () => {
    const executor = new NativeExecutor()
    const result = await executor.execute('node', ['-e', 'process.exit(1)'], process.cwd())
    expect(result.status).toBe('error')
    expect(result.exitCode).toBe(1)
  })

  it('reports error status for non-zero exit code', async () => {
    const executor = new NativeExecutor()
    const result = await executor.execute('node', ['-e', 'process.exit(42)'], process.cwd())
    expect(result.status).toBe('error')
    expect(result.exitCode).toBe(42)
  })

  it('streams stdout via callback', async () => {
    const executor = new NativeExecutor()
    const chunks: string[] = []
    executor.onStdout((data) => chunks.push(data))
    await executor.execute('echo', ['streamed output'], process.cwd())
    expect(chunks.join('')).toContain('streamed output')
  })

  it('streams stderr via callback', async () => {
    const executor = new NativeExecutor()
    const chunks: string[] = []
    executor.onStderr((data) => chunks.push(data))
    await executor.execute('node', ['-e', 'console.error("err msg")'], process.cwd())
    expect(chunks.join('')).toContain('err msg')
  })

  it('handles command not found', async () => {
    const executor = new NativeExecutor()
    const result = await executor.execute('nonexistent_command_xyz', [], process.cwd())
    expect(result.status).toBe('error')
    expect(result.exitCode).toBe(-1)
  })

  it('can cancel a running process', async () => {
    const executor = new NativeExecutor()
    const promise = executor.execute('sleep', ['10'], process.cwd(), 30000)
    // Give it a moment to start
    await new Promise(r => setTimeout(r, 100))
    executor.cancel()
    const result = await promise
    expect(result.status).toBe('cancelled')
  })

  it('handles timeout', async () => {
    const executor = new NativeExecutor()
    const result = await executor.execute('sleep', ['10'], process.cwd(), 500)
    // Should be killed before completing
    expect(result.status).toBe('timeout')
    expect(result.duration).toBeLessThan(3000)
  })

  it('escalates to SIGKILL when the child ignores SIGTERM (timeout)', async () => {
    const executor = new NativeExecutor()
    const start = Date.now()
    const result = await executor.execute('bash', ['-c', "trap '' TERM; sleep 30"], process.cwd(), 300)
    expect(result.status).toBe('timeout')
    expect(Date.now() - start).toBeLessThan(3000)
  })

  it('escalates to SIGKILL when the child ignores SIGTERM (cancel)', async () => {
    const executor = new NativeExecutor()
    const promise = executor.execute('bash', ['-c', "trap '' TERM; sleep 30"], process.cwd(), 30000)
    await new Promise((r) => setTimeout(r, 100))
    const start = Date.now()
    executor.cancel()
    const result = await promise
    expect(result.status).toBe('cancelled')
    expect(Date.now() - start).toBeLessThan(3000)
  })

  it('caps accumulated output and kills the process', async () => {
    const executor = new NativeExecutor()
    const chunks: string[] = []
    executor.onStdout((data) => chunks.push(data))
    const result = await executor.execute(
      'node',
      ['-e', "const s='x'.repeat(262144); setInterval(() => process.stdout.write(s), 1)"],
      process.cwd(),
      10000
    )
    expect(result.status).toBe('error')
    expect(result.stderr).toContain('[output truncated]')
    expect(result.stdout.length).toBeLessThanOrEqual(MAX_OUTPUT_BYTES)
    expect(chunks.join('').length).toBeLessThanOrEqual(MAX_OUTPUT_BYTES)
    expect(result.duration).toBeLessThan(3000)
  })

  it('executes multiline node script', async () => {
    const executor = new NativeExecutor()
    const result = await executor.execute(
      'node',
      ['-e', 'console.log(2 + 2); console.log("done")'],
      process.cwd()
    )
    expect(result.status).toBe('success')
    expect(result.stdout).toContain('4')
    expect(result.stdout).toContain('done')
  })
})
