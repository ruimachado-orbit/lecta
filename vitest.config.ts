import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'packages/shared/src/**/*.test.ts',
      'src/main/services/**/*.test.ts',
      'src/main/ipc/**/*.test.ts',
    ],
    globals: true,
  },
  resolve: {
    alias: {
      '@shared': '/Users/pedroferreira/Documents/repos/lecta/packages/shared/src',
    },
  },
})
