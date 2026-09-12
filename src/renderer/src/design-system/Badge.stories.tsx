import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge } from './components/Badge'

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
  tags: ['autodocs']
}

export default meta
type Story = StoryObj<typeof Badge>

export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="neutral">Markdown</Badge>
      <Badge tone="signal">Running</Badge>
      <Badge tone="ice">TypeScript</Badge>
      <Badge tone="success">Saved</Badge>
      <Badge tone="warning">Unsaved</Badge>
      <Badge tone="danger">Error</Badge>
    </div>
  )
}

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge size="sm" tone="signal">small</Badge>
      <Badge size="md" tone="signal">medium</Badge>
    </div>
  )
}

export const WithIcon: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="ice" icon={<span className="text-[9px]">●</span>}>Python</Badge>
      <Badge tone="success" icon={<span className="text-[9px]">✓</span>}>Published</Badge>
    </div>
  )
}
