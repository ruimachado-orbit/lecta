import type { StorybookConfig } from '@storybook/react-vite'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const config: StorybookConfig = {
  stories: ['../src/renderer/src/design-system/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {}
  },
  core: {
    disableTelemetry: true
  },
  viteFinal: async (config) => {
    // Tailwind v4 — same engine the app renderer uses, so design-system stories
    // share one source of truth for tokens and utilities.
    config.plugins = [...(config.plugins ?? []), tailwindcss()]

    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string> | undefined),
      '@shared': resolve(root, 'packages/shared/src'),
      '@renderer': resolve(root, 'src/renderer/src')
    }

    return config
  }
}

export default config
