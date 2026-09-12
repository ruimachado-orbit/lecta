import type { Meta, StoryObj } from '@storybook/react-vite'
import { Kbd } from './components/Kbd'

const meta: Meta<typeof Kbd> = {
  title: 'Components/Kbd',
  component: Kbd,
  parameters: { layout: 'centered' },
  tags: ['autodocs']
}

export default meta
type Story = StoryObj<typeof Kbd>

export const Default: Story = {
  args: { children: '⌘' }
}

export const Shortcut: Story = {
  render: () => (
    <div className="flex items-center gap-1.5">
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
      <span className="ml-1 text-sm text-ink-400">Command palette</span>
    </div>
  )
}

export const Sequence: Story = {
  render: () => (
    <div className="flex items-center gap-1.5">
      <Kbd>⌘</Kbd>
      <Kbd>⇧</Kbd>
      <Kbd>P</Kbd>
      <span className="ml-1 text-sm text-ink-400">Present</span>
    </div>
  )
}
