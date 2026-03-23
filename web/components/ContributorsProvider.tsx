'use client'

import { createContext, useContext, type ReactNode } from 'react'
import {
  useGitHubContributors,
  type ContributorEntry,
  type UseGitHubContributorsResult,
} from '@/lib/useGitHubContributors'
import { GITHUB_REPO } from '@/lib/config'

const ContributorsContext = createContext<UseGitHubContributorsResult | null>(
  null,
)

export function ContributorsProvider({ children }: { children: ReactNode }) {
  const value = useGitHubContributors(GITHUB_REPO)
  return (
    <ContributorsContext.Provider value={value}>
      {children}
    </ContributorsContext.Provider>
  )
}

export function useContributors(): UseGitHubContributorsResult {
  const ctx = useContext(ContributorsContext)
  if (!ctx) {
    throw new Error(
      'useContributors must be used within ContributorsProvider',
    )
  }
  return ctx
}

/** For optional use outside the provider (e.g. tests) */
export type { ContributorEntry }
