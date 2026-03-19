import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { loadGeminiKey, loadOpenAIKey, loadImageProvider } from './env-loader'

export type ImageProvider = 'gemini' | 'openai'

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
    if (prov === 'gemini' || prov === 'openai') {
      this.provider = prov
    }
  }

  setProvider(provider: ImageProvider): void {
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
      model: 'gemini-2.5-flash',
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
      model: 'gemini-2.5-flash',
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

    const data = response.data[0]?.b64_json
    if (!data) throw new Error('No image returned from DALL-E')

    return { base64: data, mimeType: 'image/png' }
  }

  private async editWithOpenAI(prompt: string, _imageBase64: string, _imageMimeType: string): Promise<{ base64: string; mimeType: string }> {
    // DALL-E 3 doesn't support image editing directly, so we generate a new image from the prompt
    // describing the desired edit
    return this.generateWithOpenAI(`Edit the following image: ${prompt}`)
  }

  // --- Public API ---

  async generateImage(params: {
    prompt: string
    aspectRatio?: string
    imageSize?: string
    provider?: ImageProvider
  }): Promise<{ base64: string; mimeType: string }> {
    const prov = params.provider || this.provider
    if (prov === 'gemini') {
      return this.generateWithGemini(params.prompt)
    }
    return this.generateWithOpenAI(params.prompt, params.aspectRatio)
  }

  async editImage(params: {
    prompt: string
    imageBase64: string
    imageMimeType: string
    provider?: ImageProvider
  }): Promise<{ base64: string; mimeType: string }> {
    const prov = params.provider || this.provider
    if (prov === 'gemini') {
      return this.editWithGemini(params.prompt, params.imageBase64, params.imageMimeType)
    }
    return this.editWithOpenAI(params.prompt, params.imageBase64, params.imageMimeType)
  }

  async hasApiKey(provider?: ImageProvider): Promise<boolean> {
    const prov = provider || this.provider
    try {
      if (prov === 'gemini') {
        return !!(await loadGeminiKey(currentDeckPath ?? undefined))
      }
      return !!(await loadOpenAIKey(currentDeckPath ?? undefined))
    } catch {
      return false
    }
  }

  async getAvailableProviders(): Promise<{ id: ImageProvider; name: string; hasKey: boolean }[]> {
    const [hasGemini, hasOpenAI] = await Promise.all([
      this.hasApiKey('gemini'),
      this.hasApiKey('openai'),
    ])
    return [
      { id: 'openai', name: 'OpenAI DALL-E', hasKey: hasOpenAI },
      { id: 'gemini', name: 'Google Gemini', hasKey: hasGemini },
    ]
  }
}
