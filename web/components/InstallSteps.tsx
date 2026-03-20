'use client'

import { useState } from 'react'

interface Props {
  variant?: 'dark' | 'cream'
}

const CURL_CMD = 'curl -fsSL https://raw.githubusercontent.com/ruimachado-orbit/lecta/main/install.sh | bash'
const XATTR_CMD = 'xattr -cr /Applications/Lecta.app'

export default function InstallSteps({ variant = 'dark' }: Props) {
  const [tab, setTab] = useState<'auto' | 'manual'>('auto')
  const muted = variant === 'cream' ? 'installMutedCream' : 'installMutedDark'

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
          <p className={muted}>Run this in Terminal — it downloads, installs, and handles macOS Gatekeeper:</p>
          <CopyBlock text={CURL_CMD} />
        </div>
      ) : (
        <div className="installPanel">
          <p className={muted}>After downloading the DMG and dragging Lecta to Applications, run:</p>
          <CopyBlock text={XATTR_CMD} />
          <p className={muted}>This clears the macOS quarantine flag so the app opens normally.</p>
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
