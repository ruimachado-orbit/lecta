'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Reveal from './ScrollReveal'

function AudienceCard() {
  const [artifactOpen, setArtifactOpen] = useState(false)

  useEffect(() => {
    // cycle: closed 2s → open 3s → closed 2s → …
    let t: ReturnType<typeof setTimeout>
    const cycle = (open: boolean) => {
      t = setTimeout(() => {
        setArtifactOpen(open)
        cycle(!open)
      }, open ? 3000 : 2000)
    }
    cycle(true) // first open after 2s
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="presenterCard presenterLight">
      <div className="presenterCardHeader">
        <span className="presenterBadge presenterBadgeLight">Audience Mode</span>
      </div>
      <div className="presenterMockup audienceMockup">
        <div className="audienceSlide">
          <div className="audienceSlideInner">
            <div className="audienceH">Aggregation &amp; Window Functions</div>
            <div className="audienceRule" />
            <div className="audienceLines">
              <span style={{ width: '82%' }} />
              <span style={{ width: '68%' }} />
              <span style={{ width: '52%' }} />
            </div>
          </div>

          {/* artifact panel slides in from the right */}
          <AnimatePresence>
            {artifactOpen && (
              <motion.div
                className="audienceArtifact"
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0,      opacity: 1 }}
                exit={{    x: '100%', opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="aaHeader">
                  <span className="aaDot" /><span className="aaDot" /><span className="aaDot" />
                  <span className="aaTitle">query.sql &mdash; Result</span>
                  <span className="aaRows">5 rows</span>
                </div>
                <table className="aaTable">
                  <thead>
                    <tr><th>date</th><th>amount</th><th>running_total</th></tr>
                  </thead>
                  <tbody>
                    {[
                      ['2024-01-01', '1,200', '1,200'],
                      ['2024-01-02', '950',   '2,150'],
                      ['2024-01-03', '1,680', '3,830'],
                    ].map(r => (
                      <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <p className="presenterCardDesc">
        A clean, distraction-free view for your audience — with optional artifacts like query results, charts, or live previews appearing on demand.
      </p>
    </div>
  )
}

export default function PresenterSection() {
  return (
    <section className="presenterSection">
      <div className="container">
        <Reveal><span className="secLabel">Present &amp; Share</span></Reveal>
        <Reveal>
          <h2 className="secTitle">
            Two views, one presentation.<br />
            <em>Everyone sees what they need.</em>
          </h2>
        </Reveal>

        <div className="presenterGrid">
          {/* Presenter view — static */}
          <Reveal delay={1}>
            <div className="presenterCard presenterDark">
              <div className="presenterCardHeader">
                <span className="presenterBadge">Presenter View</span>
              </div>
              <div className="presenterMockup">
                <div className="pmSlide pmSlideMain">
                  <div className="pmSlideH" />
                  <div className="pmSlideBody">
                    <span style={{ width: '80%' }} />
                    <span style={{ width: '65%' }} />
                    <span style={{ width: '50%' }} />
                  </div>
                </div>
                <div className="pmSidebar">
                  <div className="pmNextLabel">Next</div>
                  <div className="pmSlide pmSlideNext">
                    <div className="pmSlideH pmSlideHSmall" />
                    <div className="pmSlideBody">
                      <span style={{ width: '70%' }} />
                      <span style={{ width: '50%' }} />
                    </div>
                  </div>
                  <div className="pmTimer">12:34</div>
                  <div className="pmNotesLabel">Notes</div>
                  <div className="pmNotes">
                    <span style={{ width: '95%' }} />
                    <span style={{ width: '80%' }} />
                    <span style={{ width: '60%' }} />
                  </div>
                </div>
              </div>
              <p className="presenterCardDesc">
                Your private view: full speaker notes, elapsed timer, and next-slide preview — all on your second screen while the audience sees only the slide.
              </p>
            </div>
          </Reveal>

          {/* Audience view — animated */}
          <Reveal delay={2}>
            <AudienceCard />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
