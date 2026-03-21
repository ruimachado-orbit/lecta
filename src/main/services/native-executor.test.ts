import { describe, it, expect, vi } from 'vitest'
import { NativeExecutor } from './native-executor'

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
    expect(result.duration).toBeLessThan(5000)
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
