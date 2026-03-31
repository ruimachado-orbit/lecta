'use client'

import { useState } from 'react'
import { getDmgUrl, getDebUrl, getAppImageUrl } from '@/lib/config'
import { usePlatform } from '@/lib/usePlatform'

interface Props {
  variant?: 'dark' | 'cream'
}

const CURL_CMD = 'curl -fsSL https://raw.githubusercontent.com/ruimachado-orbit/lecta/main/install.sh | bash'

const DISTROS = [
  {
    id: 'macos',
    label: 'macOS',
    downloadLabel: 'Download for macOS',
    downloadUrl: getDmgUrl('arm64'),
    instruction: 'After dragging Lecta to Applications, clear the quarantine flag:',
    command: 'xattr -cr /Applications/Lecta.app',
  },
  {
    id: 'deb',
    label: 'Linux (.deb)',
    downloadLabel: 'Download .deb',
    downloadUrl: getDebUrl(),
    instruction: 'Install the .deb package with dependencies:',
    command: 'sudo apt-get install ./Lecta-*.deb',
  },
  {
    id: 'appimage',
    label: 'Linux (AppImage)',
    downloadLabel: 'Download AppImage',
    downloadUrl: getAppImageUrl(),
    instruction: 'Make it executable and run:',
    command: 'chmod +x Lecta-*.AppImage && ./Lecta-*.AppImage',
  },
] as const

export default function InstallSteps({ variant = 'dark' }: Props) {
  const [tab, setTab] = useState<'auto' | 'manual'>('auto')
  const platform = usePlatform()
  const muted = variant === 'cream' ? 'installMutedCream' : 'installMutedDark'

  const defaultOpen = platform === 'linux' ? 'deb' : 'macos'
  const [expanded, setExpanded] = useState<string | null>(null)

  // Set default expanded section once platform is detected
  const activeExpanded = expanded ?? defaultOpen

  const toggle = (id: string) => {
    setExpanded(activeExpanded === id ? '' : id)
  }

  const autoDescription = platform === 'linux'
    ? 'Run this in your terminal — it downloads the .deb package and installs via apt-get:'
    : 'Run this in Terminal — it downloads, installs, and handles macOS Gatekeeper:'

  return (
    <div className="installSteps">
      <div className="installTabs">
        <button
          className={`installTab ${tab === 'auto' ? 'installTabActive' : ''}`}
          onClick={() => setTab('auto')}
        >
          Quick install
        </button>
        <button
          className={`installTab ${tab === 'manual' ? 'installTabActive' : ''}`}
          onClick={() => setTab('manual')}
        >
          Manual download
        </button>
      </div>

      {tab === 'auto' ? (
        <div className="installPanel">
          <p className={muted}>{autoDescription}</p>
          <CopyBlock text={CURL_CMD} />
        </div>
      ) : (
        <div className="installPanel">
          {DISTROS.map((d) => (
            <div key={d.id} className="distroSection">
              <button
                className={`distroHeader ${activeExpanded === d.id ? 'distroHeaderActive' : ''}`}
                onClick={() => toggle(d.id)}
              >
                <span>{d.label}</span>
                <ChevronIcon open={activeExpanded === d.id} />
              </button>
              {activeExpanded === d.id && (
                <div className="distroBody">
                  <a className={variant === 'cream' ? 'btnCream' : 'btnDark'} href={d.downloadUrl} download>
                    <DownloadIcon />
                    {d.downloadLabel}
                  </a>
                  <p className={muted} style={{ marginTop: '1rem' }}>{d.instruction}</p>
                  <CopyBlock text={d.command} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="copyBlock">
      <code className="copyCode">{text}</code>
      <button className="copyBtn" onClick={copy} title="Copy to clipboard">
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        )}
      </button>
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}
