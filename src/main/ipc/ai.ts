import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { getSharedAIService } from '../services/ai-singleton'
import { CANCELLED_MESSAGE } from '../services/ai/types'

function getAIService() {
  return getSharedAIService()
}

/**
 * In-flight AI requests, keyed by the webContents that asked. A window can have
 * several running at once (notes for one slide while an article streams), so
 * each id holds a set and `ai:cancel` stops all of that window's work — never
 * another window's.
 */
const inFlight = new Map<number, Set<AbortController>>()

/**
 * Run `work` under a fresh AbortController registered for this sender, so
 * `ai:cancel` can stop it. The controller is dropped when the work settles.
 */
export async function withCancellation<T>(
  event: IpcMainInvokeEvent,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const senderId = event.sender.id
  const controller = new AbortController()
  let controllers = inFlight.get(senderId)
  if (!controllers) {
    controllers = new Set()
    inFlight.set(senderId, controllers)
  }
  controllers.add(controller)
  try {
    return await work(controller.signal)
  } finally {
    controllers.delete(controller)
    if (controllers.size === 0) inFlight.delete(senderId)
  }
}

/** Abort everything the given window has in flight. Safe when nothing is running. */
export function cancelAIForSender(senderId: number): void {
  const controllers = inFlight.get(senderId)
  if (!controllers) return
  inFlight.delete(senderId)
  for (const controller of controllers) controller.abort()
}

/**
 * Send stream chunks back to the window that made the request — never to the
 * focused one, which may be the presenter window or another app entirely.
 */
function makeSender(event: IpcMainInvokeEvent, channel: string): (payload: unknown) => void {
  const sender: WebContents = event.sender
  return (payload: unknown): void => {
    if (sender.isDestroyed()) return
    sender.send(channel, payload)
  }
}

/**
 * Run a streaming handler so the renderer ALWAYS receives exactly one terminal
 * event (`[DONE]` or `[ERROR]…`), including when the handler throws.
 */
async function runStream(
  event: IpcMainInvokeEvent,
  channel: string,
  run: (emit: (chunk: string) => void, signal: AbortSignal) => Promise<unknown>
): Promise<void> {
  const send = makeSender(event, channel)
  let terminated = false
  const terminate = (payload: string): void => {
    if (terminated) return
    terminated = true
    send(payload)
  }

  let aborted = false
  try {
    await withCancellation(event, (signal) => {
      signal.addEventListener('abort', () => { aborted = true }, { once: true })
      return run((chunk: string) => {
        if (!terminated) send(chunk)
      }, signal)
    })
    terminate('[DONE]')
  } catch (err) {
    // A cancelled stream still gets exactly one terminal event, always 'Cancelled'.
    const msg = aborted ? CANCELLED_MESSAGE : err instanceof Error ? err.message : String(err)
    terminate(`[ERROR]${msg}`)
  }
}

const PDF_EXTRACTION_TIMEOUT_MS = 30_000

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}

/**
 * Extract text from a PDF with pdfjs running in this process. Shelling out to
 * `node` is not an option: packaged users have no Node on PATH, and a failure
 * must be a real error rather than a placeholder string fed to the model.
 */
async function extractPdfText(filePath: string): Promise<string> {
  const { readFile } = await import('fs/promises')
  const data = new Uint8Array(await readFile(filePath))

  let pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs')
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  } catch (err) {
    throw new Error(`PDF support is unavailable (pdfjs failed to load): ${(err as Error).message}`)
  }

  const doc = await pdfjs.getDocument({
    data,
    // No DOM in the main process, and no eval under the app's CSP posture.
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  }).promise

  try {
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
      )
      page.cleanup()
    }
    return pages.join('\n')
  } finally {
    await doc.destroy()
  }
}

export async function setAIDeckPath(deckPath: string): Promise<void> {
  await getAIService().setDeckPath(deckPath)
}

