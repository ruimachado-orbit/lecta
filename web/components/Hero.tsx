'use client'

import { useEffect, useRef } from 'react'
import { GITHUB_URL } from '@/lib/config'
import DownloadButton, { useDownloadNote } from './DownloadButton'
import { useGitHubStars, formatStars } from '@/lib/useGitHubStars'
import HeroMockup from './HeroMockup'

export default function Hero() {
  const mockupRef = useRef<HTMLDivElement>(null)
  const note = useDownloadNote()
  const stars = useGitHubStars('ruimachado-orbit/lecta')

  useEffect(() => {
    if (!mockupRef.current) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { mockupRef.current?.classList.add('vis'); obs.disconnect() } },
      { threshold: 0.1 }
    )
    obs.observe(mockupRef.current)
    return () => obs.disconnect()
  }, [])

  return (
    <section className="hero">
      <div className="container">
        <span className="heroKicker">Open source &middot; macOS &middot; Free</span>
        <h1 className="heroWordmark">lecta</h1>
        <p className="heroTagline">Technical presentations with live code execution.</p>

        <div className="heroCtas">
          <DownloadButton variant="dark" hideNote />
          <a className="btnGhost" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            GitHub &rarr;
          </a>
        </div>

        {/* meta row: always renders once client hydrates */}
        <div className="heroCtaMeta">
          {note && <span className="heroCtaNote">{note}</span>}
          {stars !== null && (
            <span className="heroStars">
              <StarIcon />
              <span className={stars < 0 ? 'heroStarsLoading' : ''}>{formatStars(stars)}</span>
              {stars >= 0 && ' stars on GitHub'}
            </span>
          )}
        </div>

        <div className="mockupWrap fu" ref={mockupRef}>
          <HeroMockup />
        </div>
      </div>
    </section>
  )
}

function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  )
}
