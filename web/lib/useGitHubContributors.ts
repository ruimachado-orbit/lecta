import { useEffect, useState } from 'react'
import { GITHUB_REPO } from './config'

/** Optional display names when GitHub login alone is not enough for the UI */
const DISPLAY_NAME: Record<string, string> = {
  'ruimachado-orbit': 'Rui Machado',
  DiogoAntunesOliveira: 'Diogo Antunes',
  'pedro-ferreira-orbit': 'Pedro Ferreira',
  pedroferreira26: 'Pedro Ferreira',
  rikkarth: 'Ricardo Mendes',
  'anastasiia-orbit': 'Anastasiia',
}

const CREATOR_LOGIN = 'ruimachado-orbit'

const CLAUDE_AVATAR = 'https://avatars.githubusercontent.com/u/81847?s=96&v=4'

export type ContributorEntry = {
  github: string
  name: string
  role: string
  /** Direct avatar URL from GitHub API (or fixed for AI) */
  avatarUrl: string
  isAI?: boolean
}

type ApiContributor = {
  login: string
  avatar_url: string
  contributions: number
}

function normalizeAvatarUrl(url: string): string {
  const base = url.split('?')[0]
  return `${base}?s=96`
}

export function mergeContributorsFromApi(api: ApiContributor[]): ContributorEntry[] {
  const sorted = [...api].sort((a, b) => b.contributions - a.contributions)
  const humans: ContributorEntry[] = sorted.map((c) => ({
    github: c.login,
    name: DISPLAY_NAME[c.login] ?? c.login,
    role: c.login === CREATOR_LOGIN ? 'Creator' : 'Contributor',
    avatarUrl: normalizeAvatarUrl(c.avatar_url),
  }))
  const claude: ContributorEntry = {
    github: '__claude__',
    name: 'Claude',
    role: 'AI Contributor',
    avatarUrl: CLAUDE_AVATAR,
    isAI: true,
  }
  return [...humans, claude]
}

export type UseGitHubContributorsResult = {
  loading: boolean
  contributors: ContributorEntry[]
  error: boolean
}

/** Fetches repo contributors from the GitHub API and appends Claude. */
export function useGitHubContributors(
  repo: string = GITHUB_REPO,
): UseGitHubContributorsResult {
  const [loading, setLoading] = useState(true)
  const [contributors, setContributors] = useState<ContributorEntry[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    fetch(
      `https://api.github.com/repos/${repo}/contributors?per_page=100`,
    )
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((data: unknown) => {
        if (cancelled) return
        if (!Array.isArray(data)) {
          setContributors(mergeContributorsFromApi([]))
          setError(true)
          return
        }
        setContributors(mergeContributorsFromApi(data as ApiContributor[]))
      })
      .catch(() => {
        if (cancelled) return
        setContributors(mergeContributorsFromApi([]))
        setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [repo])

  return { loading, contributors, error }
}
