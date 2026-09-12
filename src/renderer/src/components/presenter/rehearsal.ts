/**
 * Rehearsal analysis — pure functions, no React, no DOM.
 *
 * Kept separate from `PresenterView` so the delivery-feedback math is unit
 * tested independently of the UI.
 */

export const FILLER_WORDS = [
  'um', 'uh', 'er', 'hmm', 'like', 'you know', 'so', 'actually',
  'basically', 'literally', 'right', 'okay', 'kind of', 'sort of'
]

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${(m % 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

export interface RehearsalSummary {
  totalSeconds: number
  /** Seconds spent on each slide, in order. */
  perSlide: number[]
  averageSeconds: number
  /** Index (0-based) of the slide the presenter spent the longest on. */
  slowestSlide: number | null
}

/**
 * Summarize per-slide timings. `perSlide` is expected to hold one entry per
 * slide, with the final entry possibly still in progress (excluded from the
 * average when a live `currentIndex` is given).
 */
export function summarizeSlideTimes(
  perSlide: number[],
  currentIndex: number | null
): RehearsalSummary {
  const settled = currentIndex === null ? perSlide : perSlide.slice(0, currentIndex)
  const totalSeconds = perSlide.reduce((a, b) => a + b, 0)
  const settledSum = settled.reduce((a, b) => a + b, 0)
  const averageSeconds = settled.length > 0 ? settledSum / settled.length : 0

  let slowestSlide: number | null = null
  let slowest = -1
  for (let i = 0; i < perSlide.length; i++) {
    if (perSlide[i] > slowest) {
      slowest = perSlide[i]
      slowestSlide = i
    }
  }
  return { totalSeconds, perSlide: [...perSlide], averageSeconds, slowestSlide }
}

export interface TranscriptAnalysis {
  wordCount: number
  wordsPerMinute: number
  fillerCount: number
  fillers: { word: string; count: number }[]
}

/** Count words and filler words in a transcript, and derive speaking pace. */
export function analyzeTranscript(transcript: string, durationSeconds: number): TranscriptAnalysis {
  const normalized = transcript.toLowerCase().replace(/[^a-z0-9\s']/g, ' ')
  const words = normalized.split(/\s+/).filter((w) => w.length > 0)
  const wordCount = words.length

  const fillers = FILLER_WORDS.map((word) => {
    const count = word.includes(' ')
      ? (normalized.match(new RegExp(`\\b${word.replace(' ', '\\s+')}\\b`, 'g')) || []).length
      : (normalized.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length
    return { word, count }
  }).filter((f) => f.count > 0)

  const fillerCount = fillers.reduce((a, f) => a + f.count, 0)
  const wordsPerMinute = durationSeconds > 0 ? Math.round((wordCount / durationSeconds) * 60) : 0

  return { wordCount, wordsPerMinute, fillerCount, fillers }
}
