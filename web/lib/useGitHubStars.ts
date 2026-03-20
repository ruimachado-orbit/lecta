import { useEffect, useState } from 'react'

/** Fetches star count for a GitHub repo.
 *  Returns -1 while loading, null on error, number on success. */
export function useGitHubStars(repo: string): number | null {
  const [stars, setStars] = useState<number | null>(-1) // -1 = loading

  useEffect(() => {
    fetch(`https://api.github.com/repos/${repo}`)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() })
      .then(d => setStars(typeof d.stargazers_count === 'number' ? d.stargazers_count : null))
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
