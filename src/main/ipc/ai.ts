import { ipcMain, BrowserWindow } from 'electron'
import { getSharedAIService } from '../services/ai-singleton'

function getAIService() {
  return getSharedAIService()
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
      _event,
      slideContent: string,
      codeContent: string | null,
      deckTitle: string,
      slideIndex: number,
      responseChannel: string
    ): Promise<void> => {
      const service = getAIService()
      const window = BrowserWindow.getFocusedWindow()

      await service.streamNotes(
        slideContent,
        codeContent,
        deckTitle,
        slideIndex,
        (chunk: string) => {
          window?.webContents.send(responseChannel, chunk)
        }
      )

      // Signal completion
      window?.webContents.send(responseChannel, '[DONE]')
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
    async (): Promise<{ id: string; hasKey: boolean }[]> => {
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
      _event,
      prompt: string,
      slideContent: string,
      deckTitle: string,
      responseChannel: string
    ): Promise<void> => {
      const service = getAIService()
      const window = BrowserWindow.getFocusedWindow()

      await service.runPrompt(
        prompt,
        slideContent,
        deckTitle,
        (chunk: string) => {
          window?.webContents.send(responseChannel, chunk)
        }
      )

      window?.webContents.send(responseChannel, '[DONE]')
    }
  )

  ipcMain.handle(
    'ai:generate-full-presentation',
    async (
      _event,
      prompt: string,
      title: string,
      sourceContent: string | null,
      slideCount: number,
      progressChannel: string
    ): Promise<{ slides: { id: string; markdown: string; layout: string }[]; title: string }> => {
      const service = getAIService()
      const window = BrowserWindow.getFocusedWindow()

      console.log('[ai:generate-full-presentation] prompt length:', prompt.length, 'sourceContent length:', sourceContent?.length ?? 0, 'slideCount:', slideCount)
      try {
        const result = await service.generateFullPresentation(
          prompt,
          title,
          sourceContent,
          slideCount,
          (status: string, slideIndex: number, total: number) => {
            window?.webContents.send(progressChannel, { status, slideIndex, total })
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
        try {
          const { execFileSync } = await import('child_process')
          const { join } = await import('path')
          const { app } = await import('electron')
          const appPath = app.getAppPath()
          const projectRoot = appPath.endsWith('.asar')
            ? join(appPath, '..', '..')
            : appPath
          const script = [
            'const fs = require("fs");',
            'const path = require("path");',
            'const root = process.argv[1];',
            'const pdfjsLib = require(path.join(root, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs"));',
            'const workerPath = path.join(root, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");',
            'pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;',
            'async function main() {',
            '  const data = new Uint8Array(fs.readFileSync(process.argv[2]));',
            '  const doc = await pdfjsLib.getDocument({ data }).promise;',
            '  let text = "";',
            '  for (let i = 1; i <= doc.numPages; i++) {',
            '    const page = await doc.getPage(i);',
            '    const content = await page.getTextContent();',
            '    text += content.items.map(item => item.str).join(" ") + "\\n";',
            '  }',
            '  process.stdout.write(text);',
            '}',
            'main().catch(e => { process.stderr.write(e.message); process.exit(1); });'
          ].join('\n')
          const result = execFileSync('node', ['--eval', script, projectRoot, filePath], {
            maxBuffer: 10 * 1024 * 1024,
            timeout: 30000,
            encoding: 'utf-8'
          })
          return result.trim().slice(0, 50000)
        } catch (err) {
          console.error('[pdf] Error:', err instanceof Error ? err.message : err)
          return '[Could not read PDF file]'
        }
      }

      // For text-based files (md, txt, csv, json, etc.)
      const content = await readFile(filePath, 'utf-8')
      return content.slice(0, 50000)
    }
  )

  ipcMain.handle(
    'ai:stream-article',
    async (
      _event,
      deckTitle: string,
      author: string,
      slidesContent: { title: string; markdown: string; code: string | null; notes: string | null }[],
      rules: string,
      responseChannel: string
    ): Promise<void> => {
      const service = getAIService()
      const window = BrowserWindow.getFocusedWindow()

      await service.streamArticle(
        deckTitle,
        author,
        slidesContent,
        rules,
        (chunk: string) => {
          window?.webContents.send(responseChannel, chunk)
        }
      )

      window?.webContents.send(responseChannel, '[DONE]')
    }
  )
}
