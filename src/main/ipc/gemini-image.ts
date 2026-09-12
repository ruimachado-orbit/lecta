import { ipcMain } from 'electron'
import { writeFile, readFile, readdir, stat, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { ImageGenerationService, isImageProvider, type ImageProvider } from '../services/gemini-image-service'
import { autoSave } from '../services/lecta-file'
import { assertInsideOpenDeck } from '../services/deck-roots'

/** Renderer input is untrusted: accept only known provider ids (undefined = current provider). */
function requireImageProvider(provider: unknown): ImageProvider | undefined {
  if (provider === undefined || provider === null || provider === '') return undefined
  if (!isImageProvider(provider)) throw new Error(`Unknown image provider "${String(provider)}"`)
  return provider
}

let imageService: ImageGenerationService | null = null

function getImageService(): ImageGenerationService {
  if (!imageService) {
    imageService = new ImageGenerationService()
  }
  return imageService
}

export async function setGeminiDeckPath(deckPath: string): Promise<void> {
  await getImageService().setDeckPath(deckPath)
}

export function registerGeminiImageHandlers(): void {
  // Generate an image from a text prompt and save to the workspace
  ipcMain.handle(
    'gemini:generate-image',
    async (
      _event,
      rootPath: string,
      prompt: string,
      aspectRatio?: string,
      imageSize?: string,
      provider?: ImageProvider
    ): Promise<string> => {
      const service = getImageService()
      const deckRoot = assertInsideOpenDeck(rootPath)
      const result = await service.generateImage({ prompt, aspectRatio, imageSize, provider: requireImageProvider(provider) })

      const ext = result.mimeType === 'image/jpeg' ? '.jpg' : '.png'
      const fileName = `${Date.now()}-ai-generated${ext}`
      const imagesDir = join(deckRoot, 'images')
      await mkdir(imagesDir, { recursive: true })

      const buffer = Buffer.from(result.base64, 'base64')
      await writeFile(join(imagesDir, fileName), buffer)

      await autoSave(deckRoot)

      return `images/${fileName}`
    }
  )

  // Edit an existing image with a text prompt
  ipcMain.handle(
    'gemini:edit-image',
    async (
      _event,
      rootPath: string,
      imagePath: string,
      prompt: string,
      aspectRatio?: string,
      imageSize?: string,
      provider?: ImageProvider
    ): Promise<string> => {
      const service = getImageService()
      const deckRoot = assertInsideOpenDeck(rootPath)
      const sourceImage = assertInsideOpenDeck(imagePath)

      const imageBuffer = await readFile(sourceImage)
      const imageBase64 = imageBuffer.toString('base64')

      const ext = extname(sourceImage).toLowerCase()
      const mimeMap: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp'
      }
      const imageMimeType = mimeMap[ext] || 'image/png'

      const result = await service.editImage({ prompt, imageBase64, imageMimeType, aspectRatio, provider: requireImageProvider(provider) })

      const outExt = result.mimeType === 'image/jpeg' ? '.jpg' : '.png'
      const fileName = `${Date.now()}-ai-edited${outExt}`
      const imagesDir = join(deckRoot, 'images')
      await mkdir(imagesDir, { recursive: true })

      const buffer = Buffer.from(result.base64, 'base64')
      await writeFile(join(imagesDir, fileName), buffer)

      await autoSave(deckRoot)

      return `images/${fileName}`
    }
  )

  // Check if an API key is available for the current or specified provider
  ipcMain.handle(
    'gemini:has-api-key',
    async (_event, provider?: ImageProvider): Promise<boolean> => {
      return getImageService().hasApiKey(requireImageProvider(provider))
    }
  )

  // Get available providers and their key status
  ipcMain.handle(
    'gemini:get-providers',
    async (): Promise<{ id: string; name: string; hasKey: boolean }[]> => {
      return getImageService().getAvailableProviders()
    }
  )

  // Get/set the current provider
  ipcMain.handle(
    'gemini:get-provider',
    async (): Promise<string> => {
      return getImageService().getProvider()
    }
  )

  ipcMain.handle(
    'gemini:set-provider',
    async (_event, provider: ImageProvider): Promise<void> => {
      const validated = requireImageProvider(provider)
      if (!validated) throw new Error('Image provider is required')
      getImageService().setProvider(validated)
    }
  )

  // List all images in the workspace's images/ directory
  ipcMain.handle(
    'gemini:list-images',
    async (_event, rootPath: string): Promise<{ relativePath: string; timestamp: number; size: number }[]> => {
      const imagesDir = join(assertInsideOpenDeck(rootPath), 'images')
      try {
        const files = await readdir(imagesDir)
        const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'])
        const results: { relativePath: string; timestamp: number; size: number }[] = []

        for (const file of files) {
          const ext = extname(file).toLowerCase()
          if (!imageExts.has(ext)) continue
          try {
            const fileStat = await stat(join(imagesDir, file))
            // Extract timestamp from filename (e.g. "1710872834-photo.png")
            const tsMatch = file.match(/^(\d+)-/)
            const timestamp = tsMatch ? parseInt(tsMatch[1]) : fileStat.mtimeMs
            results.push({
              relativePath: `images/${file}`,
              timestamp,
              size: fileStat.size,
            })
          } catch {
            // Skip unreadable files
          }
        }

        return results.sort((a, b) => b.timestamp - a.timestamp)
      } catch {
        return []
      }
    }
  )
}
