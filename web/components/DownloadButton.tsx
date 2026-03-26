'use client'

import { useEffect, useState } from 'react'
import { getDmgUrl, getDebUrl, LATEST_RELEASE_URL, VERSION } from '@/lib/config'
import { usePlatform, detectPlatformSync } from '@/lib/usePlatform'

type Arch = 'arm64' | 'x64' | 'unknown'

interface Props {
  variant?: 'dark' | 'cream'
  label?: string
  /** When true, the version/arch note is not rendered (caller renders it separately) */
  hideNote?: boolean
  /** When set, button scrolls to this anchor instead of downloading */
  scrollTo?: string
}

export default function DownloadButton({ variant = 'dark', label, hideNote = false, scrollTo }: Props) {
  const platform = usePlatform()
  const [arch, setArch] = useState<Arch>('unknown')

  useEffect(() => {
    if (platform !== 'mac') return

    const uad = (navigator as Navigator & {
      userAgentData?: { getHighEntropyValues: (h: string[]) => Promise<{ architecture?: string }> }
    }).userAgentData

    if (uad?.getHighEntropyValues) {
      uad.getHighEntropyValues(['architecture'])
        .then(d => setArch(d.architecture === 'arm' ? 'arm64' : 'x64'))
        .catch(() => setArch('arm64'))
    } else {
      setArch('arm64')
    }
  }, [platform])

  const cls = variant === 'cream' ? 'btnCream' : 'btnDark'
  const archLabel = arch === 'arm64' ? 'Apple Silicon' : arch === 'x64' ? 'Intel' : ''

  if (scrollTo) {
    const downloadLabel = platform === 'linux'
      ? 'Download for Linux'
      : label ?? 'Download for macOS'
    return (
      <a className={cls} href={scrollTo}>
        <DownloadIcon />{downloadLabel}
      </a>
    )
  }

  if (platform === null) {
    return <button className={cls} disabled><DownloadIcon />{label ?? 'Download'}</button>
  }

  // Linux — link to .deb
  if (platform === 'linux') {
    const href = getDebUrl()
    const note = `v${VERSION} · Linux x64 · Free · by orbit`
    return (
      <>
        <a className={cls} href={href} download>
          <DownloadIcon />
          {label ?? 'Download for Linux'}
        </a>
        {!hideNote && (
          <span className={variant === 'cream' ? 'downloadNote' : 'downloadNoteHero'}>
            {note}
          </span>
        )}
      </>
    )
  }

  // Unsupported platform — link to releases
  if (platform === 'other') {
    return (
      <>
        <a className={cls} href={LATEST_RELEASE_URL} target="_blank" rel="noopener noreferrer">
          <DownloadIcon />See all downloads
        </a>
        {!hideNote && (
          <span className={variant === 'cream' ? 'downloadNote' : 'downloadNoteHero'}>
            Available for macOS and Linux
          </span>
        )}
      </>
    )
  }

  // macOS
  const href = arch !== 'unknown' ? getDmgUrl(arch) : LATEST_RELEASE_URL
  const note = archLabel
    ? `v${VERSION} · ${archLabel} · Free · by orbit`
    : `v${VERSION} · Free · by orbit`

  return (
    <>
      <a className={cls} href={href} download>
        <DownloadIcon />
        {label ?? 'Download for macOS'}
      </a>
      {!hideNote && (
        <span className={variant === 'cream' ? 'downloadNote' : 'downloadNoteHero'}>
          {note}
        </span>
      )}
    </>
  )
}

export function useDownloadNote() {
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    const p = detectPlatformSync()

    if (p === 'linux') {
      setNote(`v${VERSION} · Linux x64 · Free · by orbit`)
      return
    }

    if (p === 'other') {
      setNote('Available for macOS and Linux')
      return
    }

    // macOS
    const uad = (navigator as Navigator & {
      userAgentData?: { getHighEntropyValues: (h: string[]) => Promise<{ architecture?: string }> }
    }).userAgentData

    const resolve = (arch: string) => {
      const archLabel = arch === 'arm64' ? 'Apple Silicon' : 'Intel'
      setNote(`v${VERSION} · ${archLabel} · Free · by orbit`)
    }

    if (uad?.getHighEntropyValues) {
      uad.getHighEntropyValues(['architecture'])
        .then(d => resolve(d.architecture === 'arm' ? 'arm64' : 'x64'))
        .catch(() => resolve('arm64'))
    } else {
      resolve('arm64')
    }
  }, [])

  return note
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
    </svg>
  )
}
