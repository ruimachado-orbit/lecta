import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Toggle } from './components/Toggle'

const meta: Meta<typeof Toggle> = {
  title: 'Components/Toggle',
  component: Toggle,
  parameters: { layout: 'centered' },
  tags: ['autodocs']
}

export default meta
type Story = StoryObj<typeof Toggle>

export const Default: Story = {
  render: () => {
    const [on, setOn] = useState(true)
    return <Toggle checked={on} onChange={setOn} label="Auto-run code on save" description="Execute the slide's code the moment it changes." />
  }
}

export const Sizes: Story = {
  render: () => {
    const [on, setOn] = useState(false)
    return (
      <div className="space-y-4">
        <Toggle size="sm" checked={on} onChange={setOn} label="Small switch" />
        <Toggle size="md" checked={on} onChange={setOn} label="Medium switch" />
      </div>
    )
  }
}

export const Disabled: Story = {
  render: () => {
    const [on, setOn] = useState(false)
    return <Toggle checked={on} onChange={setOn} disabled label="MCP server" description="Requires a restart to change." />
  }
}
