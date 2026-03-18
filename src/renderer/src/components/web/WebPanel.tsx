import { useState, useRef, useEffect } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { SpotlightContainer, SpotlightToggle } from '../common/Spotlight'
import type { WebAppConfig } from '../../../../../packages/shared/src/types/presentation'

interface WebPanelProps {
  webapp: WebAppConfig
}

export function WebPanel({ webapp }: WebPanelProps): JSX.Element {
  const { removeAttachment } = usePresentationStore()
  const [url, setUrl] = useState(webapp.url)
  const [inputUrl, setInputUrl] = useState(webapp.url)
  const webviewRef = useRef<HTMLWebViewElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [spotlightEnabled, setSpotlightEnabled] = useState(true)

  const handleNavigate = () => {
    let target = inputUrl.trim()
    if (target && !target.match(/^https?:\/\//)) {
      target = `https://${target}`
    }
    setUrl(target)
    setInputUrl(target)
  }

  // Sync webview events
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onStartLoad = () => setIsLoading(true)
    const onStopLoad = () => setIsLoading(false)
    const onNavigate = (e: any) => setInputUrl(e.url)

    wv.addEventListener('did-start-loading', onStartLoad)
    wv.addEventListener('did-stop-loading', onStopLoad)
    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onNavigate)

    return () => {
      wv.removeEventListener('did-start-loading', onStartLoad)
      wv.removeEventListener('did-stop-loading', onStopLoad)
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onNavigate)
    }
  }, [url])

  // Auto-zoom webview content to fit the panel width
  useEffect(() => {
    const wv = webviewRef.current as any
    const container = containerRef.current
    if (!wv || !container) return

    const DESKTOP_WIDTH = 1440

    const updateZoom = () => {
      const panelWidth = container.clientWidth
      if (panelWidth > 0 && wv.setZoomFactor) {
        const factor = Math.min(1, panelWidth / DESKTOP_WIDTH)
        wv.setZoomFactor(factor)
      }
    }

    // Set zoom after the page loads
    const onReady = () => updateZoom()
    wv.addEventListener('dom-ready', onReady)

    // Re-zoom when panel resizes
    const ro = new ResizeObserver(updateZoom)
    ro.observe(container)

    return () => {
      wv.removeEventListener('dom-ready', onReady)
      ro.disconnect()
    }
  }, [url])

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Browser bar */}
      <div className="h-9 bg-gray-900 border-b border-gray-800 flex items-center px-2 gap-2">
        <GlobeIcon />
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
          className="flex-1 px-2 py-1 bg-gray-950 text-gray-300 text-xs font-mono rounded
                     border border-gray-700 focus:border-white focus:outline-none truncate"
        />
        <button
          onClick={handleNavigate}
          className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors"
        >
          Go
        </button>
        <button
          onClick={() => webviewRef.current?.reload()}
          className="p-1 hover:bg-gray-800 text-gray-400 hover:text-gray-200 rounded transition-colors"
          title="Reload"
        >
          <RefreshIcon />
        </button>
        <button
          onClick={() => webviewRef.current?.goBack()}
          className="p-1 hover:bg-gray-800 text-gray-400 hover:text-gray-200 rounded transition-colors"
          title="Back"
        >
          <BackIcon />
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 hover:bg-gray-800 text-gray-400 hover:text-gray-200 rounded transition-colors"
          title="Open in browser"
        >
          <ExternalIcon />
        </a>
        {isLoading && (
          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
        )}
        <SpotlightToggle enabled={spotlightEnabled} onToggle={() => setSpotlightEnabled(!spotlightEnabled)} />
        <button
          onClick={() => removeAttachment('webapp')}
          className="p-1 hover:bg-red-600 text-gray-500 hover:text-white rounded transition-colors"
          title="Remove web app from slide"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Embedded browser via webview (bypasses X-Frame-Options) */}
      <div className="flex-1 relative" ref={containerRef}>
        <SpotlightContainer enabled={spotlightEnabled}>
          <webview
            ref={webviewRef as any}
            src={url}
            className="absolute inset-0"
            style={{ width: '100%', height: '100%' }}
            // @ts-ignore - Electron webview attributes
            allowpopups="true"
          />
        </SpotlightContainer>
      </div>
    </div>
  )
}

function GlobeIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.97.633-3.794 1.708-5.282" />
    </svg>
  )
}

function RefreshIcon(): JSX.Element {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
    </svg>
  )
}

function BackIcon(): JSX.Element {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  )
}

function ExternalIcon(): JSX.Element {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  )
}
