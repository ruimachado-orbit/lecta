import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    include: [
      'packages/shared/src/**/*.test.ts',
      'src/main/services/**/*.test.ts',
      'src/main/ipc/**/*.test.ts',
      'src/renderer/src/**/*.test.ts',
    ],
    globals: true,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'packages/shared/src'),
    },
  },
})
