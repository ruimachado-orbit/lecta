import { useEffect, useState } from 'react'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/** Fetches star count for a GitHub repo with sessionStorage caching.
 *  Returns -1 while loading, null on error, number on success. */
export function useGitHubStars(repo: string): number | null {
  const [stars, setStars] = useState<number | null>(-1) // -1 = loading

  useEffect(() => {
    const cacheKey = `gh-stars-${repo}`
    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        const { value, ts } = JSON.parse(cached)
        if (Date.now() - ts < CACHE_TTL_MS) {
          setStars(value)
          return
        }
      }
    } catch {}

    fetch(`https://api.github.com/repos/${repo}`)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() })
      .then(d => {
        const count = typeof d.stargazers_count === 'number' ? d.stargazers_count : null
        setStars(count)
        if (count !== null) {
          try { sessionStorage.setItem(cacheKey, JSON.stringify({ value: count, ts: Date.now() })) } catch {}
        }
      })
      .catch(() => setStars(null))
  }, [repo])

  return stars
}

/** Format star count: 1200 → "1.2k" */
export function formatStars(n: number): string {
  if (n < 0) return '...' // loading
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
