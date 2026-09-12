import type { Meta, StoryObj } from '@storybook/react-vite'
import { cx } from './lib/cx'

const meta: Meta = {
  title: 'Foundations',
  parameters: { layout: 'padded' }
}

export default meta

type Story = StoryObj

/* ── Color ─────────────────────────────────────────────────── */

const INK = [
  ['ink-950', '#060708'],
  ['ink-900', '#0b0d10'],
  ['ink-800', '#14171c'],
  ['ink-700', '#1c2026'],
  ['ink-600', '#262b33'],
  ['ink-500', '#333a45'],
  ['ink-400', '#565f6f'],
  ['ink-300', '#7d8698'],
  ['ink-200', '#a8b0bf'],
  ['ink-100', '#d3d8e0'],
  ['ink-50', '#f4f6f9']
] as const

const SIGNAL = [
  ['signal-300', '#e6ff7d'],
  ['signal-400', '#d2fb4d'],
  ['signal-500', '#c4f42e'],
  ['signal-600', '#a9d91f'],
  ['signal-700', '#84ad12']
] as const

const ICE = [
  ['ice-300', '#a5e8ff'],
  ['ice-400', '#7fd4ff'],
  ['ice-500', '#5bb9f5'],
  ['ice-600', '#3d94d6']
] as const

const SEMANTIC = [
  ['success', '#34d399'],
  ['warning', '#fbbf24'],
  ['danger', '#fb7185'],
  ['info', '#7fd4ff']
] as const

function Swatch({ name, value }: { name: string; value: string }): JSX.Element {
  return (
    <div>
      <div className="h-12 rounded-lg border border-ink-600" style={{ background: value }} />
      <div className="mt-1.5 font-mono text-[11px] text-ink-300">{name}</div>
      <div className="font-mono text-[10px] text-ink-400">{value}</div>
    </div>
  )
}

function SwatchGroup({ title, items }: { title: string; items: readonly (readonly [string, string])[] }): JSX.Element {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-ink-400">{title}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {items.map(([name, value]) => (
          <Swatch key={name} name={name} value={value} />
        ))}
      </div>
    </section>
  )
}

export const Colors: Story = {
  render: () => (
    <div>
      <p className="mb-8 max-w-2xl text-ink-300">
        <span className="font-semibold text-ink-50">Ink &amp; Signal.</span> Deep cool-black “ink” surfaces replace the
        flat grayscale; a single electric “signal” lime marks focus and primary actions; “ice” blue carries links and
        AI moments. Color is a signal, never decoration.
      </p>
      <SwatchGroup title="Ink — surfaces & text" items={INK} />
      <SwatchGroup title="Signal — primary accent" items={SIGNAL} />
      <SwatchGroup title="Ice — secondary accent" items={ICE} />
      <SwatchGroup title="Semantic" items={SEMANTIC} />
    </div>
  )
}

/* ── Typography ────────────────────────────────────────────── */

function Specimen({
  label,
  sample,
  style
}: {
  label: string
  sample: string
  style: string
}): JSX.Element {
  return (
    <div className="border-b border-ink-700 py-5 last:border-0">
      <div className="mb-1 font-mono text-[11px] text-ink-400">{label}</div>
      <div className={cx('text-ink-50', style)}>{sample}</div>
    </div>
  )
}

export const Typography: Story = {
  render: () => (
    <div className="max-w-3xl">
      <p className="mb-6 text-ink-300">
        One sans for UI, a display cut for hero moments, and a mono for data. Type is tighter and more confident —
        negative tracking on large sizes, a proper modular scale underneath.
      </p>
      <Specimen label="Display / 56 · bold · -0.03em" sample="Ship the thing." style="font-display text-[56px] font-bold tracking-[-0.03em] leading-[1.05]" />
      <Specimen label="Heading / 32 · semibold · -0.02em" sample="Quarterly recap, in one slide." style="font-display text-[32px] font-semibold tracking-[-0.02em]" />
      <Specimen label="Title / 20 · semibold" sample="Executable slides, without the friction." style="text-[20px] font-semibold" />
      <Specimen label="Body / 15 · regular · 1.6" sample="Lecta turns a deck into a working app — every code block runs live, so your audience sees real results instead of a screenshot." style="text-[15px] leading-[1.6] text-ink-200 max-w-xl" />
      <Specimen label="Mono / 13" sample="SELECT count(*) FROM launches WHERE quarter = 'Q4'" style="font-mono text-[13px] text-ice-300" />
      <Specimen label="Label / 11 · uppercase · +0.14em" sample="Execution engine" style="text-[11px] uppercase tracking-[0.14em] text-ink-400 font-semibold" />
    </div>
  )
}

/* ── Elevation ─────────────────────────────────────────────── */

export const Elevation: Story = {
  render: () => (
    <div className="grid max-w-4xl gap-8 sm:grid-cols-3">
      {[
        ['shadow-1', 'shadow-1', 'Panel baseline — inset top light + hairline.'],
        ['shadow-2', 'shadow-2', 'Raised card — hover target, dropdowns.'],
        ['shadow-3', 'shadow-3', 'Floating surface — dialogs, popovers.']
      ].map(([label, shadow, note]) => (
        <div key={label as string}>
          <div className={cx('flex h-40 items-center justify-center rounded-xl border border-ink-600 bg-ink-900', shadow as string)}>
            <span className="font-mono text-[12px] text-ink-300">{label}</span>
          </div>
          <p className="mt-2 text-[13px] text-ink-400">{note}</p>
        </div>
      ))}
    </div>
  )
}

/* ── Principles ────────────────────────────────────────────── */

export const Principles: Story = {
  render: () => (
    <div className="max-w-2xl space-y-6 text-ink-300">
      <h2 className="font-display text-2xl font-semibold text-ink-50">The redesign in five rules</h2>
      {[
        ['Depth over flatness', 'Layered ink surfaces with a faint top light give the chrome physicality — but never so much that it competes with the slide.'],
        ['One accent, used with intent', 'Signal lime appears only on the current thing: focus, primary action, progress. Everything else stays quiet.'],
        ['Tight, confident type', 'Larger display sizes with negative tracking; a real modular scale; mono reserved for data and code.'],
        ['Motion that means something', '150–250ms springy easings for state changes; no gratuitous animation.'],
        ['The slide is the product', 'App chrome recedes; the deck stays the brightest thing on screen.']
      ].map(([title, body]) => (
        <div key={title} className="card p-5">
          <h3 className="font-semibold text-ink-50">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed">{body}</p>
        </div>
      ))}
    </div>
  )
}
