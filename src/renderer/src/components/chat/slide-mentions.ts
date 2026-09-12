/**
 * Slide @-mentions for the chat composer.
 *
 * Pure module: no React, no stores, no `window` — the parser is the single
 * source of truth for the autocomplete popover and the send-time expansion in
 * `ChatComposer`, and it is unit-tested in `slide-mentions.test.ts`.
 */

export interface MentionableSlide {
  /** 1-based slide number shown to the user. */
  number: number
  /** Slide heading or id, for matching and display. */
  title: string
}

/**
 * The mention token being typed before the caret: `'3'` for `@3`, `''` for a
 * bare `@`, and `null` when the caret is not right after an `@token`.
 */
export function mentionAutocompleteQuery(textBeforeCaret: string): string | null {
  const match = /@([A-Za-z0-9-]*)$/.exec(textBeforeCaret)
  if (!match) return null
  // An email address is not a mention.
  const at = textBeforeCaret.length - match[0].length
  if (at > 0 && /[A-Za-z0-9._%+-]/.test(textBeforeCaret[at - 1])) return null
  return match[1]
}

/** Slides matching `query` by number prefix or title substring; all for `''`. */
export function matchMentionSlides(slides: MentionableSlide[], query: string): MentionableSlide[] {
  const q = query.toLowerCase()
  if (!q) return slides
  return slides.filter(
    (s) => String(s.number).startsWith(q) || s.title.toLowerCase().includes(q)
  )
}

/**
 * Replace the `@token` ending `textBeforeCaret` with `@N `, keeping whatever
 * was typed after the caret untouched.
 */
export function completeMention(textBeforeCaret: string, caret: number, fullText: string, number: number): { text: string; caret: number } {
  const before = textBeforeCaret.replace(/@[A-Za-z0-9-]*$/, `@${number} `)
  const text = before + fullText.slice(caret)
  return { text, caret: before.length }
}

/**
 * Expand `@N` tokens into unambiguous slide references before sending, so the
 * agent acts on the slide the user picked rather than guessing.
 * Unknown numbers are left untouched.
 */
export function expandMentions(text: string, slides: MentionableSlide[]): string {
  return text.replace(/(^|[\s(])@(\d+)\b/g, (m, prefix, num) => {
    const slide = slides.find((s) => s.number === Number(num))
    if (!slide) return m
    return `${prefix}slide ${slide.number} ("${slide.title}")`
  })
}
