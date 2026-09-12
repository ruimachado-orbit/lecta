/**
 * Local, offline relevance search over the slide library and presentation
 * library. A lightweight TF-IDF-style ranker — no embeddings, no network —
 * good enough to find "the slide with the cost breakdown" by meaning of the
 * words in it.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'of', 'to', 'in',
  'on', 'at', 'by', 'for', 'with', 'about', 'as', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'this', 'that', 'these', 'those', 'it', 'its', 'i',
  'you', 'he', 'she', 'we', 'they', 'them', 'my', 'your', 'our', 'their',
  'have', 'has', 'had', 'do', 'does', 'did', 'not', 'no', 'from', 'up', 'down'
])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
}

export interface SearchableDoc {
  id: string
  /** Primary content (slide markdown, notes, code). */
  text: string
  /** Title/name — matched with a small boost. */
  title?: string
  /** Tags — matched with a small boost. */
  tags?: string[]
}

export interface SearchResult {
  doc: SearchableDoc
  score: number
  /** A short excerpt around the first matching term. */
  snippet: string
}

/** Roughly how many characters of context to show around a hit. */
const SNIPPET_RADIUS = 60

function makeSnippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase()
  let firstIndex = -1
  for (const term of terms) {
    const idx = lower.indexOf(term)
    if (idx >= 0 && (firstIndex < 0 || idx < firstIndex)) firstIndex = idx
  }
  if (firstIndex < 0) {
    return text.slice(0, SNIPPET_RADIUS * 2).trim()
  }
  const start = Math.max(0, firstIndex - SNIPPET_RADIUS)
  const end = Math.min(text.length, firstIndex + SNIPPET_RADIUS * 2)
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '')
}

/**
 * Rank documents against a query. Every term must occur for a document to
 * score; results are ordered by a TF × IDF score with a title/tag boost.
 */
export function rankDocuments(docs: SearchableDoc[], query: string, limit = 20): SearchResult[] {
  const terms = tokenize(query)
  if (terms.length === 0) return []

  const docTokens = docs.map((d) => ({
    doc: d,
    titleTokens: tokenize(d.title ?? ''),
    tagTokens: (d.tags ?? []).flatMap((t) => tokenize(t)),
    bodyTokens: tokenize(d.text)
  }))

  // Document frequency per term, for IDF.
  const df = new Map<string, number>()
  for (const dt of docTokens) {
    const present = new Set([...dt.titleTokens, ...dt.tagTokens, ...dt.bodyTokens])
    for (const term of present) df.set(term, (df.get(term) ?? 0) + 1)
  }

  const results: SearchResult[] = []
  for (const dt of docTokens) {
    let score = 0
    for (const term of terms) {
      const docFreq = df.get(term) ?? 0
      if (docFreq === 0) continue
      const idf = Math.log((docs.length + 1) / (docFreq + 1)) + 1
      const tf =
        dt.titleTokens.filter((t) => t === term).length * 3 +
        dt.tagTokens.filter((t) => t === term).length * 2 +
        dt.bodyTokens.filter((t) => t === term).length
      if (tf === 0) {
        // A term that appears nowhere in the doc disqualifies it.
        score = -1
        break
      }
      score += tf * idf
    }
    if (score <= 0) continue
    const normalized = score / (1 + Math.log(1 + dt.bodyTokens.length))
    results.push({ doc: dt.doc, score: normalized, snippet: makeSnippet(dt.doc.text, terms) })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}
