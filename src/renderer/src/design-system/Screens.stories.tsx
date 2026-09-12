import type { Meta, StoryObj } from '@storybook/react-vite'
import { EditorShell } from './components/EditorShell'

const meta: Meta<typeof EditorShell> = {
  title: 'Screens/Editor',
  component: EditorShell,
  parameters: { layout: 'padded' }
}

export default meta
type Story = StoryObj<typeof EditorShell>

export const EditorShellRedesign: Story = {
  name: 'Editor shell — redesigned',
  parameters: {
    docs: {
      description: {
        story:
          'The current Lecta editor reimagined in the Ink & Signal direction: signal-marked active tab and focus states, layered ink chrome that recedes behind the slide, an ice-tinted code pane, and a calm status bar.'
      }
    }
  }
}
