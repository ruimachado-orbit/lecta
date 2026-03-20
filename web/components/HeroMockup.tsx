'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const TABS = [
  { id: 'sql',  label: 'query.sql'     },
  { id: 'csv',  label: 'sales.csv'     },
  { id: 'html', label: 'localhost:3001' },
  { id: 'md',   label: 'notes.md'      },
]

const CYCLE_MS = 3800

export default function HeroMockup() {
  const [active, setActive] = useState(0)
  const [dir, setDir] = useState(1)

  useEffect(() => {
    const id = setInterval(() => {
      setDir(1)
      setActive(p => (p + 1) % TABS.length)
    }, CYCLE_MS)
    return () => clearInterval(id)
  }, [])

  function go(i: number) {
    setDir(i > active ? 1 : -1)
    setActive(i)
  }

  return (
    <div className="appWindow">
      <div className="windowChrome">
        <span className="td tdR" /><span className="td tdY" /><span className="td tdG" />
        <span className="windowTitle">intro-to-sql &mdash; lecta</span>
      </div>
      <div className="windowBody">
        {/* static slide pane */}
        <div className="slidePaneWrap">
          <div className="slideCard">
            <div className="slideH">Aggregation &amp; Window Functions</div>
            <div className="slideRule" />
            <div className="slideLines">
              <span style={{ width: '88%' }} />
              <span style={{ width: '72%' }} />
              <span style={{ width: '55%' }} />
            </div>
          </div>
        </div>

        {/* animated right pane */}
        <div className="mockupRight">
          {/* tab bar */}
          <div className="mockupTabs">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                className={`mockupTab${active === i ? ' mockupTabActive' : ''}`}
                onClick={() => go(i)}
              >
                <TabIcon id={t.id} active={active === i} />
                {t.label}
              </button>
            ))}
          </div>

          {/* content */}
          <div className="mockupContent">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={TABS[active].id}
                custom={dir}
                initial={{ opacity: 0, x: dir * 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -18 }}
                transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
                style={{ height: '100%' }}
              >
                {active === 0 && <SqlContent />}
                {active === 1 && <CsvContent />}
                {active === 2 && <PreviewContent />}
                {active === 3 && <MarkdownContent />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Tab icon ── */
function TabIcon({ id, active }: { id: string; active: boolean }) {
  const col = active ? '#c9d1d9' : '#484f58'
  if (id === 'sql') return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/>
    </svg>
  )
  if (id === 'csv') return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m17.25-3.75h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-10.875-3.75h8.25"/>
    </svg>
  )
  if (id === 'html') return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253M3 12c0 .778.099 1.533.284 2.253"/>
    </svg>
  )
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
    </svg>
  )
}

/* ── Pane content ── */

function SqlContent() {
  return (
    <div className="codePane" style={{ height: '100%' }}>
      <div className="cl"><span className="ln">1</span>&nbsp;<span className="cm">-- running total of sales by date</span></div>
      <div className="cl"><span className="ln">2</span>&nbsp;<span className="kw">SELECT</span></div>
      <div className="cl"><span className="ln">3</span>&nbsp;&nbsp;&nbsp;<span className="pl">date</span>,</div>
      <div className="cl"><span className="ln">4</span>&nbsp;&nbsp;&nbsp;<span className="pl">amount</span>,</div>
      <div className="cl"><span className="ln">5</span>&nbsp;&nbsp;&nbsp;<span className="fn">SUM</span>(<span className="pl">amount</span>) <span className="kw">OVER</span> (</div>
      <div className="cl"><span className="ln">6</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="kw">ORDER BY</span> <span className="pl">date</span></div>
      <div className="cl"><span className="ln">7</span>&nbsp;&nbsp;&nbsp;) <span className="kw">AS</span> <span className="pl">running_total</span></div>
      <div className="cl"><span className="ln">8</span>&nbsp;<span className="kw">FROM</span> <span className="nm">sales</span></div>
      <div className="cl"><span className="ln">9</span>&nbsp;<span className="kw">ORDER BY</span> <span className="pl">date</span></div>
      <div className="codeOut">
        <div className="outLabel">Result &middot; 5 rows</div>
        <div className="outVal">
          2024-01-01&nbsp;&nbsp;1200&nbsp;&nbsp;1200<br />
          2024-01-02&nbsp;&nbsp;&nbsp;950&nbsp;&nbsp;2150<br />
          2024-01-03&nbsp;&nbsp;1680&nbsp;&nbsp;3830
        </div>
      </div>
    </div>
  )
}

function CsvContent() {
  const rows = [
    ['2024-01-01', '1,200', '1,200'],
    ['2024-01-02', '950',   '2,150'],
    ['2024-01-03', '1,680', '3,830'],
    ['2024-01-04', '2,100', '5,930'],
    ['2024-01-05', '780',   '6,710'],
  ]
  return (
    <div className="csvPane">
      <div className="csvStatusBar">sales.csv &nbsp;&middot;&nbsp; 5 rows &nbsp;&middot;&nbsp; 3 columns</div>
      <table className="csvTable">
        <thead>
          <tr>
            <th>date</th><th>amount</th><th>running_total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r[0]}>
              <td>{r[0]}</td><td className="csvNum">{r[1]}</td><td className="csvNum">{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PreviewContent() {
  const bars = [
    { label: 'Jan 1', val: 1200, max: 6710 },
    { label: 'Jan 2', val: 2150, max: 6710 },
    { label: 'Jan 3', val: 3830, max: 6710 },
    { label: 'Jan 4', val: 5930, max: 6710 },
    { label: 'Jan 5', val: 6710, max: 6710 },
  ]
  return (
    <div className="previewPane">
      <div className="previewChrome">
        <div className="previewDot" /><div className="previewDot" /><div className="previewDot" />
        <div className="previewUrl">localhost:3001</div>
      </div>
      <div className="previewBody">
        <div className="previewTitle">Running Total</div>
        <div className="previewChart">
          {bars.map(b => (
            <div key={b.label} className="previewBarRow">
              <span className="previewBarLabel">{b.label}</span>
              <div className="previewBarTrack">
                <motion.div
                  className="previewBar"
                  initial={{ width: 0 }}
                  animate={{ width: `${(b.val / b.max) * 100}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: bars.indexOf(b) * 0.07 }}
                />
              </div>
              <span className="previewBarVal">{(b.val / 1000).toFixed(1)}k</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MarkdownContent() {
  return (
    <div className="mdPane">
      <div className="mdH1"># intro-to-sql</div>
      <div className="mdText">Learn SQL aggregation with real data.</div>
      <div className="mdH2">## Window Functions</div>
      <div className="mdText mdFaded">
        Window functions operate on <span className="mdBold">sets of rows</span> related to the current row.
        Unlike <span className="mdCode">GROUP BY</span>, they don&apos;t collapse rows.
      </div>
      <div className="mdH2">## Files</div>
      <div className="mdFileList">
        <div className="mdFile"><span className="mdFileIcon">📄</span>query.sql</div>
        <div className="mdFile"><span className="mdFileIcon">📊</span>sales.csv</div>
        <div className="mdFile"><span className="mdFileIcon">🌐</span>chart.html</div>
      </div>
    </div>
  )
}
