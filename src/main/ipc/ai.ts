import { ipcMain, BrowserWindow } from 'electron'
import { AIService } from '../services/ai-service'

let aiService: AIService | null = null

function getAIService(): AIService {
  if (!aiService) {
    aiService = new AIService()
  }
  return aiService
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
      deckTitle: string
    ): Promise<string> => {
      const service = getAIService()
      return service.beautifySlide(slideContent, deckTitle)
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