export function registerAiHandlers(): void {
  ipcMain.handle(
    'ai:generate-notes',
    async (
      event,
      slideContent: string,
      codeContent: string | null,
      deckTitle: string,
      slideIndex: number
    ): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.generateNotes(slideContent, codeContent, deckTitle, slideIndex, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:stream-notes',
    async (
      event,
      slideContent: string,
      codeContent: string | null,
      deckTitle: string,
      slideIndex: number,
      responseChannel: string
    ): Promise<void> => {
      const service = getAIService()
      await runStream(event, responseChannel, (emit, signal) =>
        service.streamNotes(slideContent, codeContent, deckTitle, slideIndex, emit, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:generate-slide-content',
    async (
      event,
      prompt: string,
      deckTitle: string,
      existingContent: string
    ): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.generateSlideContent(prompt, deckTitle, existingContent, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:generate-chart',
    async (
      event,
      prompt: string,
      deckTitle: string
    ): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) => service.generateSvgChart(prompt, deckTitle, signal))
    }
  )

  ipcMain.handle(
    'ai:beautify-slide',
    async (
      event,
      slideContent: string,
      deckTitle: string,
      slideLayout?: string
    ): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.beautifySlide(slideContent, deckTitle, slideLayout, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:generate-bulk-slides',
    async (
      event,
      prompt: string,
      deckTitle: string,
      existingSlides: string[],
      count: number,
      artifactContext?: string
    ): Promise<{ id: string; markdown: string }[]> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.generateBulkSlides(prompt, deckTitle, existingSlides, count, artifactContext, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:improve-slide',
    async (
      event,
      slideContent: string,
      deckTitle: string,
      userPrompt: string,
      artifactContext?: string
    ): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.improveSlide(slideContent, deckTitle, userPrompt, artifactContext, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:has-api-key',
    async (): Promise<boolean> => {
      const service = getAIService()
      return service.hasAnyApiKey()
    }
  )

  ipcMain.handle(
    'ai:get-provider-statuses',
    async () => {
      const service = getAIService()
      return service.getProviderStatuses()
    }
  )

  ipcMain.handle(
    'ai:set-model',
    async (_event, model: string): Promise<void> => {
      const service = getAIService()
      service.setModel(model)
    }
  )

  ipcMain.handle(
    'ai:generate-code',
    async (event, prompt: string, language: string, existingCode: string, deckTitle: string): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.generateCode(prompt, language, existingCode, deckTitle, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:generate-inline-text',
    async (
      event,
      prompt: string,
      slideContent: string,
      deckTitle: string
    ): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.generateInlineText(prompt, slideContent, deckTitle, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:run-prompt',
    async (
      event,
      prompt: string,
      slideContent: string,
      deckTitle: string,
      responseChannel: string
    ): Promise<void> => {
      const service = getAIService()
      await runStream(event, responseChannel, (emit, signal) =>
        service.runPrompt(prompt, slideContent, deckTitle, emit, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:generate-full-presentation',
    async (
      event,
      prompt: string,
      title: string,
      sourceContent: string | null,
      slideCount: number,
      progressChannel: string
    ): Promise<{ slides: { id: string; markdown: string; layout: string }[]; title: string }> => {
      const service = getAIService()
      const sendProgress = makeSender(event, progressChannel)

      console.log('[ai:generate-full-presentation] prompt length:', prompt.length, 'sourceContent length:', sourceContent?.length ?? 0, 'slideCount:', slideCount)
      try {
        const result = await withCancellation(event, (signal) =>
          service.generateFullPresentation(
            prompt,
            title,
            sourceContent,
            slideCount,
            (status: string, slideIndex: number, total: number) => {
              sendProgress({ status, slideIndex, total })
            },
            signal
          )
        )
        console.log('[ai:generate-full-presentation] result slides:', result.slides?.length ?? 0)
        return result
      } catch (err) {
        console.error('[ai:generate-full-presentation] error:', err)
        throw err
      }
    }
  )

  ipcMain.handle(
    'ai:read-source-file',
    async (_event, filePath: string): Promise<string> => {
      const { readFile } = await import('fs/promises')
      const ext = filePath.toLowerCase().split('.').pop()

      if (ext === 'pdf') {
        const text = await withTimeout(
          extractPdfText(filePath),
          PDF_EXTRACTION_TIMEOUT_MS,
          `Reading the PDF timed out after ${PDF_EXTRACTION_TIMEOUT_MS / 1000}s.`
        )
        return text.trim().slice(0, 50000)
      }

      // For text-based files (md, txt, csv, json, etc.)
      const content = await readFile(filePath, 'utf-8')
      return content.slice(0, 50000)
    }
  )

  ipcMain.handle(
    'ai:cancel',
    async (event): Promise<void> => {
      // Abort this window's SDK-backed request, then interrupt any Codex turn.
      cancelAIForSender(event.sender.id)
      await getAIService().cancelActiveGeneration()
    }
  )

  ipcMain.handle(
    'ai:ollama-models',
    async (): Promise<{ id: string; name: string }[]> => {
      const service = getAIService()
      return service.fetchOllamaModels()
    }
  )

  ipcMain.handle(
    'ai:stream-article',
    async (
      event,
      deckTitle: string,
      author: string,
      slidesContent: { title: string; markdown: string; code: string | null; notes: string | null }[],
      rules: string,
      responseChannel: string
    ): Promise<void> => {
      const service = getAIService()
      await runStream(event, responseChannel, (emit, signal) =>
        service.streamArticle(deckTitle, author, slidesContent, rules, emit, signal)
      )
    }
  )
}
