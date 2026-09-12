import { describe, expect, it } from 'vitest'
import {
  mentionAutocompleteQuery,
  matchMentionSlides,
  completeMention,
  expandMentions,
  type MentionableSlide,
} from './slide-mentions'

const SLIDES: MentionableSlide[] = [
  { number: 1, title: 'Q1 Review' },
  { number: 2, title: 'Revenue deep-dive' },
  { number: 3, title: 'Roadmap' },
]

describe('mentionAutocompleteQuery', () => {
  it('matches a trailing @token', () => {
    expect(mentionAutocompleteQuery('fix @rev')).toBe('rev')
    expect(mentionAutocompleteQuery('@')).toBe('')
  })
  it('returns null away from a token', () => {
    expect(mentionAutocompleteQuery('fix @2 now')).toBeNull()
    expect(mentionAutocompleteQuery('no token')).toBeNull()
  })
  it('ignores email addresses', () => {
    expect(mentionAutocompleteQuery('mail me@rev')).toBeNull()
  })
})

describe('matchMentionSlides', () => {
  it('matches by number prefix or title', () => {
    expect(matchMentionSlides(SLIDES, '2').map((s) => s.number)).toEqual([2])
    expect(matchMentionSlides(SLIDES, 'road')).toEqual([SLIDES[2]])
    expect(matchMentionSlides(SLIDES, '')).toEqual(SLIDES)
  })
})

describe('completeMention', () => {
  it('replaces the token and moves the caret', () => {
    const r = completeMention('fix @rev', 8, 'fix @rev and ship', 2)
    expect(r).toEqual({ text: 'fix @2  and ship', caret: 7 })
  })
})

describe('expandMentions', () => {
  it('expands known numbers, keeps unknown ones', () => {
    expect(expandMentions('compare @1 and @2', SLIDES)).toBe(
      'compare slide 1 ("Q1 Review") and slide 2 ("Revenue deep-dive")'
    )
    expect(expandMentions('look at @9', SLIDES)).toBe('look at @9')
  })
})
