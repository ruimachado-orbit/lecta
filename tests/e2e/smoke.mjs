#!/usr/bin/env node
/**
 * Packaged-app smoke test.
 *
 * Launches the built Electron app (run `bun run build` first) under a fresh
 * HOME, opens a copy of the bundled hello-world deck and exercises the
 * paths that were broken in 0.1.2: the JavaScript sandbox, the bundled
 * Monaco editor, the SQL engine, native-execution gating, and the CSP.
 *
 * Usage:  xvfb-run -a node tests/e2e/smoke.mjs        (Linux CI)
 *         node tests/e2e/smoke.mjs                    (desktop)
 * Exit code 0 = all checks passed.
 */
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, cpSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')
const electronBin = join(repo, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron')
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0

if (!existsSync(join(repo, 'out', 'main', 'index.js'))) {
  console.error('out/main/index.js missing — run `bun run build` first')
  process.exit(2)
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const work = mkdtempSync(join(tmpdir(), 'lecta-e2e-'))
const home = join(work, 'home')
const deck = join(work, 'deck')
cpSync(join(repo, 'example-decks', 'hello-world'), deck, { recursive: true })
const userData = process.platform === 'darwin' ? join(home, 'Library', 'Application Support', 'Lecta') : join(home, '.config', 'Lecta')
mkdirSync(userData, { recursive: true })
writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({
    theme: 'dark',
    nativeExecutionEnabled: false,
    recentDecks: [{ path: deck, title: 'Hello Lecta', date: new Date().toISOString(), type: 'presentation', slideCount: 7, firstSlidePreview: 'Welcome', artifacts: [] }]
  })
)

const consoleErrors = []
let app
try {
  app = await electron.launch({
    executablePath: electronBin,
    args: [...(isRoot ? ['--no-sandbox'] : []), '--disable-gpu', repo],
    cwd: repo,
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    timeout: 90_000
  })
  const win = await app.firstWindow({ timeout: 90_000 })
  win.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  win.on('pageerror', (e) => consoleErrors.push(`PAGEERROR ${e.message}`))
  await win.setViewportSize({ width: 1440, height: 900 })
  await win.waitForTimeout(2500)

  // Open the deck from Recents
  await win.locator('text=Hello Lecta').first().click({ timeout: 10_000 })
  await win.waitForTimeout(2500)
  const body = await win.innerText('body')
  check('deck opens', body.includes('Slide 1 of'), body.slice(0, 80).replace(/\n/g, ' | '))

  // Jump to slides via the navigator thumbnails (the welcome slide has sub-slides, so arrow keys are not reliable)
  const goTo = async (label) => {
    await win.locator(`text=${label}`).first().click({ timeout: 10_000 })
    await win.waitForTimeout(900)
  }
  await goTo('2. javascript-demo')
  const expand = win.locator('[title="Expand panel"]')
  if (await expand.count()) await expand.first().click().catch(() => {})
  await win.waitForTimeout(1500)
  const monacoLoaded = (await win.locator('.monaco-editor').count()) > 0
  check('Monaco editor bundled (no CDN)', monacoLoaded)

  // Run JavaScript
  await win.keyboard.press('Control+Enter')
  await win.waitForFunction(() => document.body.innerText.includes('Hello from Lecta!') || document.body.innerText.includes('timed out'), null, { timeout: 20_000 }).catch(() => {})
  const afterJs = await win.innerText('body')
  check('JavaScript sandbox runs and returns output', afterJs.includes('Hello from Lecta!') && afterJs.includes('engines ready'))
  check('no CSP violation during JS run', !consoleErrors.some((e) => /Content-Security-Policy|Refused to execute/.test(e)), consoleErrors.find((e) => /Refused/.test(e)) || '')

  // Python: bundled Pyodide (no jsdelivr fetch)
  await goTo('3. python-demo')
  await win.keyboard.press('Control+Enter')
  await win.waitForFunction(() => /Python 3\.|Failed to|error/i.test(document.body.innerText), null, { timeout: 60_000 }).catch(() => {})
  const afterPy = await win.innerText('body')
  check('Python (Pyodide) runs from bundled runtime', /Python 3\./.test(afterPy), afterPy.includes('cdn.jsdelivr') ? 'still loading from CDN' : '')

  // SQL
  await goTo('4. sql-demo')
  await win.keyboard.press('Control+Enter')
  await win.waitForFunction(() => /author|post_count|Failed to|error/i.test(document.body.innerText), null, { timeout: 30_000 }).catch(() => {})
  const afterSql = await win.innerText('body')
  check('SQL (sql.js) runs from bundled runtime', /post_count|total_views/.test(afterSql), afterSql.includes('Failed to load sql.js') ? 'sql.js failed to load' : '')

  // Native with the toggle OFF must be refused
  await goTo('5. native-demo')
  await win.keyboard.press('Control+Enter')
  await win.waitForTimeout(3000)
  const afterNative = await win.innerText('body')
  check('native execution refused while disabled in Settings', !afterNative.includes('This code ran natively') && /native execution|disabled|Settings/i.test(afterNative))

  check('no uncaught renderer errors', !consoleErrors.some((e) => e.startsWith('PAGEERROR')), consoleErrors.filter((e) => e.startsWith('PAGEERROR')).join('; ').slice(0, 200))
} catch (err) {
  check('harness', false, String(err && err.message ? err.message : err))
} finally {
  if (app) await app.close().catch(() => {})
  rmSync(work, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
