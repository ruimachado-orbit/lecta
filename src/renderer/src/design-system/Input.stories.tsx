import type { Meta, StoryObj } from '@storybook/react-vite'
import { Input } from './components/Input'

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  parameters: { layout: 'padded' },
  tags: ['autodocs']
}

export default meta
type Story = StoryObj<typeof Input>

export const Default: Story = {
  args: { placeholder: 'Name your deck…', label: 'Deck title' }
}

export const WithHintAndIcon: Story = {
  render: () => (
    <div className="max-w-sm space-y-4">
      <Input label="Search" icon={<span>⌕</span>} placeholder="Slides, decks, notes…" hint="Searches titles and content." />
      <Input label="Webhook URL" leading={<span className="font-mono text-[12px]">https://</span>} placeholder="example.com/hook" />
    </div>
  )
}

export const ErrorState: Story = {
  render: () => (
    <div className="max-w-sm">
      <Input label="Video URL" defaultValue="not-a-url" error="Enter a valid YouTube or Vimeo URL." />
    </div>
  )
}
