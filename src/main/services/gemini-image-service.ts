import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { loadGeminiKey, loadOpenAIKey, loadImageProvider, loadOpenAIAuthMode } from './env-loader'
import { getCodexAppServerClient } from './codex-app-server-client'

export type ImageProvider = 'gemini' | 'openai' | 'codex'

export const IMAGE_PROVIDERS: readonly ImageProvider[] = ['openai', 'codex', 'gemini']

export function isImageProvider(value: unknown): value is ImageProvider {
  return typeof value === 'string' && (IMAGE_PROVIDERS as readonly string[]).includes(value)
}

/** Gemini model with native image output ("Nano Banana"). Text-only Gemini models return 400 for IMAGE modality. */
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'

let currentDeckPath: string | null = null

export class ImageGenerationService {
  private geminiClient: GoogleGenAI | null = null
  private openaiClient: OpenAI | null = null
  private provider: ImageProvider = 'openai'

  async setDeckPath(deckPath: string): Promise<void> {
    currentDeckPath = deckPath
    this.geminiClient = null
    this.openaiClient = null

    const prov = await loadImageProvider(deckPath)
    // Legacy 'nanobanana' settings values are tolerated and fall back to the default provider.
    if (isImageProvider(prov)) {
      this.provider = prov
    }
  }

  setProvider(provider: ImageProvider): void {
    if (!isImageProvider(provider)) {
      throw new Error(`Unknown image provider "${String(provider)}"`)
    }
    this.provider = provider
  }

  getProvider(): ImageProvider {
    return this.provider
  }

  // --- Gemini ---

  private async getGeminiClient(): Promise<GoogleGenAI> {
    if (this.geminiClient) return this.geminiClient
    const apiKey = await loadGeminiKey(currentDeckPath ?? undefined)
    if (!apiKey) {
      throw new Error('No Gemini API key found. Add GEMINI_API_KEY to your .env file.')
    }
    this.geminiClient = new GoogleGenAI({ apiKey })
    return this.geminiClient
  }

