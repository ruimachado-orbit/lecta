import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join, resolve, sep } from 'path'
import { tmpdir } from 'os'
import {
  allowedFileRoots,
  registerDeckRoot,
  unregisterDeckRoot,
  isInsideRoot,
  isInsideOpenDeck,
  assertInsideOpenDeck,
  resolveInsideDeck,
  PathOutsideDeckError
} from './deck-roots'

// Paths need not exist on disk — every helper here is pure path arithmetic.
const DECK = join(tmpdir(), 'lecta-deck-roots', 'alpha')
const SIBLING = join(tmpdir(), 'lecta-deck-roots', 'alpha-evil')
const OUTSIDE = join(tmpdir(), 'lecta-deck-roots', 'beta')

beforeEach(() => {
  allowedFileRoots.clear()
})

afterEach(() => {
  allowedFileRoots.clear()
})

describe('registerDeckRoot / unregisterDeckRoot', () => {
  it('stores the resolved absolute path and returns it', () => {
    const returned = registerDeckRoot(`${DECK}${sep}.${sep}`)
    expect(returned).toBe(resolve(DECK))
    expect(allowedFileRoots.has(resolve(DECK))).toBe(true)
  })

  it('is idempotent', () => {
    registerDeckRoot(DECK)
    registerDeckRoot(DECK)
    expect(allowedFileRoots.size).toBe(1)
  })

  it('unregisters by unnormalised path too', () => {
    registerDeckRoot(DECK)
    unregisterDeckRoot(join(DECK, 'slides', '..'))
    expect(allowedFileRoots.size).toBe(0)
  })
})

describe('isInsideRoot', () => {
  it('accepts the root itself and anything under it', () => {
    expect(isInsideRoot(DECK, DECK)).toBe(true)
    expect(isInsideRoot(join(DECK, 'slides', '01.md'), DECK)).toBe(true)
  })

  it('rejects a sibling directory that merely shares the prefix', () => {
    expect(isInsideRoot(SIBLING, DECK)).toBe(false)
    expect(isInsideRoot(join(SIBLING, 'slides', '01.md'), DECK)).toBe(false)
  })

  it('rejects traversal out of the root', () => {
    expect(isInsideRoot(join(DECK, '..', 'secret.txt'), DECK)).toBe(false)
  })
})

describe('isInsideOpenDeck', () => {
  it('is false when no deck is open', () => {
    expect(isInsideOpenDeck(join(DECK, 'lecta.yaml'))).toBe(false)
  })

  it('is true for a file in any registered root', () => {
    registerDeckRoot(DECK)
    registerDeckRoot(OUTSIDE)
    expect(isInsideOpenDeck(join(DECK, 'code', 'demo.py'))).toBe(true)
    expect(isInsideOpenDeck(join(OUTSIDE, 'code', 'demo.py'))).toBe(true)
  })

  it('is false again after the deck is closed', () => {
    registerDeckRoot(DECK)
    unregisterDeckRoot(DECK)
    expect(isInsideOpenDeck(join(DECK, 'lecta.yaml'))).toBe(false)
  })

  it('rejects non-string and empty input', () => {
    registerDeckRoot(DECK)
    expect(isInsideOpenDeck('')).toBe(false)
    expect(isInsideOpenDeck(undefined as unknown as string)).toBe(false)
    expect(isInsideOpenDeck(null as unknown as string)).toBe(false)
    expect(isInsideOpenDeck(42 as unknown as string)).toBe(false)
  })
})

describe('assertInsideOpenDeck', () => {
  it('returns the resolved path for a confined file', () => {
    registerDeckRoot(DECK)
    expect(assertInsideOpenDeck(join(DECK, 'slides', '..', 'lecta.yaml'))).toBe(join(DECK, 'lecta.yaml'))
  })

  it('throws PathOutsideDeckError outside every root', () => {
    registerDeckRoot(DECK)
    expect(() => assertInsideOpenDeck(join(OUTSIDE, 'lecta.yaml'))).toThrow(PathOutsideDeckError)
    try {
      assertInsideOpenDeck(join(DECK, '..', '..', '.ssh', 'id_rsa'))
      throw new Error('should have thrown')
    } catch (err) {
      expect((err as Error).name).toBe('PathOutsideDeckError')
    }
  })

  it('throws on empty and non-string input', () => {
    registerDeckRoot(DECK)
    expect(() => assertInsideOpenDeck('')).toThrow(PathOutsideDeckError)
    expect(() => assertInsideOpenDeck(undefined as unknown as string)).toThrow(PathOutsideDeckError)
  })
})

describe('resolveInsideDeck', () => {
  it('resolves an ordinary relative path', () => {
    expect(resolveInsideDeck(DECK, 'slides/01-intro.md')).toBe(join(DECK, 'slides', '01-intro.md'))
    expect(resolveInsideDeck(DECK, './code/demo.py')).toBe(join(DECK, 'code', 'demo.py'))
  })

  it('does not require the deck to be registered (root is supplied by the caller)', () => {
    expect(allowedFileRoots.size).toBe(0)
    expect(resolveInsideDeck(DECK, 'lecta.yaml')).toBe(join(DECK, 'lecta.yaml'))
  })

  it('rejects absolute paths', () => {
    expect(() => resolveInsideDeck(DECK, '/etc/passwd')).toThrow(PathOutsideDeckError)
    expect(() => resolveInsideDeck(DECK, 'C:\\Windows\\system32')).toThrow(PathOutsideDeckError)
    expect(() => resolveInsideDeck(DECK, 'C:/Windows/system32')).toThrow(PathOutsideDeckError)
  })

  it('rejects every form of parent traversal', () => {
    expect(() => resolveInsideDeck(DECK, '../../.zshrc')).toThrow(PathOutsideDeckError)
    expect(() => resolveInsideDeck(DECK, 'slides/../../escape.md')).toThrow(PathOutsideDeckError)
    expect(() => resolveInsideDeck(DECK, 'slides\\..\\..\\escape.md')).toThrow(PathOutsideDeckError)
    expect(() => resolveInsideDeck(DECK, 'a//..//b')).toThrow(PathOutsideDeckError)
  })

  it('allows dot-dot inside a filename', () => {
    expect(resolveInsideDeck(DECK, 'slides/weird..name.md')).toBe(join(DECK, 'slides', 'weird..name.md'))
  })

  it('rejects empty and non-string input', () => {
    expect(() => resolveInsideDeck(DECK, '')).toThrow(PathOutsideDeckError)
    expect(() => resolveInsideDeck(DECK, undefined as unknown as string)).toThrow(PathOutsideDeckError)
  })
})
