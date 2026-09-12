#!/usr/bin/env node
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const repo = '/Users/ruimachado/Code/lecta'
const shotDir = process.env.SHOT_DIR || join(tmpdir(), 'lecta-shots')
const electronBin = join(repo, 'node_modules', '.bin', 'electron')
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const work = mkdtempSync(join(tmpdir(), 'lecta-sec2-'))
const home = join(work, 'home')
const deck = join(work, 'deck')
mkdirSync(shotDir, { recursive: true })
cpSync(join(repo, 'example-decks', 'hello-world'), deck, { recursive: true })
const userData = join(home, 'Library', 'Application Support', 'Lecta')
mkdirSync(userData, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({
  theme: 'dark',
  recentDecks: [{ path: deck, title: 'Hello Lecta', date: new Date().toISOString(), type: 'presentation', slideCount: 7, firstSlidePreview: 'Welcome', artifacts: [] }]
}))

let app
try {
  app = await electron.launch({
    executablePath: electronBin,
    args: ['--disable-gpu', repo],
    cwd: repo,
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    timeout: 90_000
  })
  const win = await app.firstWindow({ timeout: 90_000 })
  win.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)))
  await win.setViewportSize({ width: 1500, height: 950 })
  await win.waitForTimeout(3000)
  if (await win.locator('text=Skip for now').count()) {
    await win.locator('text=Skip for now').click()
    await win.waitForTimeout(800)
  }
  await win.locator('text=Hello Lecta').first().click({ timeout: 15_000 })
  await win.waitForTimeout(3000)

  const para = win.locator('.slide-content p').first()
  await para.hover({ timeout: 10_000 })
  await win.waitForTimeout(500)
  await win.screenshot({ path: join(shotDir, 'block-chrome.png') })
  const delBtns = await win.locator('button[title="Delete block (⌫)"]').count()
  check('hover delete on block', delBtns > 0, `found=${delBtns}`)

  const h1 = win.locator('.slide-content h1').first()
  await h1.hover({ timeout: 10_000 })
  await win.waitForTimeout(400)
  const chip = win.locator('button[title^="Select section:"]').first()
  if (await chip.count()) {
    await chip.click({ timeout: 10_000 })
    await win.waitForTimeout(600)
  }
  const beforeCount = await win.locator('.slide-content h1, .slide-content h2').count()
  const addAfter = win.locator('aside button[title="Add section after this one"]').first()
  if (await addAfter.count()) {
    await addAfter.click({ timeout: 10_000 })
    await win.waitForTimeout(1500)
    const afterCount = await win.locator('.slide-content h1, .slide-content h2').count()
    check('add section after', afterCount === beforeCount + 1, `${beforeCount} → ${afterCount}`)
  } else check('panel add-section button', false)
  await win.screenshot({ path: join(shotDir, 'section-add.png') })

  const headings = win.locator('.slide-content h1, .slide-content h2')
  const n = await headings.count()
  await headings.nth(n - 1).hover({ timeout: 10_000 })
  await win.waitForTimeout(400)
  const del = win.locator('button[title="Delete block (⌫)"]').first()
  if (await del.count()) {
    await del.click({ timeout: 10_000, force: true })
    await win.waitForTimeout(1500)
    const afterDel = await win.locator('.slide-content h1, .slide-content h2').count()
    check('per-block delete removes it', afterDel === n - 1, `${n} → ${afterDel}`)
  } else check('per-block delete button', false)
} catch (err) {
  check('harness', false, String(err?.message || err))
} finally {
  if (app) await app.close().catch(() => {})
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
