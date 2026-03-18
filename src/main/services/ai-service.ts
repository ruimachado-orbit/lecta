import Anthropic from '@anthropic-ai/sdk'
import { loadAnthropicKey } from './env-loader'
import { DEFAULT_AI_MODEL } from '../../../packages/shared/src/constants'

const SYSTEM_PROMPT = `You are a technical presentation coach helping a developer prepare speaker notes for a live technical talk.

For each slide, generate concise, actionable speaker notes with this structure:

1. **Opening** (1 sentence): How to introduce this slide naturally
2. **Key Points** (2-4 bullets): What to emphasize and explain
3. **Code Walkthrough** (if code is present): Talking points for the code, what to highlight
4. **Transition** (1 sentence): How to segue to the next topic

Rules:
- Keep notes concise and scannable — the presenter reads these while speaking
- Use the presenter's voice, not formal documentation tone
- Don't repeat what's already visible on the slide — add what the presenter should SAY
- For code, explain the WHY, not the WHAT (the audience can read the code)
- Include potential audience questions to anticipate`

let currentDeckPath: string | null = null

export class AIService {
  private client: Anthropic | null = null
  private model: string = DEFAULT_AI_MODEL

  setDeckPath(deckPath: string): void {
    currentDeckPath = deckPath
    this.client = null // Reset client so it reloads the key
  }

  setModel(model: string): void {
    this.model = model
  }

  private async getClient(): Promise<Anthropic> {
    if (this.client) return this.client

    const apiKey = await loadAnthropicKey(currentDeckPath ?? undefined)
    if (!apiKey) {
      throw new Error(
        'No Anthropic API key found. Add ANTHROPIC_API_KEY to your deck\'s .env file or configure it in Settings.'
      )
    }

    this.client = new Anthropic({ apiKey })
    return this.client
  }

  async generateNotes(
    slideContent: string,
    codeContent: string | null,
    deckTitle: string,
    slideIndex: number
  ): Promise<string> {
    const client = await this.getClient()

    let userMessage = `Deck: "${deckTitle}"\nSlide ${slideIndex + 1}:\n\n${slideContent}`
    if (codeContent) {
      userMessage += `\n\nAssociated code:\n\`\`\`\n${codeContent}\n\`\`\``
    }

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    return textBlock?.text ?? ''
  }

  async streamNotes(
    slideContent: string,
    codeContent: string | null,
    deckTitle: string,
    slideIndex: number,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const client = await this.getClient()

    let userMessage = `Deck: "${deckTitle}"\nSlide ${slideIndex + 1}:\n\n${slideContent}`
    if (codeContent) {
      userMessage += `\n\nAssociated code:\n\`\`\`\n${codeContent}\n\`\`\``
    }

    const stream = client.messages.stream({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        onChunk(event.delta.text)
      }
    }
  }
}
