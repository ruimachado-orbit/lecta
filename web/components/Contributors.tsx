'use client'

import { useState, useEffect } from 'react'
import Reveal from './ScrollReveal'
import { GITHUB_URL } from '@/lib/config'

const contributors = [
  { name: 'Rui Machado',    github: 'ruimachado-orbit',    role: 'Creator'      },
  { name: 'Diogo Antunes',  github: 'DiogoAntunesOliveira', role: 'Contributor'  },
  { name: 'Pedro Ferreira', github: 'pedroferreira-orbit',  role: 'Contributor'  },
  { name: 'Claude',         github: '__claude__',           role: 'AI Contributor', isAI: true },
]

type Status = 'loading' | 'loaded' | 'error'

function Avatar({ name, github, role, isAI }: { name: string; github: string; role: string; isAI?: boolean }) {
  const [status, setStatus] = useState<Status>('loading')
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const src = `https://github.com/${github}.png?size=96`

  // Probe the image with JS Image constructor — more reliable than <img onError>
  useEffect(() => {
    if (isAI) return
    const img = new Image()
    img.onload  = () => setStatus('loaded')
    img.onerror = () => setStatus('error')
    img.src = src
  }, [src, isAI])

  return (
    <div className="avatarWrap">
      {isAI ? (
        <img
          className="avatarImg"
          src="https://avatars.githubusercontent.com/u/81847?s=96&v=4"
          alt="Claude"
        />
      ) : status === 'loaded' ? (
        <img className="avatarImg" src={src} alt={name} />
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

export default function Contributors() {
  return (
    <section className="contributorsSection">
      <div className="container">
        <Reveal><span className="secLabel">Open Source</span></Reveal>
        <Reveal><h2 className="secTitle">Built by <a href="https://orbitplatform.ai" target="_blank" rel="noopener noreferrer"><em>orbit.</em></a></h2></Reveal>

        <Reveal delay={1}>
          <div className="avatarRow">
            {contributors.map(c => <Avatar key={c.github} {...c} />)}
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
