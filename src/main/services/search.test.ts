import { describe, it, expect } from 'vitest'
import { rankDocuments, tokenize, type SearchableDoc } from './search'

const docs: SearchableDoc[] = [
  { id: 's1', text: 'Q3 revenue breakdown by region and product line', title: 'Revenue', tags: ['finance'] },
  { id: 's2', text: 'Architecture diagram of the microservices platform', title: 'Architecture' },
  { id: 's3', text: 'Hiring plan and headcount for next quarter', title: 'Hiring', tags: ['people'] }
]

describe('tokenize', () => {
  it('lowercases, strips punctuation and drops stop words', () => {
    expect(tokenize('The Q3 Revenue, breakdown!')).toEqual(['q3', 'revenue', 'breakdown'])
  })
})

describe('rankDocuments', () => {
  it('ranks the most relevant document first', () => {
    const results = rankDocuments(docs, 'revenue by region')
    expect(results[0].doc.id).toBe('s1')
  })

  it('returns nothing when no document matches', () => {
    expect(rankDocuments(docs, 'quantum entanglement')).toHaveLength(0)
  })

  it('boosts title and tag matches', () => {
    const results = rankDocuments(docs, 'finance')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].doc.id).toBe('s1')
  })

  it('returns a snippet containing a hit', () => {
    const results = rankDocuments(docs, 'microservices')
    expect(results[0].snippet.toLowerCase()).toContain('microservices')
  })

  it('returns an empty list for an empty query', () => {
    expect(rankDocuments(docs, '')).toHaveLength(0)
  })
})
