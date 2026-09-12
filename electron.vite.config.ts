import { createReadStream, existsSync, mkdirSync, copyFileSync, statSync } from 'fs'
import { resolve, dirname, join, extname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin, ResolvedConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Runtimes that must work offline. They are copied out of node_modules into
 * `<renderer outDir>/runtimes/<name>/` at build time and served from the same
 * URL path by a dev middleware, so the renderer can always load them from
 * `new URL('runtimes/<name>/', document.baseURI)`.
 *
 * They deliberately do NOT live in `src/renderer/public` — that directory is
 * source-controlled and these are 30 MB of generated vendor assets.
 */
const RUNTIME_ASSETS: Record<string, { dir: string; files: string[] }> = {
  pyodide: {
    dir: resolve(__dirname, 'node_modules/pyodide'),
    files: [
      'pyodide.mjs',
      'pyodide.asm.js',
      'pyodide.asm.wasm',
      'pyodide-lock.json',
      'python_stdlib.zip'
    ]
  },
  sqljs: {
    dir: resolve(__dirname, 'node_modules/sql.js/dist'),
    files: ['sql-wasm.js', 'sql-wasm.wasm']
  }
}

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip'
}

function runtimeAssetsPlugin(): Plugin {
  let config: ResolvedConfig

  return {
    name: 'lecta-runtimes',
    configResolved(resolved) {
      config = resolved
    },

    // Dev: serve node_modules copies straight off disk at /runtimes/*
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        const match = /^\/runtimes\/([a-z]+)\/([A-Za-z0-9._-]+)$/.exec(url)
        if (!match) return next()

        const asset = RUNTIME_ASSETS[match[1]]
        if (!asset || !asset.files.includes(match[2])) return next()

        const file = join(asset.dir, match[2])
        if (!existsSync(file)) {
          res.statusCode = 404
          res.end(`runtime asset missing: ${match[1]}/${match[2]}`)
          return
        }

        res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream')
        res.setHeader('Content-Length', statSync(file).size)
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(file).pipe(res)
      })
    },

    // Build: copy into out/renderer/runtimes so the packaged app ships them
    closeBundle() {
      if (config.command !== 'build') return
      const outDir = resolve(config.root, config.build.outDir)

      for (const [name, asset] of Object.entries(RUNTIME_ASSETS)) {
        const target = join(outDir, 'runtimes', name)
        mkdirSync(target, { recursive: true })
        for (const file of asset.files) {
          const from = join(asset.dir, file)
          if (!existsSync(from)) {
            this.warn(`runtime asset not found, skipping: ${from}`)
            continue
          }
          copyFileSync(from, join(target, file))
        }
      }
    }
  }
}

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
    plugins: [react(), runtimeAssetsPlugin()],
    optimizeDeps: {
      include: ['@mdx-js/mdx', 'recma-mdx-escape-missing-components', 'style-to-object']
    },
    worker: {
      // Monaco's language workers are emitted as classic worker chunks so they
      // load under file:// as well as the dev server.
      format: 'iife'
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Monaco is ~4 MB; keep it out of the entry chunk.
            monaco: ['monaco-editor']
          }
        }
      }
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
