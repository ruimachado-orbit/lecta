import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'deviant-portsmouth-fighter-petition.trycloudflare.com',
      '*.trycloudflare.com'
    ],
    hmr: {
      protocol: 'https',
      host: 'deviant-portsmouth-fighter-petition.trycloudflare.com',
      port: 443
    }
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'packages/shared/src'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  }
})
