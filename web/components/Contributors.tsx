'use client'

import { useState, useEffect } from 'react'
import Reveal from './ScrollReveal'
import { GITHUB_URL } from '@/lib/config'
import { useContributors } from './ContributorsProvider'

type Status = 'loading' | 'loaded' | 'error'

function Avatar({
  name,
  github,
  role,
  isAI,
  avatarUrl,
}: {
  name: string
  github: string
  role: string
  isAI?: boolean
  avatarUrl: string
}) {
  const [status, setStatus] = useState<Status>('loading')
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  useEffect(() => {
    if (isAI) return
    const img = new Image()
    img.onload = () => setStatus('loaded')
    img.onerror = () => setStatus('error')
    img.src = avatarUrl
  }, [avatarUrl, isAI])

  return (
    <div className="avatarWrap">
      {isAI ? (
        <img
          className="avatarImg"
          src={avatarUrl}
          alt="Claude"
        />
      ) : status === 'loaded' ? (
        <img className="avatarImg" src={avatarUrl} alt={name} />
      ) : (
        <div className={`avatarFallback${status === 'loading' ? ' avatarLoading' : ''}`}>
          {status === 'loading' ? '' : initials}
        </div>
      )}
      <span className="avatarTooltip">
        {name}
        <span className="avatarRole">{role}</span>
      </span>
    </div>
  )
}

function AvatarSkeleton() {
  return (
    <div className="avatarWrap">
      <div className="avatarFallback avatarLoading" />
    </div>
  )
}

export default function Contributors() {
  const { loading, contributors, error } = useContributors()

  return (
    <section id="contributors" className="contributorsSection">
      <div className="container">
        <Reveal><span className="secLabel">Open Source</span></Reveal>
        <Reveal><h2 className="secTitle">Built by <a href="https://orbitplatform.ai" target="_blank" rel="noopener noreferrer"><em>orbit.</em></a></h2></Reveal>

        <Reveal delay={1}>
          <div className="avatarRow">
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <AvatarSkeleton key={`sk-${i}`} />
              ))}
            {!loading &&
              contributors.map((c) => (
                <Avatar key={c.github} {...c} />
              ))}
            <a
              className="avatarWrap avatarAdd"
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="avatarFallback avatarAddInner" style={{ display: 'flex' }}>+</div>
              <span className="avatarTooltip">Become a contributor</span>
            </a>
          </div>
        </Reveal>

        {error && !loading && (
          <Reveal delay={1}>
            <p className="contributorQuote" style={{ fontSize: '0.95rem', opacity: 0.85 }}>
              Couldn&apos;t load the latest contributor list from GitHub —{' '}
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                see the repo
              </a>
              .
            </p>
          </Reveal>
        )}

        <Reveal delay={2}>
          <p className="contributorQuote">
            <em>lecta is built openly — by humans and AI alike.</em><br />
            Claude helped write the code. Cursor helped navigate it.
            That&apos;s how modern software gets made, and we think that&apos;s a good thing.
            If you want to improve lecta, every tool at your disposal is welcome —
            AI-assisted PRs included.
          </p>
          <a className="contributorCta" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            Contribute on GitHub &rarr;
          </a>
        </Reveal>
      </div>
    </section>
  )
}
