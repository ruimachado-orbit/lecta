import { describe, it, expect } from 'vitest'
import {
  FILLER_WORDS,
  analyzeTranscript,
  formatDuration,
  summarizeSlideTimes
} from './rehearsal'

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(65)).toBe('01:05')
    expect(formatDuration(3600)).toBe('1:00:00')
  })
})

describe('summarizeSlideTimes', () => {
  it('computes total, average and slowest slide', () => {
    const summary = summarizeSlideTimes([30, 45, 60], null)
    expect(summary.totalSeconds).toBe(135)
    expect(summary.averageSeconds).toBe(45)
    expect(summary.slowestSlide).toBe(2)
  })

  it('excludes the in-progress slide from the average', () => {
    const summary = summarizeSlideTimes([30, 45, 20], 2)
    expect(summary.totalSeconds).toBe(95)
    expect(summary.averageSeconds).toBe(37.5)
    expect(summary.slowestSlide).toBe(1)
  })
})

describe('analyzeTranscript', () => {
  it('counts words and filler words, and derives WPM', () => {
    const result = analyzeTranscript('Um, so we basically, like, shipped the feature. You know?', 60)
    expect(result.wordCount).toBeGreaterThan(0)
    expect(result.fillerCount).toBeGreaterThanOrEqual(4)
    expect(result.wordsPerMinute).toBeGreaterThan(0)
    expect(result.fillers.some((f) => f.word === 'um' && f.count === 1)).toBe(true)
  })

  it('ignores punctuation and is case-insensitive', () => {
    const result = analyzeTranscript('UM... Um!', 30)
    expect(result.fillers.find((f) => f.word === 'um')?.count).toBe(2)
  })

  it('returns zero WPM for an empty duration', () => {
    const result = analyzeTranscript('hello world', 0)
    expect(result.wordCount).toBe(2)
    expect(result.wordsPerMinute).toBe(0)
  })

  it('tracks every filler word in the list', () => {
    expect(FILLER_WORDS).toContain('um')
    expect(FILLER_WORDS).toContain('you know')
  })
})
