import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './components/Button'

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['signal', 'primary', 'secondary', 'ghost', 'danger']
    },
    size: { control: 'select', options: ['sm', 'md', 'lg'] }
  }
}

export default meta
type Story = StoryObj<typeof Button>

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="signal">Present deck</Button>
      <Button variant="primary">Save changes</Button>
      <Button variant="secondary">Export PDF</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="danger">Delete slide</Button>
    </div>
  )
}

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="secondary">Small</Button>
      <Button size="md" variant="secondary">Medium</Button>
      <Button size="lg" variant="secondary">Large</Button>
    </div>
  )
}

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="signal" icon={<span>▶</span>}>Present</Button>
      <Button variant="secondary" iconRight={<span className="text-ink-400">⌘K</span>}>Command palette</Button>
      <Button variant="ghost" icon={<span>＋</span>}>New slide</Button>
    </div>
  )
}

export const States: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button isLoading variant="signal">Running…</Button>
      <Button disabled variant="signal">Disabled</Button>
      <Button fullWidth variant="secondary">Full width</Button>
    </div>
  )
}
