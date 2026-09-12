import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readdir, readFile, writeFile, mkdir, stat } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { atomicWriteFile, writeFileIfMissing, withLock, debouncePerKey } from './safe-fs'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Names left behind by `atomicWriteFile`'s sibling temp file. */
const tempEntries = (names: string[]): string[] => names.filter((n) => n.includes('.tmp-'))

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lecta-safe-fs-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('atomicWriteFile', () => {
  it('writes the file and leaves no temp files behind', async () => {
    const target = join(dir, 'lecta.yaml')
    await atomicWriteFile(target, 'title: Deck\n')

    expect(await readFile(target, 'utf-8')).toBe('title: Deck\n')
    expect(tempEntries(await readdir(dir))).toEqual([])
    expect(await readdir(dir)).toEqual(['lecta.yaml'])
  })

  it('accepts Buffer and Uint8Array payloads', async () => {
    await atomicWriteFile(join(dir, 'a.bin'), Buffer.from([1, 2, 3]))
    await atomicWriteFile(join(dir, 'b.bin'), new Uint8Array([4, 5]))
    expect(Array.from(await readFile(join(dir, 'a.bin')))).toEqual([1, 2, 3])
    expect(Array.from(await readFile(join(dir, 'b.bin')))).toEqual([4, 5])
  })

  it('creates missing parent directories', async () => {
    const target = join(dir, 'deep', 'nested', 'settings.json')
    await atomicWriteFile(target, '{}')
    expect(await readFile(target, 'utf-8')).toBe('{}')
  })

  it('replaces existing content rather than appending', async () => {
    const target = join(dir, 'notes.md')
    await atomicWriteFile(target, 'first')
    await atomicWriteFile(target, 'second')
    expect(await readFile(target, 'utf-8')).toBe('second')
    expect(tempEntries(await readdir(dir))).toEqual([])
  })

  it('applies the requested mode (secrets files are owner-only)', async () => {
    if (process.platform === 'win32') return
    const target = join(dir, 'settings.json')
    await atomicWriteFile(target, '{"anthropicApiKey":"x"}', { mode: 0o600 })
    expect((await stat(target)).mode & 0o777).toBe(0o600)
  })

  it('keeps a .bak copy when asked, and tolerates there being nothing to back up', async () => {
    const target = join(dir, 'library.json')
    await atomicWriteFile(target, 'v1', { backup: true }) // no previous file — must not throw
    expect(await readdir(dir)).toEqual(['library.json'])

    await atomicWriteFile(target, 'v2', { backup: true })
    expect(await readFile(target, 'utf-8')).toBe('v2')
    expect(await readFile(`${target}.bak`, 'utf-8')).toBe('v1')
  })

  it('removes the temp file and preserves the old content when the rename fails', async () => {
    // A directory can never be replaced by a file rename: forces the catch path.
    const target = join(dir, 'occupied')
    await mkdir(target)
    await writeFile(join(target, 'keep.txt'), 'still here')

    await expect(atomicWriteFile(target, 'nope')).rejects.toThrow()

    expect(tempEntries(await readdir(dir))).toEqual([])
    expect(await readFile(join(target, 'keep.txt'), 'utf-8')).toBe('still here')
  })

  it('never leaves a partial file when many writes race on the same path', async () => {
    const target = join(dir, 'race.json')
    const payloads = Array.from({ length: 12 }, (_, i) => JSON.stringify({ n: i }))
    await Promise.all(payloads.map((p) => atomicWriteFile(target, p)))

    expect(await readdir(dir)).toEqual(['race.json'])
    expect(payloads).toContain(await readFile(target, 'utf-8'))
  })
})

