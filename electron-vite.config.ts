import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@shared'] })],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'packages/shared/src')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@shared'] })],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'packages/shared/src')
      }
    }
  },
  renderer: {
    resolve: {
      alias: [
        { find: '@shared', replacement: resolve(__dirname, 'packages/shared/src') },
        { find: '@renderer', replacement: resolve(__dirname, 'src/renderer/src') }
      ]
    },
    server: {
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'deviant-portsmouth-fighter-petition.trycloudflare.com',
        '*.trycloudflare.com'
      ],
      watch: {
        // Ignore non-source files — content writes (slides, yaml, code, mdx)
        // trigger Vite full-page reloads. Glob patterns are unreliable with
        // chokidar, so use a function filter instead.
        ignored: (filePath: string) => {
          // Always watch source code and config
          if (filePath.includes('/src/') || filePath.includes('/packages/')) return false
          // Ignore content files that get written at runtime
          if (/\.(yaml|mdx|md|lecta|sql|notes)$/.test(filePath)) return true
          if (/\/(slides|code|artifacts|notes|example-decks)\//.test(filePath)) return true
          return false
        }
      }
    },
    plugins: [react()],
    optimizeDeps: {
      include: ['@mdx-js/mdx', 'recma-mdx-escape-missing-components', 'style-to-object']
    },
    define: {
      'process.env.IS_PREACT': JSON.stringify(''),
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env': JSON.stringify({ NODE_ENV: 'production', IS_PREACT: '' }),
      'process.platform': JSON.stringify(''),
      'process.version': JSON.stringify('')
    }
  }
})
