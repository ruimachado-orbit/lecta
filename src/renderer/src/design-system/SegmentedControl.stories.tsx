import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SegmentedControl } from './components/SegmentedControl'

const meta: Meta<typeof SegmentedControl> = {
  title: 'Components/SegmentedControl',
  component: SegmentedControl,
  parameters: { layout: 'centered' },
  tags: ['autodocs']
}

export default meta

type Mode = 'write' | 'preview' | 'present'

export const Default: StoryObj = {
  render: () => {
    const [mode, setMode] = useState<Mode>('write')
    return (
      <SegmentedControl<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'write', label: 'Write' },
          { value: 'preview', label: 'Preview' },
          { value: 'present', label: 'Present' }
        ]}
      />
    )
  }
}

export const WithIcons: StoryObj = {
  render: () => {
    const [mode, setMode] = useState<Mode>('write')
    return (
      <SegmentedControl<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'write', label: 'Write', icon: <span>✎</span> },
          { value: 'preview', label: 'Preview', icon: <span>◉</span> },
          { value: 'present', label: 'Present', icon: <span>▶</span> }
        ]}
      />
    )
  }
}

export const Small: StoryObj = {
  render: () => {
    const [mode, setMode] = useState<Mode>('preview')
    return (
      <SegmentedControl<Mode>
        size="sm"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'write', label: 'Write' },
          { value: 'preview', label: 'Preview' },
          { value: 'present', label: 'Present' }
        ]}
      />
    )
  }
}
