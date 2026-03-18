import Anthropic from '@anthropic-ai/sdk'
import { loadAnthropicKey, loadAnthropicModel } from './env-loader'
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

  async setDeckPath(deckPath: string): Promise<void> {
    currentDeckPath = deckPath
    this.client = null // Reset client so it reloads the key

    const envModel = await loadAnthropicModel(deckPath)
    if (envModel) {
      this.model = envModel
    }
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

  async generateSlideContent(
    prompt: string,
    deckTitle: string,
    existingContent: string
  ): Promise<string> {
    const client = await this.getClient()

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: `You are a technical presentation content generator. Generate markdown content for presentation slides.

Rules:
- Output ONLY valid markdown, no explanations or wrapping
- Use headings (#, ##, ###), bullet points, bold, italic, code blocks as appropriate
- Keep content concise and visual — slides should not be walls of text
- For charts: generate a markdown table representation of the data
- For diagrams: use a text-based diagram with ASCII art or a clear structured description
- Match the style and tone of the existing presentation`,
      messages: [
        {
          role: 'user',
          content: `Deck: "${deckTitle}"\n\nExisting slide content:\n${existingContent}\n\nRequest: ${prompt}`
        }
      ]
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    return textBlock?.text ?? ''
  }

  async generateSvgChart(
    prompt: string,
    deckTitle: string
  ): Promise<string> {
    const client = await this.getClient()

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: `You are an SVG chart/diagram generator for technical presentations.

Rules:
- Output ONLY a valid SVG element, nothing else — no markdown, no explanation, no wrapping
- Use a dark theme: background transparent, text #e2e8f0, lines/fills using indigo (#818cf8, #6366f1), green (#4ade80), amber (#fbbf24), red (#f87171)
- SVG width should be 600, height 400
- Include clear labels, axes, and legends where appropriate
- Supported chart types: bar, line, pie, flow diagram, architecture diagram, timeline
- Make it clean and readable for a presentation`,
      messages: [
        {
          role: 'user',
          content: `Deck: "${deckTitle}"\n\nGenerate an SVG chart/diagram: ${prompt}`
        }
      ]
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    return textBlock?.text ?? ''
  }

  async beautifySlide(
    slideContent: string,
    deckTitle: string
  ): Promise<string> {
    const client = await this.getClient()

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: `You are a professional presentation designer. Your job is to take rough slide markdown and transform it into polished, professional-quality presentation content.

Rules:
- Output ONLY the improved markdown, nothing else
- Improve structure: use clear headings, concise bullet points, proper hierarchy
- Improve readability: shorten verbose text, use bold for emphasis, add line breaks
- Improve visual balance: ensure content isn't too dense or too sparse
- Add markdown formatting: tables where data is compared, code blocks for technical terms
- Keep the same meaning and information — just make it look professional
- Use consistent formatting throughout
- Remove filler words and redundancy
- If content is already good, make only minor improvements`,
      messages: [
        {
          role: 'user',
          content: `Deck: "${deckTitle}"\n\nSlide content to beautify:\n\n${slideContent}`
        }
      ]
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    return textBlock?.text ?? ''
  }

  async generateBulkSlides(
    prompt: string,
    deckTitle: string,
    existingSlides: string[],
    count: number,
    artifactContext?: string
  ): Promise<{ id: string; markdown: string }[]> {
    const client = await this.getClient()

    const existingContext = existingSlides.length > 0
      ? `\n\nExisting slides in this deck:\n${existingSlides.map((s, i) => `--- Slide ${i + 1} ---\n${s}`).join('\n\n')}`
      : ''

    const artifactInfo = artifactContext
      ? `\n\nArtifact/resource context to incorporate:\n${artifactContext}`
      : ''

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 4096 * 2,
      system: `You are a technical presentation generator. Generate slide content as a JSON array.

Rules:
- Output ONLY a valid JSON array, no markdown wrapping, no explanation
- Each element: { "id": "kebab-case-id", "markdown": "# Title\\n\\ncontent..." }
- Generate exactly ${count} slides
- Each slide should have a clear heading (#) and concise content
- Content should flow logically from slide to slide
- Use markdown: headings, bullets, bold, code blocks, tables as needed
- Keep each slide focused on one key point
- If existing slides are provided, continue from where they left off — don't repeat
- If artifact context is provided, create slides that explain/discuss that content`,
      messages: [
        {
          role: 'user',
          content: `Deck: "${deckTitle}"\nGenerate ${count} slides.${existingContext}${artifactInfo}\n\nTopic/instructions: ${prompt}`
        }
      ]
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    const raw = textBlock?.text ?? '[]'

    try {
      // Extract JSON from potential markdown wrapping
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      return JSON.parse(jsonMatch?.[0] ?? '[]')
    } catch {
      return [{ id: 'generated', markdown: raw }]
    }
  }

  async improveSlide(
    slideContent: string,
    deckTitle: string,
    userPrompt: string,
    artifactContext?: string
  ): Promise<string> {
    const client = await this.getClient()

    const artifactInfo = artifactContext
      ? `\n\nArtifact context:\n${artifactContext}`
      : ''

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: `You are a presentation slide editor. Improve a slide based on the user's instructions.

Rules:
- Output ONLY the improved markdown, nothing else
- Apply the user's requested changes
- Maintain consistent style with the rest of the deck
- Keep it concise and presentation-ready`,
      messages: [
        {
          role: 'user',
          content: `Deck: "${deckTitle}"\n\nCurrent slide:\n${slideContent}${artifactInfo}\n\nImprove this slide: ${userPrompt}`
        }
      ]
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    return textBlock?.text ?? ''
  }

  async streamArticle(
    deckTitle: string,
    author: string,
    slidesContent: { title: string; markdown: string; code: string | null; notes: string | null }[],
    rules: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const client = await this.getClient()

    const slidesContext = slidesContent
      .map(
        (s, i) =>
          `--- Slide ${i + 1}: ${s.title} ---\n${s.markdown}${s.code ? `\n\nCode:\n\`\`\`\n${s.code}\n\`\`\`` : ''}${s.notes ? `\n\nSpeaker notes:\n${s.notes}` : ''}`
      )
      .join('\n\n')

    const userRules = rules.trim()
      ? `\n\nAdditional rules from the author:\n${rules}`
      : ''

    const stream = client.messages.stream({
      model: this.model,
      max_tokens: 8192,
      system: `You are an expert technical writer. Your task is to transform a technical presentation into a well-structured, publication-ready article.

Rules:
- Output ONLY the article in markdown format, no meta-commentary or wrapping
- The article should read as a standalone piece — not as a transcript of slides
- Synthesize slide content into flowing prose with clear sections and transitions
- Preserve all technical accuracy: code snippets, data, and terminology
- Include code blocks from the presentation where they add value to the article
- Use proper markdown: headings (##, ###), code blocks, bold, bullet points, blockquotes
- Add an introduction that sets context and a conclusion that summarizes key takeaways
- The tone should be professional yet approachable — like a high-quality technical blog post
- Credit the author naturally if appropriate
- Speaker notes contain what the presenter would SAY — use them to enrich explanations and add depth that slides alone lack`,
      messages: [
        {
          role: 'user',
          content: `Presentation: "${deckTitle}"\nAuthor: ${author}\n\nFull presentation content:\n\n${slidesContext}${userRules}\n\nTransform this presentation into a complete article.`
        }
      ]
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
