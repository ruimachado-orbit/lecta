import type { ReactNode } from 'react'
import { Badge } from './Badge'
import { Button } from './Button'
import { Kbd } from './Kbd'

/**
 * A static reconstruction of the Lecta editor shell, rendered in the new
 * "Ink & Signal" language. This is the target direction applied to the real
 * app layout — not a functional screen, a North Star for the redesign.
 */

function Tab({ label, active, dot }: { label: string; active?: boolean; dot?: boolean }): JSX.Element {
  return (
    <div
      className={`flex h-9 cursor-pointer items-center gap-2 border-r border-ink-700 px-4 text-[13px] transition-colors ${
        active ? 'bg-ink-900 text-ink-50' : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200'
      }`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-signal-500" />}
      <span className="max-w-[180px] truncate">{label}</span>
    </div>
  )
}

function ToolIcon({ children, active, label }: { children: ReactNode; active?: boolean; label: string }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        active ? 'bg-ink-700 text-signal-400' : 'text-ink-300 hover:bg-ink-700 hover:text-ink-50'
      }`}
    >
      {children}
    </button>
  )
}

const PlayIcon = (
  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const Chevrons = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
  </svg>
)

export function EditorShell(): JSX.Element {
  return (
    <div className="flex h-[640px] w-full flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-950 shadow-3">
      {/* ── Tab bar ── */}
      <div className="flex h-9 items-stretch border-b border-ink-700 bg-ink-900">
        <Tab label="Home" />
        <Tab label="Launch keynote" active dot />
        <Tab label="Notes" />
        <button className="flex items-center px-3 text-ink-400 hover:bg-ink-800 hover:text-ink-200">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
        <div className="ml-auto flex items-center gap-1 pr-3">
          <Badge tone="signal" size="sm">● LIVE</Badge>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex h-12 items-center gap-2 border-b border-ink-700 bg-ink-900 px-3">
        <ToolIcon label="Close">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </ToolIcon>
        <div className="flex items-center gap-1">
          <ToolIcon label="Previous">
            <span className="rotate-180">{Chevrons}</span>
          </ToolIcon>
          <span className="min-w-[52px] text-center font-mono text-[13px] text-ink-200">03 / 12</span>
          <ToolIcon label="Next">{Chevrons}</ToolIcon>
        </div>
        <div className="mx-1 h-6 w-px bg-ink-700" />
        <span className="truncate text-sm font-medium text-ink-100">Launch keynote</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost">Insert</Button>
          <Button size="sm" variant="ghost">Theme</Button>
          <ToolIcon label="Slide map" active>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6h16.5M3.75 12h16.5m-16.5 6h7.5" />
            </svg>
          </ToolIcon>
          <Button size="sm" variant="signal" icon={PlayIcon}>Present</Button>
        </div>
      </div>

      {/* ── Body: slide canvas + right code pane ── */}
      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 items-center justify-center bg-ink-950 p-8">
          <SlideMock />
        </div>

        <div className="w-8 flex-col items-center gap-1 border-l border-ink-700 bg-ink-900 py-2 hidden md:flex">
          <ToolIcon label="Code" active>{'{ }'}</ToolIcon>
          <ToolIcon label="Video">▶</ToolIcon>
          <ToolIcon label="Web">◎</ToolIcon>
          <div className="my-1 h-px w-4 bg-ink-600" />
          <ToolIcon label="Add">＋</ToolIcon>
        </div>

        <div className="flex w-[300px] flex-col border-l border-ink-700 bg-ink-900">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
            <span className="font-mono text-[12px] text-ink-300">slide-03.ts</span>
            <Badge tone="ice" size="sm">TypeScript</Badge>
          </div>
          <div className="flex-1 p-4 font-mono text-[12.5px] leading-relaxed">
            <pre className="text-ink-300">
              <span className="text-ice-300">import</span> {'{ '}
              <span className="text-signal-400">exec</span> {'}'} <span className="text-ice-300">from</span>{' '}
              <span className="text-ink-50">'@lecta'</span>
              {'\n\n'}
              <span className="text-ice-300">const</span> <span className="text-ink-100">result</span> ={' '}
              <span className="text-signal-400">exec</span>(`{'\n  '}SELECT count(*) {'\n  '}FROM launches{'\n'}`)
              {'\n\n'}
              <span className="text-ink-400">{'// 42 launches this year'}</span>
            </pre>
          </div>
          <div className="border-t border-ink-700 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-signal-500" />
              <span className="text-[12px] text-ink-300">Run completed in 14ms</span>
            </div>
            <Button size="sm" variant="secondary" fullWidth icon={PlayIcon}>Run code</Button>
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="flex h-8 items-center gap-4 border-t border-ink-700 bg-ink-900 px-4 text-[12px] text-ink-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success" />
          Ready
        </span>
        <span className="font-mono text-ink-300">python (pyodide)</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
            <span className="ml-1 text-ink-400">Present</span>
          </span>
          <span className="text-ink-400">Saved just now</span>
          <span className="text-ink-300">Slide 3 of 12</span>
        </div>
      </div>
    </div>
  )
}

/** A mini slide rendered in the "executive" slide theme, not the app chrome. */
function SlideMock(): JSX.Element {
  return (
    <div
      className="relative flex aspect-[16/9] w-full max-w-[560px] flex-col justify-center overflow-hidden rounded-lg border border-ink-700 px-14 shadow-3"
      style={{ background: 'linear-gradient(135deg, #13171e 0%, #0a0c10 100%)' }}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-signal-500 via-ice-400 to-transparent" />
      <span className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-signal-400">Quarterly recap</span>
      <h2 className="text-[34px] font-semibold leading-tight tracking-[-0.02em] text-ink-50">
        We shipped 42 launches,
        <br />
        <span className="text-signal-gradient">and it’s just getting started.</span>
      </h2>
      <div className="mt-8 flex gap-8">
        <div>
          <div className="font-display text-4xl font-bold text-ink-50">42</div>
          <div className="mt-1 text-[13px] text-ink-300">launches</div>
        </div>
        <div>
          <div className="font-display text-4xl font-bold text-ink-50">+218%</div>
          <div className="mt-1 text-[13px] text-ink-300">week-over-week</div>
        </div>
      </div>
    </div>
  )
}
