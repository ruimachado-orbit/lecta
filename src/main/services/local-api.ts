import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { stringify as stringifyYaml } from 'yaml'
import { getCachedSettings } from '../ipc/settings'
import { getSharedAIService } from './ai-singleton'
import { addRecentItem } from '../ipc/file-system'

/**
 * Opt-in localhost REST API (Presenton-style generation API for a desktop app).
 *
 * - Binds 127.0.0.1 only — never exposed to the LAN.
 * - Bearer token, random per launch, shown in Settings; the token endpoint is
 *   the only credential and it never touches disk.
 * - Disabled by default; toggled with `localApiEnabled` in Settings.
 */

export const LOCAL_API_PORT = 4317
const MAX_BODY_BYTES = 1_000_000

const THEMES = ['dark', 'light', 'executive', 'minimal', 'corporate', 'creative', 'keynote-dark', 'paper']

const TONES = ['default', 'casual', 'professional', 'funny', 'educational', 'sales_pitch']
const VERBOSITIES = ['concise', 'standard', 'text-heavy']

let server: Server | null = null
let token = ''
let busy = false

export function isLocalApiRunning(): boolean {
  return server !== null
}

export function getLocalApiStatus(): { enabled: boolean; running: boolean; port: number; token: string } {
  const enabled = getCachedSettings().localApiEnabled === true
  return { enabled, running: server !== null, port: LOCAL_API_PORT, token: server ? token : '' }
}

/** Start/stop the server to match settings. Safe to call any time. */
export async function syncLocalApi(): Promise<void> {
  const enabled = getCachedSettings().localApiEnabled === true
  if (enabled && !server) startLocalApi()
  else if (!enabled && server) stopLocalApi()
}

export function startLocalApi(): void {
  if (server) return
  token = randomBytes(32).toString('hex')
  server = createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      console.error('[local-api] request failed:', err)
      sendJson(res, 500, { error: 'Internal error' })
    })
  })
  server.listen(LOCAL_API_PORT, '127.0.0.1', () => {
    console.log(`[local-api] listening on 127.0.0.1:${LOCAL_API_PORT}`)
  })
}

export function stopLocalApi(): void {
  token = ''
  const s = server
  server = null
  if (s) s.close()
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) })
  res.end(text)
}

function authorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization
  if (!header || !token) return false
  const m = /^Bearer (.+)$/.exec(header)
  if (!m) return false
  const a = Buffer.from(m[1])
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', 'http://127.0.0.1')

  if (req.method === 'GET' && url.pathname === '/v1/status') {
    sendJson(res, 200, { ok: true, busy })
    return
  }

  if (req.method === 'POST' && url.pathname === '/v1/presentations/generate') {
    if (!authorized(req)) {
      sendJson(res, 401, { error: 'Missing or invalid bearer token' })
      return
    }
    if (busy) {
      sendJson(res, 409, { error: 'Another generation is already running' })
      return
    }
    let body: Record<string, unknown>
    try {
      body = JSON.parse(await readBody(req)) as Record<string, unknown>
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' })
      return
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) {
      sendJson(res, 400, { error: 'prompt is required' })
      return
    }
    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 120)
      : prompt.slice(0, 60)
    const slideCount = Math.max(1, Math.min(50, typeof body.slideCount === 'number' ? Math.floor(body.slideCount) : 10))
    const tone = typeof body.tone === 'string' && TONES.includes(body.tone) ? body.tone : 'default'
    const verbosity = typeof body.verbosity === 'string' && VERBOSITIES.includes(body.verbosity) ? body.verbosity : 'standard'
    const theme = typeof body.theme === 'string' && THEMES.includes(body.theme) ? body.theme : 'dark'
    const language = typeof body.language === 'string' && body.language.trim().length > 0 && body.language.length <= 24
      ? body.language.trim()
      : undefined

    busy = true
    try {
      const service = getSharedAIService()
      const result = await service.generateFullPresentation(
        prompt,
        title,
        null,
        slideCount,
        () => {},
        undefined,
        { tone, verbosity, language }
      )
      if (!result.slides || result.slides.length === 0) {
        sendJson(res, 502, { error: 'The model returned no slides' })
        return
      }
      const rootPath = await writeGeneratedDeck(result.title || title, theme, result.slides)
      sendJson(res, 200, { path: rootPath, title: result.title || title, slideCount: result.slides.length })
    } catch (err) {
      sendJson(res, 502, { error: (err as Error).message })
    } finally {
      busy = false
    }
    return
  }

  sendJson(res, 404, { error: 'Not found' })
}

function slugify(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return `${slug || 'deck'}-${Date.now().toString(36)}`
}

/** Assemble a deck folder from generated slides (mirrors the wizard's renderer flow). */
async function writeGeneratedDeck(
  title: string,
  theme: string,
  slides: { id: string; markdown: string; layout: string }[]
): Promise<string> {
  const docsDir = join(homedir(), 'Documents', 'Lecta')
  await mkdir(docsDir, { recursive: true })
  const rootPath = join(docsDir, slugify(title))
  await mkdir(join(rootPath, 'slides'), { recursive: true })
  await mkdir(join(rootPath, 'code'), { recursive: true })

  const configs = []
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    const fileName = `${String(i + 1).padStart(2, '0')}-${slide.id}.md`
    await writeFile(join(rootPath, 'slides', fileName), slide.markdown, 'utf-8')
    configs.push({
      id: slide.id,
      content: `slides/${fileName}`,
      ...(slide.layout && slide.layout !== 'default' ? { layout: slide.layout } : {}),
      prompts: [],
      artifacts: [],
    })
  }

  await writeFile(
    join(rootPath, 'lecta.yaml'),
    stringifyYaml({ title, author: '', theme, slides: configs }),
    'utf-8'
  )

  const firstSlide = slides[0]?.markdown ?? ''
  await addRecentItem({
    path: rootPath,
    title,
    type: 'presentation',
    slideCount: slides.length,
    firstSlidePreview: firstSlide.slice(0, 200),
    artifacts: [],
    theme,
  })

  return rootPath
}
