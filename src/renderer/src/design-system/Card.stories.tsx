import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card } from './components/Card'
import { Button } from './components/Button'
import { Badge } from './components/Badge'

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  parameters: { layout: 'padded' },
  tags: ['autodocs']
}

export default meta
type Story = StoryObj<typeof Card>

export const Default: Story = {
  args: {
    title: 'Executable slides',
    description: 'Every code block runs live — your audience sees real results, not a screenshot.',
    children: <p className="text-sm text-ink-300">Body content lives here, on a layered ink surface.</p>
  }
}

export const WithIconAndFooter: Story = {
  render: () => (
    <Card
      icon={<span className="text-sm">{'{ }'}</span>}
      title="Launch recap"
      description="42 launches this quarter, +218% week-over-week."
      footer={
        <>
          <Button size="sm" variant="signal">Open deck</Button>
          <Button size="sm" variant="ghost">Share</Button>
          <div className="ml-auto">
            <Badge tone="ice">Updated today</Badge>
          </div>
        </>
      }
    >
      <div className="flex gap-8 py-1">
        <div>
          <div className="font-display text-3xl font-bold text-ink-50">42</div>
          <div className="mt-1 text-[13px] text-ink-400">launches</div>
        </div>
        <div>
          <div className="font-display text-3xl font-bold text-ink-50">+218%</div>
          <div className="mt-1 text-[13px] text-ink-400">WoW</div>
        </div>
      </div>
    </Card>
  )
}

export const Interactive: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card interactive title="Template" description="Start from a proven layout.">
        <p className="text-sm text-ink-300">Interactive hover state.</p>
      </Card>
      <Card interactive title="Blank" description="A clean canvas.">
        <p className="text-sm text-ink-300">Interactive hover state.</p>
      </Card>
      <Card interactive title="Import" description="Bring an existing deck.">
        <p className="text-sm text-ink-300">Interactive hover state.</p>
      </Card>
    </div>
  )
}
