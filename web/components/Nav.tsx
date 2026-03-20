'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { GITHUB_URL } from '@/lib/config'
import { useGitHubStars, formatStars } from '@/lib/useGitHubStars'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const stars = useGitHubStars('ruimachado-orbit/lecta')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`nav${scrolled ? ' scrolled' : ''}`}>
      <div className="navInner">
        <Link href="/" className="navWordmark">lecta</Link>
        <div className="navLinks">
          <Link href="/docs" className="navDocsLink">Docs</Link>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="navGithub">
            <StarIcon />
            GitHub
            {/* always render the badge; shows "..." while loading, null means error (hide) */}
            {stars !== null && (
              <span className={`navStars${stars < 0 ? ' navStarsLoading' : ''}`}>
                {formatStars(stars)}
              </span>
            )}
          </a>
          <a href="#download" className="btnPillSm">Download</a>
        </div>
      </div>
    </nav>
  )
}

function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ opacity: 0.6, flexShrink: 0 }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  )
}
