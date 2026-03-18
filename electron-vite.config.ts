import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
    plugins: [react(), tailwindcss()]
  }
})
