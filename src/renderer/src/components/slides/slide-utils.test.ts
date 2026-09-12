import { describe, it, expect, beforeEach } from 'vitest'
import { resolveImageSrc, queuePinComment, drainPinComments } from './slide-utils'

// Both helpers are pure (the pin queue is a module-level array) — no DOM needed.

beforeEach(() => {
  drainPinComments()
})

describe('resolveImageSrc', () => {
  it('returns an empty string for missing src', () => {
    expect(resolveImageSrc(undefined)).toBe('')
    expect(resolveImageSrc('')).toBe('')
    expect(resolveImageSrc(undefined, '/decks/talk')).toBe('')
  })

  it('passes remote and inline sources through untouched', () => {
    const untouched = [
      'https://example.com/a.png',
      'http://example.com/a.png',
      'data:image/png;base64,AAAA',
      'lecta-file:///decks/talk/img/a.png'
    ]
    for (const src of untouched) {
      expect(resolveImageSrc(src, '/decks/talk')).toBe(src)
    }
  })

  it('rewrites file:// to the app protocol', () => {
    expect(resolveImageSrc('file:///decks/talk/img/a.png')).toBe('lecta-file:///decks/talk/img/a.png')
    // The root is irrelevant for an already-absolute file URL.
    expect(resolveImageSrc('file:///elsewhere/a.png', '/decks/talk')).toBe('lecta-file:///elsewhere/a.png')
  })

  it('resolves a deck-relative path against the deck root', () => {
    expect(resolveImageSrc('images/diagram.png', '/decks/talk')).toBe('lecta-file:///decks/talk/images/diagram.png')
  })

  it('decodes percent-encoded relative paths so spaces survive', () => {
    expect(resolveImageSrc('images/my%20diagram.png', '/decks/talk')).toBe(
      'lecta-file:///decks/talk/images/my diagram.png'
    )
  })

  it('leaves a relative path alone when no deck root is known', () => {
    expect(resolveImageSrc('images/diagram.png')).toBe('images/diagram.png')
  })
})

describe('pin comment queue', () => {
  it('starts empty and drains to an empty array', () => {
    expect(drainPinComments()).toEqual([])
  })

  it('returns queued comments in order', () => {
    queuePinComment('<!-- pin: a -->')
    queuePinComment('<!-- pin: b -->')
    expect(drainPinComments()).toEqual(['<!-- pin: a -->', '<!-- pin: b -->'])
  })

  it('empties the queue so a second drain yields nothing', () => {
    queuePinComment('<!-- pin: a -->')
    expect(drainPinComments()).toEqual(['<!-- pin: a -->'])
    expect(drainPinComments()).toEqual([])
  })

  it('does not hand back a live reference to the internal queue', () => {
    queuePinComment('<!-- pin: a -->')
    const drained = drainPinComments()
    queuePinComment('<!-- pin: b -->')
    expect(drained).toEqual(['<!-- pin: a -->'])
    expect(drainPinComments()).toEqual(['<!-- pin: b -->'])
  })
})
