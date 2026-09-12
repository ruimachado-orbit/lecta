import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { getSharedAIService } from '../services/ai-singleton'

function getAIService() {
  return getSharedAIService()
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
  run: (emit: (chunk: string) => void) => Promise<unknown>
): Promise<void> {
  const send = makeSender(event, channel)
  let terminated = false
  const terminate = (payload: string): void => {
    if (terminated) return
    terminated = true
    send(payload)
  }

  try {
    await run((chunk: string) => {
      if (!terminated) send(chunk)
    })
    terminate('[DONE]')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
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
      _event,
      slideContent: string,
      codeContent: string | null,
      deckTitle: string,
      slideIndex: number
    ): Promise<string> => {
      const service = getAIService()
      return service.generateNotes(slideContent, codeContent, deckTitle, slideIndex)
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
      await runStream(event, responseChannel, (emit) =>
        service.streamNotes(slideContent, codeContent, deckTitle, slideIndex, emit)
      )
    }
  )

  ipcMain.handle(
    'ai:generate-slide-content',
    async (
      _event,
      prompt: string,
      deckTitle: string,
      existingContent: string
    ): Promise<string> => {
      const service = getAIService()
      return service.generateSlideContent(prompt, deckTitle, existingContent)
    }
  )

  ipcMain.handle(
    'ai:generate-chart',
    async (
      _event,
      prompt: string,
      deckTitle: string
    ): Promise<string> => {
      const service = getAIService()
      return service.generateSvgChart(prompt, deckTitle)
    }
  )

  ipcMain.handle(
    'ai:beautify-slide',
    async (
      _event,
      slideContent: string,
      deckTitle: string,
      slideLayout?: string
    ): Promise<string> => {
      const service = getAIService()
      return service.beautifySlide(slideContent, deckTitle, slideLayout)
    }
  )

  ipcMain.handle(
    'ai:generate-bulk-slides',
    async (
      _event,
      prompt: string,
      deckTitle: string,
      existingSlides: string[],
      count: number,
      artifactContext?: string
    ): Promise<{ id: string; markdown: string }[]> => {
      const service = getAIService()
      return service.generateBulkSlides(prompt, deckTitle, existingSlides, count, artifactContext)
    }
  )

  ipcMain.handle(
    'ai:improve-slide',
    async (
      _event,
      slideContent: string,
      deckTitle: string,
      userPrompt: string,
      artifactContext?: string
    ): Promise<string> => {
      const service = getAIService()
      return service.improveSlide(slideContent, deckTitle, userPrompt, artifactContext)
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
    async (_event, prompt: string, language: string, existingCode: string, deckTitle: string): Promise<string> => {
      const service = getAIService()
      return service.generateCode(prompt, language, existingCode, deckTitle)
    }
  )

  ipcMain.handle(
    'ai:generate-inline-text',
    async (
      _event,
      prompt: string,
      slideContent: string,
      deckTitle: string
    ): Promise<string> => {
      const service = getAIService()
      return service.generateInlineText(prompt, slideContent, deckTitle)
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
      await runStream(event, responseChannel, (emit) =>
        service.runPrompt(prompt, slideContent, deckTitle, emit)
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
        const result = await service.generateFullPresentation(
          prompt,
          title,
          sourceContent,
          slideCount,
          (status: string, slideIndex: number, total: number) => {
            sendProgress({ status, slideIndex, total })
          }
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
    async (): Promise<void> => {
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
      await runStream(event, responseChannel, (emit) =>
        service.streamArticle(deckTitle, author, slidesContent, rules, emit)
      )
    }
  )
}