describe('writeFileIfMissing', () => {
  it('creates the file and reports that it did', async () => {
    const target = join(dir, 'code', 'demo.py')
    await mkdir(join(dir, 'code'))
    expect(await writeFileIfMissing(target, '')).toBe(true)
    expect(await readFile(target, 'utf-8')).toBe('')
  })

  it('never truncates an existing file', async () => {
    const target = join(dir, 'demo.py')
    await writeFile(target, 'print("important")\n')

    expect(await writeFileIfMissing(target, '')).toBe(false)
    expect(await writeFileIfMissing(target, 'other content')).toBe(false)
    expect(await readFile(target, 'utf-8')).toBe('print("important")\n')
  })

  it('propagates errors other than EEXIST', async () => {
    await expect(writeFileIfMissing(join(dir, 'missing-dir', 'x.py'), '')).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })
})

describe('withLock', () => {
  it('serializes work for the same key', async () => {
    const order: string[] = []
    const a = withLock('deck', async () => {
      order.push('a:start')
      await delay(20)
      order.push('a:end')
      return 'a'
    })
    const b = withLock('deck', async () => {
      order.push('b:start')
      await delay(1)
      order.push('b:end')
      return 'b'
    })

    expect(await Promise.all([a, b])).toEqual(['a', 'b'])
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  })

  it('runs different keys concurrently', async () => {
    const order: string[] = []
    const slow = withLock('deck-1', async () => {
      order.push('slow:start')
      await delay(25)
      order.push('slow:end')
    })
    const fast = withLock('deck-2', async () => {
      order.push('fast:start')
      await delay(1)
      order.push('fast:end')
    })

    await Promise.all([slow, fast])
    expect(order).toEqual(['slow:start', 'fast:start', 'fast:end', 'slow:end'])
  })

  it('does not wedge the chain when a task rejects', async () => {
    await expect(
      withLock('deck-3', async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')

    await expect(withLock('deck-3', async () => 'still works')).resolves.toBe('still works')
  })

  it('actually protects a read-modify-write', async () => {
    const target = join(dir, 'counter.json')
    await atomicWriteFile(target, JSON.stringify({ n: 0 }))

    await Promise.all(
      Array.from({ length: 10 }, () =>
        withLock(target, async () => {
          const current = JSON.parse(await readFile(target, 'utf-8')) as { n: number }
          await delay(1)
          await atomicWriteFile(target, JSON.stringify({ n: current.n + 1 }))
        })
      )
    )

    expect(JSON.parse(await readFile(target, 'utf-8'))).toEqual({ n: 10 })
  })
})

describe('debouncePerKey', () => {
  it('coalesces a burst into a single call and resolves every caller', async () => {
    const debounce = debouncePerKey<number>(15)
    let calls = 0
    const run = async (): Promise<number> => {
      calls += 1
      return calls
    }

    const results = await Promise.all([debounce('k', run), debounce('k', run), debounce('k', run)])

    expect(calls).toBe(1)
    expect(results).toEqual([1, 1, 1])
  })

  it('runs again after the window has elapsed', async () => {
    const debounce = debouncePerKey<number>(10)
    let calls = 0
    const run = async (): Promise<number> => ++calls

    await debounce('k', run)
    await debounce('k', run)
    expect(calls).toBe(2)
  })

  it('keeps keys independent', async () => {
    const debounce = debouncePerKey<string>(15)
    const seen: string[] = []
    const run = (key: string) => async (): Promise<string> => {
      seen.push(key)
      return key
    }

    const results = await Promise.all([
      debounce('a', run('a')),
      debounce('a', run('a')),
      debounce('b', run('b'))
    ])

    expect(seen.sort()).toEqual(['a', 'b'])
    expect(results).toEqual(['a', 'a', 'b'])
  })

  it('uses the last function scheduled for the key', async () => {
    const debounce = debouncePerKey<string>(15)
    const value = await Promise.all([
      debounce('k', async () => 'first'),
      debounce('k', async () => 'last')
    ])
    expect(value).toEqual(['last', 'last'])
  })

  it('rejects every waiter when the work fails', async () => {
    const debounce = debouncePerKey<void>(10)
    const failing = async (): Promise<void> => {
      throw new Error('save failed')
    }
    const first = debounce('k', failing)
    const second = debounce('k', failing)

    await expect(first).rejects.toThrow('save failed')
    await expect(second).rejects.toThrow('save failed')
  })
})
