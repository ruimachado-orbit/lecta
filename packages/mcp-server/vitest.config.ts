import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    // `#shared/*` is a Node subpath import that package.json maps onto `dist/shared/*`,
    // the copy of packages/shared that `npm run build` compiles into this package. Tests
    // run straight off the shared TypeScript instead, so `npm test` needs no build and
    // never asserts against a stale one.
    alias: [
      {
        find: /^#shared\/(.*)\.js$/,
        replacement: path.resolve(__dirname, '../shared/src/$1.ts'),
      },
    ],
  },
})
