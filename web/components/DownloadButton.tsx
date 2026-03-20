'use client'

import { useEffect, useState } from 'react'
import { getDmgUrl, LATEST_RELEASE_URL, VERSION } from '@/lib/config'

type Arch = 'arm64' | 'x64' | 'unknown'
type Platform = 'mac' | 'other' | null

interface Props {
  variant?: 'dark' | 'cream'
  label?: string
  /** When true, the version/arch note is not rendered (caller renders it separately) */
  hideNote?: boolean
  /** When set, button scrolls to this anchor instead of downloading */
  scrollTo?: string
}

export default function DownloadButton({ variant = 'dark', label, hideNote = false, scrollTo }: Props) {
  const [platform, setPlatform] = useState<Platform>(null)
  const [arch, setArch] = useState<Arch>('unknown')

  useEffect(() => {
    const ua = navigator.userAgent
    const isMac = /Macintosh|Mac OS X/.test(ua)
    if (!isMac) { setPlatform('other'); return }

    setPlatform('mac')

    const uad = (navigator as Navigator & {
      userAgentData?: { getHighEntropyValues: (h: string[]) => Promise<{ architecture?: string }> }
    }).userAgentData

    if (uad?.getHighEntropyValues) {
      uad.getHighEntropyValues(['architecture'])
        .then(d => setArch(d.architecture === 'arm' ? 'arm64' : 'x64'))
        .catch(() => setArch('arm64'))
    } else {
      setArch('arm64') // Safari/Firefox default — most new Macs are Apple Silicon
    }
  }, [])

  const cls = variant === 'cream' ? 'btnCream' : 'btnDark'
  const archLabel = arch === 'arm64' ? 'Apple Silicon' : arch === 'x64' ? 'Intel' : ''

  if (scrollTo) {
    return (
      <a className={cls} href={scrollTo}>
        <DownloadIcon />{label ?? 'Download for macOS'}
      </a>
    )
  }

  if (platform === null) {
    return <button className={cls} disabled><DownloadIcon />{label ?? 'Download for macOS'}</button>
  }

  if (platform === 'other') {
    return (
      <>
        <button className={cls} disabled><DownloadIcon />macOS only</button>
        {!hideNote && (
          <span className={variant === 'cream' ? 'downloadNote' : 'downloadNoteHero'}>
            lecta requires macOS 13+
          </span>
        )}
      </>
    )
  }

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
    const ua = navigator.userAgent
    const isMac = /Macintosh|Mac OS X/.test(ua)
    if (!isMac) { setNote('macOS 13+ required'); return }

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
