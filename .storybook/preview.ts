import type { Preview } from '@storybook/react-vite'
import '../src/renderer/src/design-system/tokens.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color|fill|stroke|accent)$/i,
        date: /Date$/i
      }
    },
    docs: {
      toc: true
    },
    backgrounds: {
      default: 'ink-950',
      values: [
        { name: 'ink-950', value: '#07080a' },
        { name: 'ink-900', value: '#0c0e12' },
        { name: 'ink-800', value: '#14171d' },
        { name: 'paper', value: '#f5f6fa' }
      ]
    }
  }
}

export default preview
