'use client'

import { useState } from 'react'
import DownloadButton from './DownloadButton'
import { usePlatform } from '@/lib/usePlatform'

interface Props {
  variant?: 'dark' | 'cream'
}

const CURL_CMD = 'curl -fsSL https://raw.githubusercontent.com/ruimachado-orbit/lecta/main/install.sh | bash'
const XATTR_CMD = 'xattr -cr /Applications/Lecta.app'
const DPKG_CMD = 'sudo dpkg -i Lecta-*.deb'

export default function InstallSteps({ variant = 'dark' }: Props) {
  const [tab, setTab] = useState<'auto' | 'manual'>('auto')
  const platform = usePlatform()
  const muted = variant === 'cream' ? 'installMutedCream' : 'installMutedDark'

  const autoDescription = platform === 'linux'
    ? 'Run this in your terminal — it downloads the .deb package and installs via dpkg:'
    : 'Run this in Terminal — it downloads, installs, and handles macOS Gatekeeper:'

  const manualPostStep = platform === 'linux'
    ? 'After downloading, install the .deb package:'
    : 'After dragging Lecta to Applications, run this to clear the macOS quarantine flag:'

  const manualCmd = platform === 'linux' ? DPKG_CMD : XATTR_CMD

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
          <DownloadButton variant={variant} />
          <p className={muted} style={{ marginTop: '1.25rem' }}>{manualPostStep}</p>
          <CopyBlock text={manualCmd} />
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