  private async generateWithGemini(prompt: string): Promise<{ base64: string; mimeType: string }> {
    const ai = await this.getGeminiClient()

    const response = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: prompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      }
    })

    const parts = response.candidates?.[0]?.content?.parts
    if (!parts) throw new Error('No content in Gemini response')

    for (const part of parts) {
      if (part.inlineData) {
        return { base64: part.inlineData.data!, mimeType: part.inlineData.mimeType || 'image/png' }
      }
    }
    throw new Error('No image was generated. The model may have declined the request.')
  }

  private async editWithGemini(prompt: string, imageBase64: string, imageMimeType: string): Promise<{ base64: string; mimeType: string }> {
    const ai = await this.getGeminiClient()

    const response = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: imageMimeType, data: imageBase64 } }
          ]
        }
      ],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      }
    })

    const parts = response.candidates?.[0]?.content?.parts
    if (!parts) throw new Error('No content in Gemini edit response')

    for (const part of parts) {
      if (part.inlineData) {
        return { base64: part.inlineData.data!, mimeType: part.inlineData.mimeType || 'image/png' }
      }
    }
    throw new Error('No edited image was generated.')
  }

  // --- OpenAI DALL-E ---

  private async getOpenAIClient(): Promise<OpenAI> {
    if (this.openaiClient) return this.openaiClient
    const apiKey = await loadOpenAIKey(currentDeckPath ?? undefined)
    if (!apiKey) {
      throw new Error('No OpenAI API key found. Add OPENAI_API_KEY to your .env file.')
    }
    this.openaiClient = new OpenAI({ apiKey })
    return this.openaiClient
  }

  private async generateWithOpenAI(prompt: string, size?: string): Promise<{ base64: string; mimeType: string }> {
    const client = await this.getOpenAIClient()

    // Map size to DALL-E sizes
    const sizeMap: Record<string, '1024x1024' | '1792x1024' | '1024x1792'> = {
      '1:1': '1024x1024',
      '16:9': '1792x1024',
      '9:16': '1024x1792',
    }
    const dalleSize = sizeMap[size || '16:9'] || '1792x1024'

    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: dalleSize,
      response_format: 'b64_json',
    })

    const data = response.data?.[0]?.b64_json
    if (!data) throw new Error('No image returned from DALL-E')

    return { base64: data, mimeType: 'image/png' }
  }

  private async editWithOpenAI(prompt: string, _imageBase64: string, _imageMimeType: string): Promise<{ base64: string; mimeType: string }> {
    // DALL-E 3 doesn't support image editing directly, so we generate a new image from the prompt
    // describing the desired edit
    return this.generateWithOpenAI(`Edit the following image: ${prompt}`)
  }

  // --- Codex app-server image generation ---

  private async generateWithCodex(prompt: string, aspectRatio?: string): Promise<{ base64: string; mimeType: string }> {
    return getCodexAppServerClient().generateImage({
      prompt,
      aspectRatio,
    })
  }

  private async editWithCodex(prompt: string, imageBase64: string, imageMimeType: string, aspectRatio?: string): Promise<{ base64: string; mimeType: string }> {
    return getCodexAppServerClient().generateImage({
      prompt,
      aspectRatio,
      imageBase64,
      imageMimeType,
    })
  }

  /**
   * Spawning the Codex CLI is only acceptable when the user has actually
   * selected it (as image provider or as OpenAI auth mode).
   */
  private async shouldProbeCodex(): Promise<boolean> {
    if (this.provider === 'codex') return true
    return (await loadOpenAIAuthMode()) === 'codex'
  }

  // --- Public API ---

  async generateImage(params: {
    prompt: string
    aspectRatio?: string
    imageSize?: string
    provider?: ImageProvider
  }): Promise<{ base64: string; mimeType: string }> {
    const prov = params.provider || this.provider
    if (!isImageProvider(prov)) throw new Error(`Unknown image provider "${String(prov)}"`)
    if (prov === 'gemini') {
      return this.generateWithGemini(params.prompt)
    }
    if (prov === 'codex') {
      return this.generateWithCodex(params.prompt, params.aspectRatio)
    }
    return this.generateWithOpenAI(params.prompt, params.aspectRatio)
  }

  async editImage(params: {
    prompt: string
    imageBase64: string
    imageMimeType: string
    aspectRatio?: string
    provider?: ImageProvider
  }): Promise<{ base64: string; mimeType: string }> {
    const prov = params.provider || this.provider
    if (!isImageProvider(prov)) throw new Error(`Unknown image provider "${String(prov)}"`)
    if (prov === 'gemini') {
      return this.editWithGemini(params.prompt, params.imageBase64, params.imageMimeType)
    }
    if (prov === 'codex') {
      return this.editWithCodex(params.prompt, params.imageBase64, params.imageMimeType, params.aspectRatio)
    }
    return this.editWithOpenAI(params.prompt, params.imageBase64, params.imageMimeType)
  }

  async hasApiKey(provider?: ImageProvider): Promise<boolean> {
    const prov = provider || this.provider
    try {
      if (prov === 'gemini') {
        return !!(await loadGeminiKey(currentDeckPath ?? undefined))
      }
      if (prov === 'codex') {
        if (!(await this.shouldProbeCodex())) return false
        const account = await getCodexAppServerClient().accountRead(false)
        return account.account?.type === 'chatgpt'
      }
      if (prov === 'openai') {
        return !!(await loadOpenAIKey(currentDeckPath ?? undefined))
      }
      return false
    } catch {
      return false
    }
  }

  async getAvailableProviders(): Promise<{ id: ImageProvider; name: string; hasKey: boolean }[]> {
    const [hasGemini, hasOpenAI, hasCodex] = await Promise.all([
      this.hasApiKey('gemini'),
      this.hasApiKey('openai'),
      this.hasApiKey('codex'),
    ])
    return [
      { id: 'openai', name: 'OpenAI DALL-E', hasKey: hasOpenAI },
      { id: 'codex', name: 'Codex / ChatGPT Images', hasKey: hasCodex },
      { id: 'gemini', name: 'Google Gemini (Nano Banana)', hasKey: hasGemini },
    ]
  }
}
