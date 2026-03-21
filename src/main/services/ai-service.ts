import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import { loadAnthropicKey, loadOpenAIKey, loadGeminiKey, loadAIModel, loadProviderKey, getProviderKeySource } from './env-loader'
import { DEFAULT_AI_MODEL, getProviderForModel, type AIProviderID } from '../../../packages/shared/src/constants'
import type { PresentationSnapshot, ChatStreamEvent } from '../../../packages/shared/src/types/chat'
import { getToolSchemas, findTool, type ToolExecutionContext } from './chat-agent-tools'

const SLIDE_7x7_RULE = `
SLIDE CANVAS: 1280×720px with 80px horizontal / 60px vertical padding.
Usable content area: ~1100×600px. Content must NOT fill the entire area — leave breathing room.

MANDATORY 7×7 RULE — NEVER VIOLATE:
1. EXACTLY ONE # heading per slide (the title, max 7 words)
2. Maximum 7 bullet points below the heading
3. Each bullet: maximum 7 words — NO EXCEPTIONS
4. NO paragraphs, NO long sentences, NO explanations
5. Every line is a "- " bullet (not a sentence)
6. Use **bold** on 1-2 key words per bullet only
7. If you need more content, create another slide — NEVER exceed 7 bullets

WRONG (too long):
- Retrieval-Augmented Generation combines document retrieval with generative AI models
RIGHT (7 words max):
- **RAG** combines retrieval with generation`

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

// Unified generation result
interface GenerationResult {
  text: string
}

export class AIService {
  private anthropicClient: Anthropic | null = null
  private openaiClient: OpenAI | null = null
  private geminiClient: GoogleGenAI | null = null
  private openaiCompatClients: Map<string, OpenAI> = new Map() // Mistral, Meta, xAI, Perplexity
  private model: string = DEFAULT_AI_MODEL

  async setDeckPath(deckPath: string): Promise<void> {
    currentDeckPath = deckPath
    // Reset all clients so they reload keys
    this.anthropicClient = null
    this.openaiClient = null
    this.geminiClient = null
    this.openaiCompatClients.clear()

    const envModel = await loadAIModel(deckPath)
    if (envModel) {
      this.model = envModel
    }
  }

  setModel(model: string): void {
    this.model = model
    // Reset clients when model changes to a different provider
    this.anthropicClient = null
    this.openaiClient = null
    this.geminiClient = null
    this.openaiCompatClients.clear()
  }

  private getProviderForCurrentModel(): AIProviderID {
    const provider = getProviderForModel(this.model)
    // If not found in static providers, assume it's an Ollama model
    return provider?.id ?? 'ollama'
  }

  // ── Provider clients ──

  private async getAnthropicClient(): Promise<Anthropic> {
    if (this.anthropicClient) return this.anthropicClient
    const apiKey = await loadAnthropicKey(currentDeckPath ?? undefined)
    if (!apiKey) {
      throw new Error('No Anthropic API key found. Add ANTHROPIC_API_KEY to your deck\'s .env file or configure it in Settings.')
    }
    this.anthropicClient = new Anthropic({ apiKey })
    return this.anthropicClient
  }

  private async getOpenAIClient(): Promise<OpenAI> {
    if (this.openaiClient) return this.openaiClient
    const apiKey = await loadOpenAIKey(currentDeckPath ?? undefined)
    if (!apiKey) {
      throw new Error('No OpenAI API key found. Add OPENAI_API_KEY to your deck\'s .env file or configure it in Settings.')
    }
    this.openaiClient = new OpenAI({ apiKey })
    return this.openaiClient
  }

  private async getGeminiClient(): Promise<GoogleGenAI> {
    if (this.geminiClient) return this.geminiClient
    const apiKey = await loadGeminiKey(currentDeckPath ?? undefined)
    if (!apiKey) {
      throw new Error('No Gemini API key found. Add GEMINI_API_KEY to your deck\'s .env file or configure it in Settings.')
    }
    this.geminiClient = new GoogleGenAI({ apiKey })
    return this.geminiClient
  }

  /** Base URLs for OpenAI-compatible providers */
  private static readonly COMPAT_BASE_URLS: Record<string, string> = {
    mistral:    'https://api.mistral.ai/v1',
    meta:       'https://api.llama.com/compat/v1',
    xai:        'https://api.x.ai/v1',
    perplexity: 'https://api.perplexity.ai',
  }

  private async getOpenAICompatClient(providerId: string): Promise<OpenAI> {
    const cached = this.openaiCompatClients.get(providerId)
    if (cached) return cached

    // Ollama: the "key" is actually the base URL, no real API key needed
    if (providerId === 'ollama') {
      const ollamaBaseUrl = await loadProviderKey('ollama', currentDeckPath ?? undefined) || 'http://localhost:11434'
      const client = new OpenAI({ apiKey: 'ollama', baseURL: `${ollamaBaseUrl.replace(/\/+$/, '')}/v1` })
      this.openaiCompatClients.set(providerId, client)
      return client
    }

    const apiKey = await loadProviderKey(providerId, currentDeckPath ?? undefined)
    if (!apiKey) {
      const envVar = providerId === 'meta' ? 'LLAMA_API_KEY'
        : providerId === 'xai' ? 'XAI_API_KEY'
        : providerId === 'perplexity' ? 'PERPLEXITY_API_KEY'
        : `${providerId.toUpperCase()}_API_KEY`
      throw new Error(`No ${providerId} API key found. Add ${envVar} to your .env file or configure it in Settings.`)
    }

    const baseURL = AIService.COMPAT_BASE_URLS[providerId]
    if (!baseURL) throw new Error(`No base URL configured for provider: ${providerId}`)

    const client = new OpenAI({ apiKey, baseURL })
    this.openaiCompatClients.set(providerId, client)
    return client
  }

  // Keep backward compat for chatWithTools (which uses Anthropic SDK types)
  private async getClient(): Promise<Anthropic> {
    return this.getAnthropicClient()
  }

  // ── Unified generation ──

  private async generate(params: {
    system: string
    userMessage: string
    maxTokens: number
  }): Promise<GenerationResult> {
    const provider = this.getProviderForCurrentModel()

    switch (provider) {
      case 'anthropic': {
        const client = await this.getAnthropicClient()
        const response = await client.messages.create({
          model: this.model,
          max_tokens: params.maxTokens,
          system: params.system,
          messages: [{ role: 'user', content: params.userMessage }]
        })
        const textBlock = response.content.find((block) => block.type === 'text')
        return { text: textBlock?.text ?? '' }
      }

      case 'openai': {
        const client = await this.getOpenAIClient()
        const isReasoning = /^(o[1-9]|o\d+-mini)/.test(this.model)
        const response = await client.chat.completions.create({
          model: this.model,
          ...(isReasoning
            ? { max_completion_tokens: params.maxTokens }
            : { max_tokens: params.maxTokens }
          ),
          messages: [
            // Reasoning models don't support system messages — merge into user
            ...(isReasoning
              ? [{ role: 'user' as const, content: `${params.system}\n\n${params.userMessage}` }]
              : [
                  { role: 'system' as const, content: params.system },
                  { role: 'user' as const, content: params.userMessage }
                ]
            )
          ]
        })
        return { text: response.choices[0]?.message?.content ?? '' }
      }

      case 'google': {
        const client = await this.getGeminiClient()
        const response = await client.models.generateContent({
          model: this.model,
          contents: params.userMessage,
          config: {
            systemInstruction: params.system,
            maxOutputTokens: params.maxTokens,
          }
        })
        return { text: response.text ?? '' }
      }

      case 'mistral':
      case 'meta':
      case 'xai':
      case 'perplexity':
      case 'ollama': {
        const client = await this.getOpenAICompatClient(provider)
        const response = await client.chat.completions.create({
          model: this.model,
          max_tokens: params.maxTokens,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.userMessage }
          ]
        })
        return { text: response.choices[0]?.message?.content ?? '' }
      }

      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }
  }

  private async streamGenerate(params: {
    system: string
    userMessage: string
    maxTokens: number
    onChunk: (chunk: string) => void
  }): Promise<string> {
    const provider = this.getProviderForCurrentModel()
    let full = ''

    switch (provider) {
      case 'anthropic': {
        const client = await this.getAnthropicClient()
        const stream = client.messages.stream({
          model: this.model,
          max_tokens: params.maxTokens,
          system: params.system,
          messages: [{ role: 'user', content: params.userMessage }]
        })
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            full += event.delta.text
            params.onChunk(event.delta.text)
          }
        }
        return full
      }

      case 'openai': {
        const client = await this.getOpenAIClient()
        const isReasoning = /^(o[1-9]|o\d+-mini)/.test(this.model)
        const stream = await client.chat.completions.create({
          model: this.model,
          ...(isReasoning
            ? { max_completion_tokens: params.maxTokens }
            : { max_tokens: params.maxTokens }
          ),
          messages: [
            ...(isReasoning
              ? [{ role: 'user' as const, content: `${params.system}\n\n${params.userMessage}` }]
              : [
                  { role: 'system' as const, content: params.system },
                  { role: 'user' as const, content: params.userMessage }
                ]
            )
          ],
          stream: true
        })
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) {
            full += delta
            params.onChunk(delta)
          }
        }
        return full
      }

      case 'google': {
        const client = await this.getGeminiClient()
        const response = await client.models.generateContentStream({
          model: this.model,
          contents: params.userMessage,
          config: {
            systemInstruction: params.system,
            maxOutputTokens: params.maxTokens,
          }
        })
        for await (const chunk of response) {
          const text = chunk.text
          if (text) {
            full += text
            params.onChunk(text)
          }
        }
        return full
      }

      case 'mistral':
      case 'meta':
      case 'xai':
      case 'perplexity':
      case 'ollama': {
        const client = await this.getOpenAICompatClient(provider)
        const stream = await client.chat.completions.create({
          model: this.model,
          max_tokens: params.maxTokens,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.userMessage }
          ],
          stream: true
        })
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) {
            full += delta
            params.onChunk(delta)
          }
        }
        return full
      }

      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }
  }

  async generateNotes(
    slideContent: string,
    codeContent: string | null,
    deckTitle: string,
    slideIndex: number
  ): Promise<string> {
    let userMessage = `Deck: "${deckTitle}"\nSlide ${slideIndex + 1}:\n\n${slideContent}`
    if (codeContent) {
      userMessage += `\n\nAssociated code:\n\`\`\`\n${codeContent}\n\`\`\``
    }

    const result = await this.generate({
      system: SYSTEM_PROMPT,
      userMessage,
      maxTokens: 1024
    })
    return result.text
  }

  async streamNotes(
    slideContent: string,
    codeContent: string | null,
    deckTitle: string,
    slideIndex: number,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    let userMessage = `Deck: "${deckTitle}"\nSlide ${slideIndex + 1}:\n\n${slideContent}`
    if (codeContent) {
      userMessage += `\n\nAssociated code:\n\`\`\`\n${codeContent}\n\`\`\``
    }

    await this.streamGenerate({
      system: SYSTEM_PROMPT,
      userMessage,
      maxTokens: 1024,
      onChunk
    })
  }

  async generateSlideContent(
    prompt: string,
    deckTitle: string,
    existingContent: string
  ): Promise<string> {
    const result = await this.generate({
      system: `You are a technical presentation content generator. Generate markdown content for presentation slides.
${SLIDE_7x7_RULE}
Rules:
- Output ONLY valid markdown, no explanations or wrapping
- Use headings (#, ##), bullet points, bold, code blocks as appropriate
- For diagrams: use a mermaid code block (\`\`\`mermaid)
- Match the style and tone of the existing presentation`,
      userMessage: `Deck: "${deckTitle}"\n\nExisting slide content:\n${existingContent}\n\nRequest: ${prompt}`,
      maxTokens: 2048
    })
    return result.text
  }

  async generateSvgChart(
    prompt: string,
    deckTitle: string
  ): Promise<string> {
    const result = await this.generate({
      system: `You are an SVG chart/diagram generator for technical presentations.

Rules:
- Output ONLY a valid SVG element, nothing else — no markdown, no explanation, no wrapping
- Use a dark theme: background transparent, text #e2e8f0, lines/fills using indigo (#818cf8, #6366f1), green (#4ade80), amber (#fbbf24), red (#f87171)
- SVG width should be 600, height 400
- Include clear labels, axes, and legends where appropriate
- Supported chart types: bar, line, pie, flow diagram, architecture diagram, timeline
- Make it clean and readable for a presentation`,
      userMessage: `Deck: "${deckTitle}"\n\nGenerate an SVG chart/diagram: ${prompt}`,
      maxTokens: 4096
    })
    return result.text
  }

  async beautifySlide(
    slideContent: string,
    deckTitle: string,
    slideLayout?: string
  ): Promise<string> {
    const result = await this.generate({
      system: `You are a world-class McKinsey-level presentation designer. Transform slide content into visually striking, executive-quality markdown.

CANVAS: 1280×720px with 80px horizontal / 60px vertical padding → usable area ~1100×600px.
Content must breathe — aim for 50-70% fill. Sparse, high-impact slides beat dense walls of text.

CRITICAL RULES:
- Output ONLY the improved markdown — no explanations, no wrapping, no code fences around the output
- NEVER change the meaning or remove information — restructure for clarity and impact
- NEVER add fake data or made-up content
- Keep the same # title but make it punchier if possible
- Follow the 7×7 rule: max 7 bullets, max 7 words each. Condense, don't expand.

FORMATTING TECHNIQUES — use ALL that apply:

1. **Bold hierarchy**: **bold** key terms/metrics. ***bold italic*** for the single most important takeaway.

2. **Structured headings**: # title, ## sections, ### sub-sections. Create visual hierarchy.

3. **Rich multi-level bullets**:
   - Top-level for main points
     - Indented sub-bullets for supporting detail
     - Use → for implications/results
     - Use ✓ for completed, ○ for pending
   - **Key term:** explanation on same line (McKinsey pattern)

4. **Data tables**: Convert ANY comparisons or multi-attribute data into markdown tables:
   | Metric | Value | Status |
   |--------|-------|--------|
   Tables whenever 3+ comparable items exist.

5. **Callout blockquotes**:
   > **Key Insight:** highlighted takeaway here
   Use for executive summaries or critical points.

6. **Visual separators**: --- between major sections for breathing room.

7. **Status badges** — the renderer auto-styles these as colored pills:
   🟢 On Track → renders as green badge
   🟡 In Progress → renders as yellow badge
   🔴 At Risk → renders as red badge
   ✅ and ❌ also render as styled icons.
   Place them at the START of a line for best visual effect.

8. **Progress bars**: Use \`[progress XX%]\` syntax — renders as a visual progress bar.
   Example: [progress 75%]

9. **Metric highlights**: Put a bold number ALONE on its own line for a large metric card:
   **$4.2M**
   (+12% YoY growth)
   This renders as a large highlighted metric card.

10. **Mermaid diagrams**: If content describes a process/flow/architecture/funnel, ADD a mermaid diagram:
   \`\`\`mermaid
   graph LR
     A["Input Data"] --> B["Processing"] --> C["Final Output"]
   \`\`\`
   MERMAID RULES: Always wrap node labels in double quotes. Use 2-3 word descriptive labels. Prefer graph TD for 4+ steps. Max 3-6 nodes.

9. **Code formatting**: \`inline code\` for technical terms, commands, paths.

10. **McKinsey pyramid principle**:
    - Lead with the conclusion/recommendation FIRST
    - Then supporting evidence
    - Quantify everything possible
    - "X → Y" for cause and effect

STYLE: Minimalist and spacious. Every word earns its place. Professional executive tone. Make metrics prominent and bold. Less is more — a slide with 5 perfect bullets beats 10 mediocre ones.

SLIDE TYPE AWARENESS — adapt formatting to the slide's layout type:
- "title" → Large impactful heading only. One powerful subtitle line. No bullets. Think conference keynote opener.
- "section" → Bold section heading with a brief (1-line) description. Acts as a divider between topics.
- "center" → Centered, balanced content. Great for quotes, key stats, or single powerful messages.
- "big-number" → One HUGE metric/number as the heading, with 2-3 context bullets below.
- "quote" → Format as an elegant blockquote with attribution.
- "two-col" / "two-col-wide-left" / "two-col-wide-right" → Structure content into two clear sections using ## headings. First ## is left column, second ## is right column.
- "three-col" → Structure into three ## sections for three columns.
- "top-bottom" → First ## section is top half, second ## is bottom half.
- "default" or unspecified → Standard content slide with heading + structured bullets/tables.
- "blank" → Minimal formatting, let the content breathe.`,
      userMessage: `Presentation: "${deckTitle}"
Slide layout type: ${slideLayout || 'default'}

Original slide content to beautify (preserve ALL information, enrich with better structure and formatting):

${slideContent}`,
      maxTokens: 4096
    })
    return result.text
  }

  async generateBulkSlides(
    prompt: string,
    deckTitle: string,
    existingSlides: string[],
    count: number,
    artifactContext?: string
  ): Promise<{ id: string; markdown: string }[]> {
    const existingContext = existingSlides.length > 0
      ? `\n\nExisting slides in this deck:\n${existingSlides.map((s, i) => `--- Slide ${i + 1} ---\n${s}`).join('\n\n')}`
      : ''

    const artifactInfo = artifactContext
      ? `\n\nArtifact/resource context to incorporate:\n${artifactContext}`
      : ''

    const result = await this.generate({
      system: `You are a technical presentation generator. Generate slide content as a JSON array.
${SLIDE_7x7_RULE}
Rules:
- Output ONLY a valid JSON array, no markdown wrapping, no explanation
- Each element: { "id": "kebab-case-id", "markdown": "# Title\\n\\ncontent..." }
- Generate exactly ${count} slides
- Each slide: one # heading + max 7 short bullet points
- Content flows logically, no repetition
- For diagrams: use mermaid code blocks in markdown
- If existing slides provided, continue from where they left off`,
      userMessage: `Deck: "${deckTitle}"\nGenerate ${count} slides.${existingContext}${artifactInfo}\n\nTopic/instructions: ${prompt}`,
      maxTokens: 4096 * 2
    })

    const parsed = this.extractJSON(result.text)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
    }
    if (parsed && parsed.slides) {
      return parsed.slides
    }
    return [{ id: 'generated', markdown: result.text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim() }]
  }

  async improveSlide(
    slideContent: string,
    deckTitle: string,
    userPrompt: string,
    artifactContext?: string
  ): Promise<string> {
    const artifactInfo = artifactContext
      ? `\n\nArtifact context:\n${artifactContext}`
      : ''

    const result = await this.generate({
      system: `You are a presentation slide editor. Improve a slide based on the user's instructions.
${SLIDE_7x7_RULE}
Rules:
- Output ONLY the improved markdown, nothing else
- Apply the user's requested changes
- Enforce the 7×7 rule — condense if needed
- For diagrams: use mermaid code blocks`,
      userMessage: `Deck: "${deckTitle}"\n\nCurrent slide:\n${slideContent}${artifactInfo}\n\nImprove this slide: ${userPrompt}`,
      maxTokens: 2048
    })
    return result.text
  }

  async generateCode(
    prompt: string,
    language: string,
    existingCode: string,
    deckTitle: string
  ): Promise<string> {
    const result = await this.generate({
      system: `You are an expert ${language} programmer. Generate code for a presentation demo.

Rules:
- Output ONLY valid ${language} code, no markdown wrapping, no explanation
- Code should be clean, well-commented, and demonstrate the concept clearly
- If existing code is provided, extend or improve it based on the prompt
- Keep it concise — this runs in a live presentation
- Include print/console output so results are visible when executed`,
      userMessage: `Deck: "${deckTitle}"\nLanguage: ${language}\n${existingCode ? `\nExisting code:\n${existingCode}\n` : ''}\nGenerate code: ${prompt}`,
      maxTokens: 2048
    })

    let code = result.text
    code = code.replace(/^```\w*\n/, '').replace(/\n```$/, '')
    return code
  }

  async generateInlineText(
    prompt: string,
    slideContent: string,
    deckTitle: string
  ): Promise<string> {
    const result = await this.generate({
      system: `You are a concise writing assistant for presentation slides. Generate a short sentence or phrase based on the user's prompt.

Rules:
- Output ONLY the generated text, nothing else — no quotes, no explanation, no markdown formatting
- Maximum 300 characters
- Match the tone and context of the existing slide content
- Be direct and punchy — this is for a presentation, not an essay
- Never wrap in quotes or add prefixes like "Here is..."`,
      userMessage: `Deck: "${deckTitle}"\n\nCurrent slide content:\n${slideContent}\n\nGenerate text for: ${prompt}`,
      maxTokens: 256
    })
    return result.text.slice(0, 300)
  }

  async runPrompt(
    prompt: string,
    _slideContent: string,
    _deckTitle: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    await this.streamGenerate({
      system: `You are a helpful AI assistant. Be concise and direct. Use markdown formatting for clarity. Provide actionable, useful answers.`,
      userMessage: prompt,
      maxTokens: 2048,
      onChunk
    })
  }

  async generateFullPresentation(
    prompt: string,
    title: string,
    sourceContent: string | null,
    slideCount: number,
    onProgress: (status: string, slideIndex: number, total: number) => void
  ): Promise<{ slides: { id: string; markdown: string; layout: string }[]; title: string }> {
    const sourceContext = sourceContent
      ? `\n\nSOURCE DOCUMENT — THIS IS YOUR PRIMARY INPUT:\n\`\`\`\n${sourceContent.slice(0, 30000)}\n\`\`\`\n\nYou MUST base the presentation content on the source document above. Extract real facts, data points, names, figures, and structure directly from it. Do NOT invent information that is not in the source document. The user's prompt provides additional instructions on how to present the source material.`
      : ''

    onProgress('Designing presentation structure...', 0, slideCount)

    const sourceSystemRule = sourceContent
      ? `\n\nCRITICAL RULE — SOURCE MATERIAL PROVIDED: The user has uploaded a source document. You MUST ground ALL slide content in the source material. Extract actual data, facts, quotes, and structure from it. Do NOT hallucinate or fabricate information that is not present in the source document. If the source document does not contain enough information for a slide, state what is available rather than making things up.`
      : ''

    const systemPrompt = `You are a McKinsey-level presentation designer. You create executive-quality presentations that are rich in content, data-driven, and visually structured.${sourceSystemRule}

OUTPUT FORMAT: A valid JSON object with this exact structure:
{
  "title": "Presentation Title",
  "slides": [
    { "id": "kebab-case-id", "markdown": "# Slide Title\\n\\ncontent...", "layout": "default" }
  ]
}

Output ONLY the JSON object. No markdown wrapping, no explanation, no \`\`\`json fences.

AVAILABLE LAYOUTS — choose the best for each slide:
- "title" → Slide 1 only. Centered. Use: # Title\\n\\nSubtitle text
- "center" → Big stats or single powerful message. Centered vertically and horizontally.
- "section" → Section dividers with left accent bar. Use sparingly (max 2).
- "two-col" → Equal 50/50 columns. Content after the first element (h1) splits into columns. Separate columns with a horizontal rule (---).
- "default" → Standard content. Padded 80px H / 60px V. Best for bullets, tables, mixed content.
- "top-bottom" → Vertical split. Good for data on top + analysis below.
- "big-number" → Single large metric. h1 renders at 7rem with gradient. Use for: # **$4.2M**\\n\\nRevenue this quarter
- "quote" → Pull quote with decorative quotation mark. Use for: # "Quote text here"\\n\\n— Attribution

VISUAL FEATURES — the renderer supports these special patterns:
- Status badges: Start a line with 🟢, 🟡, or 🔴 for colored pill badges
- Progress bars: Write [progress 75%] for a visual progress bar
- Metric highlights: Bold a number like **$4.2M** (+12%) for styled metric cards
- Mermaid diagrams: \`\`\`mermaid\\ngraph LR\\n  A["Label"] --> B["Label"]\\n\`\`\`
- Tables: Standard markdown tables with | pipes |
- Blockquotes: > for callout boxes with styled border

MERMAID RULES: Always use double quotes around node labels. Use descriptive 2-3 word labels. Prefer graph TD for 4+ steps. Keep simple (3-6 nodes max).

SLIDE DESIGN RULES:
1. **Pyramid Principle**: Lead with conclusion first, then evidence.
2. **No filler**: No "Thank you", "Questions?", or empty slides.
3. **CONTENT & SPACING**:
   The slide canvas is 1280×720px with 80px horizontal and 60px vertical padding → usable area is ~1100×600px.
   Content must NEVER fill the entire usable area. Slides should breathe — aim for 50-70% fill.
   - Follow the 7×7 rule: ONE heading (max 7 words), max 7 bullets (max 7 words each)
   - "title", "section", "big-number", "quote" layouts are intentionally minimal
   - "default" slides: heading + 4-7 concise bullets. Use ## sub-headings for visual breaks
   - "two-col" slides: 3-5 bullets per column max
   - Use multi-level bullets (indent) for hierarchy, not for packing more content
   - Optionally add ONE > **Key Takeaway:** blockquote per slide
   - A slide with only a heading and 1 bullet is too sparse; a slide with 10+ lines is too dense
4. **One # heading per slide** (the slide title). Use ## for sub-sections within.
5. **Bold key terms and metrics**: **Revenue**, **+23%**, **$4.2M**
6. **Use tables** for comparisons of 3+ items. Max 4 columns, 5 rows — keep cells short.
7. **Prefer "default" layout** for content slides. Only use "two-col" when content naturally splits.
8. **Vary visual elements**: Mix bullets, tables, blockquotes, and status badges across slides.
9. **NEVER produce a slide with only a title and no body content.** Use layout "section" for dividers.

STRUCTURE for ${slideCount} slides:
- Slide 1: Title slide (layout: "title") — just title + subtitle
- Slide 2: Executive summary or key findings (layout: "default" or "center")
- Slides 3-${slideCount - 1}: Deep content with tables, data, diagrams. Use section dividers where topics shift.
- Slide ${slideCount}: Recommendations or next steps (layout: "default")

Generate exactly ${slideCount} slides.`

    const userMessage = sourceContent
      ? `Create a complete ${slideCount}-slide presentation based on the following source document and instructions.${sourceContext}\n\nAdditional instructions from the user: ${prompt}\n\nPresentation title suggestion: "${title}"\n\nGenerate the full presentation as a JSON object. Remember: ALL content must come from the source document above.`
      : `Create a complete ${slideCount}-slide presentation.\n\nTopic/instructions: ${prompt}\n\nPresentation title suggestion: "${title}"\n\nGenerate the full presentation as a JSON object.`

    let raw = ''
    let slidesFound = 0

    try {
      await this.streamGenerate({
        system: systemPrompt,
        userMessage,
        maxTokens: 16384,
        onChunk: (chunk: string) => {
          raw += chunk
          const newCount = (raw.match(/"id"\s*:/g) || []).length
          if (newCount > slidesFound) {
            slidesFound = newCount
            onProgress(`Generating slide ${slidesFound} of ${slideCount}...`, slidesFound, slideCount)
          }
        }
      })
    } catch (streamErr) {
      console.error('[generateFullPresentation] Stream error:', streamErr)
    }

    console.log('[generateFullPresentation] raw length:', raw.length, 'first 200 chars:', raw.slice(0, 200))

    onProgress('Finalizing presentation...', slideCount, slideCount)

    const parsed = this.extractJSON(raw)

    let slides: any[] | null = null
    let finalTitle = title

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.slides) {
      slides = parsed.slides
      finalTitle = parsed.title || title
    } else if (Array.isArray(parsed) && parsed.length > 0) {
      slides = parsed.map((s: any) => ({ ...s, layout: s.layout || 'default' }))
    }

    if (slides && slides.length > 0) {
      // Post-process: ensure every "default" slide has body content, not just a title
      for (const slide of slides) {
        if (!slide.markdown) continue
        const lines = slide.markdown.split('\n').filter((l: string) => l.trim())
        const layout = slide.layout || 'default'
        // If a default/center slide only has a heading (1-2 lines), convert to section
        if (['default', 'center'].includes(layout) && lines.length <= 2) {
          const hasOnlyHeading = lines.every((l: string) => l.startsWith('#') || l.trim() === '')
          if (hasOnlyHeading) {
            console.warn(`[generateFullPresentation] Slide "${slide.id}" has only a heading — converting to section layout`)
            slide.layout = 'section'
          }
        }
      }

      onProgress('Generation complete', slideCount, slideCount)
      return { slides, title: finalTitle }
    }

    // Fallback — could not parse JSON
    console.error('[generateFullPresentation] Failed to parse JSON from response. First 500 chars:', raw.slice(0, 500))
    return { slides: [{ id: 'generated', markdown: raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim(), layout: 'default' }], title }
  }

  /**
   * Robustly extract and parse JSON from an LLM response that may contain
   * markdown code fences, preamble text, or trailing commentary.
   */
  private extractJSON(raw: string): any | null {
    // 1. Strip markdown code fences anywhere in the string
    let text = raw.replace(/```(?:json)?\s*\n?/gi, '').replace(/```/g, '').trim()

    // 2. Try parsing the whole thing directly (cleanest case)
    try { return JSON.parse(text) } catch {}

    // 3. Try to find a JSON object starting with { "title" or { "slides"
    const objStart = text.search(/\{\s*"(?:title|slides)"/)
    if (objStart >= 0) {
      const candidate = text.slice(objStart)
      // Find matching closing brace by counting depth
      let depth = 0
      for (let i = 0; i < candidate.length; i++) {
        if (candidate[i] === '{') depth++
        else if (candidate[i] === '}') {
          depth--
          if (depth === 0) {
            try { return JSON.parse(candidate.slice(0, i + 1)) } catch {}
            break
          }
        }
      }
    }

    // 4. Try greedy regex for outermost { ... }
    const objMatch = text.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try { return JSON.parse(objMatch[0]) } catch {}
    }

    // 5. Try to find a JSON array [ ... ]
    const arrMatch = text.match(/\[[\s\S]*\]/)
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]) } catch {}
    }

    return null
  }

  async hasApiKey(): Promise<boolean> {
    try {
      const provider = this.getProviderForCurrentModel()
      const key = await loadProviderKey(provider, currentDeckPath ?? undefined)
      return !!key
    } catch {
      return false
    }
  }

  private static readonly ALL_PROVIDER_IDS = ['anthropic', 'openai', 'google', 'mistral', 'meta', 'xai', 'perplexity', 'ollama']

  /** Check if any provider has an API key configured */
  async hasAnyApiKey(): Promise<boolean> {
    for (const p of AIService.ALL_PROVIDER_IDS) {
      const key = await loadProviderKey(p, currentDeckPath ?? undefined)
      if (key) return true
    }
    return false
  }

  /** Validate an API key by making a lightweight request to the provider */
  private async validateProviderKey(providerId: string, apiKey: string): Promise<boolean> {
    const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    try {
      const validate = async (): Promise<boolean> => {
        switch (providerId) {
          case 'anthropic': {
            const client = new Anthropic({ apiKey })
            await client.models.list({ limit: 1 })
            return true
          }
          case 'openai': {
            const client = new OpenAI({ apiKey })
            await client.models.list()
            return true
          }
          case 'google': {
            const client = new GoogleGenAI({ apiKey })
            await client.models.list()
            return true
          }
          case 'ollama': {
            // For Ollama, apiKey is the base URL; validate by checking reachability
            const baseUrl = apiKey || 'http://localhost:11434'
            const resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`)
            return resp.ok
          }
          case 'mistral':
          case 'meta':
          case 'xai':
          case 'perplexity': {
            const baseURL = AIService.COMPAT_BASE_URLS[providerId]
            if (!baseURL) return false
            const client = new OpenAI({ apiKey, baseURL })
            await client.models.list()
            return true
          }
          default:
            return false
        }
      }
      return await Promise.race([validate(), timeout(5000)])
    } catch {
      return false
    }
  }

  /** Get status of all providers with actual API key validation */
  async getProviderStatuses(): Promise<{ id: string; hasKey: boolean; status: 'connected' | 'invalid' | 'not_configured'; keySource: 'env-file' | 'settings' | 'env-var' | null }[]> {
    return Promise.all(
      AIService.ALL_PROVIDER_IDS.map(async (id) => {
        const key = await loadProviderKey(id, currentDeckPath ?? undefined)
        const keySource = await getProviderKeySource(id, currentDeckPath ?? undefined)
        if (!key) return { id, hasKey: false, status: 'not_configured' as const, keySource }
        const valid = await this.validateProviderKey(id, key)
        return { id, hasKey: true, status: valid ? 'connected' as const : 'invalid' as const, keySource }
      })
    )
  }

  /** Fetch installed models from a running Ollama instance */
  async fetchOllamaModels(baseUrl?: string): Promise<{ id: string; name: string }[]> {
    const url = baseUrl || await loadProviderKey('ollama', currentDeckPath ?? undefined) || 'http://localhost:11434'
    try {
      const resp = await fetch(`${url.replace(/\/+$/, '')}/api/tags`)
      if (!resp.ok) return []
      const data = await resp.json() as { models?: { name: string; model: string }[] }
      return (data.models || []).map((m) => ({ id: m.name, name: m.name }))
    } catch {
      return []
    }
  }

  async streamArticle(
    deckTitle: string,
    author: string,
    slidesContent: { title: string; markdown: string; code: string | null; notes: string | null }[],
    rules: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const slidesContext = slidesContent
      .map(
        (s, i) =>
          `--- Slide ${i + 1}: ${s.title} ---\n${s.markdown}${s.code ? `\n\nCode:\n\`\`\`\n${s.code}\n\`\`\`` : ''}${s.notes ? `\n\nSpeaker notes:\n${s.notes}` : ''}`
      )
      .join('\n\n')

    const userRules = rules.trim()
      ? `\n\nAdditional rules from the author:\n${rules}`
      : ''

    await this.streamGenerate({
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
      userMessage: `Presentation: "${deckTitle}"\nAuthor: ${author}\n\nFull presentation content:\n\n${slidesContext}${userRules}\n\nTransform this presentation into a complete article.`,
      maxTokens: 8192,
      onChunk
    })
  }

  /**
   * Execute a resolved tool call, handling confirmation flow and emitting events.
   * Shared by all provider chat loops.
   */
  private async executeToolCall(
    toolCallId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    snapshot: PresentationSnapshot,
    actionMode: 'auto' | 'ask',
    onEvent: (event: ChatStreamEvent) => void,
    confirmAction?: (toolCallId: string, toolName: string, toolInput: unknown) => Promise<boolean>
  ): Promise<{ result: string; isError: boolean }> {
    const tool = findTool(toolName)
    if (!tool) {
      onEvent({ type: 'tool_call_result', id: toolCallId, toolName, result: `Unknown tool: ${toolName}`, success: false })
      return { result: `Unknown tool: ${toolName}`, isError: true }
    }

    onEvent({ type: 'tool_call_start', id: toolCallId, toolName, toolInput })

    if (actionMode === 'ask' && tool.isMutation && confirmAction) {
      onEvent({ type: 'tool_confirm_request', id: toolCallId, toolName, toolInput })
      const approved = await confirmAction(toolCallId, toolName, toolInput)
      if (!approved) {
        onEvent({ type: 'tool_call_result', id: toolCallId, toolName, result: 'Action rejected by user.', success: false })
        return { result: 'Action was rejected by the user.', isError: false }
      }
    }

    const context: ToolExecutionContext = { snapshot, aiService: this }
    try {
      const result = await tool.execute(toolInput, context)
      onEvent({ type: 'tool_call_result', id: toolCallId, toolName, result: result.result, success: result.success, rendererAction: result.rendererAction })
      return { result: result.result, isError: !result.success }
    } catch (err) {
      const errorMsg = `Tool execution error: ${(err as Error).message}`
      onEvent({ type: 'tool_call_result', id: toolCallId, toolName, result: errorMsg, success: false })
      return { result: errorMsg, isError: true }
    }
  }

  /**
   * Chat agent with tool use — ReAct-style loop.
   * All providers support tool use:
   * - Anthropic: native tool_use blocks
   * - Google/Gemini: functionCall/functionResponse
   * - OpenAI + all OpenAI-compatible (default): function calling
   */
  async chatWithTools(
    messages: Anthropic.MessageParam[],
    snapshot: PresentationSnapshot,
    actionMode: 'auto' | 'ask',
    onEvent: (event: ChatStreamEvent) => void,
    confirmAction?: (toolCallId: string, toolName: string, toolInput: unknown) => Promise<boolean>
  ): Promise<Anthropic.MessageParam[]> {
    const provider = this.getProviderForCurrentModel()

    // Build system prompt with presentation context
    const slideOverview = snapshot.slides
      .map((s, i) => {
        const heading = s.markdownContent.split('\n').find((l) => l.startsWith('#'))
          ?.replace(/^#+\s*/, '').slice(0, 50) || '(empty)'
        return `  [${i}] ${s.id}: ${heading}`
      })
      .join('\n')

    // Include current slide content + rendered HTML for structural awareness (page-agent inspired)
    const currentSlide = snapshot.slides[snapshot.currentSlideIndex]
    let currentSlideContext = ''
    if (currentSlide) {
      currentSlideContext = `\n\nCurrent slide (index ${snapshot.currentSlideIndex}) markdown source:\n\`\`\`markdown\n${currentSlide.markdownContent}\n\`\`\``
      if (currentSlide.renderedHtml) {
        // Truncate very large HTML to avoid blowing up the context
        const html = currentSlide.renderedHtml.length > 4000
          ? currentSlide.renderedHtml.slice(0, 4000) + '\n... (truncated)'
          : currentSlide.renderedHtml
        currentSlideContext += `\n\nRendered HTML of current slide (what the user sees):\n\`\`\`html\n${html}\n\`\`\``
      }
    }

    const systemPrompt = `You are Lecta AI, an intelligent assistant embedded in the Lecta presentation app. You help users view, edit, and improve their presentations through natural conversation.

Current presentation context:
- Title: "${snapshot.title}"
- Author: ${snapshot.author}
- Theme: ${snapshot.theme}
- Total slides: ${snapshot.slides.length}
- Currently viewing: Slide ${snapshot.currentSlideIndex + 1}
- Slide overview:
${slideOverview}
${currentSlideContext}

Guidelines:
- Use the available tools to view and modify the presentation when asked.
- ALWAYS use tools to make changes. NEVER just describe what you would do — actually do it.
- When editing slides, use edit_slide_content to replace the slide's markdown with the updated version.
- Always confirm what you did after making changes.
- For multi-step tasks, work through them one step at a time.
- Be concise and helpful. Use markdown formatting in your responses.
- When the user refers to "this slide" or "the current slide", they mean slide index ${snapshot.currentSlideIndex}.
- Slide indices are 0-based internally but refer to them as 1-based when talking to the user.
- When the user asks to change alignment, layout, or positioning, use the change_layout tool — NOT edit_slide_content.

SLIDE CONTENT CAPABILITIES — the slide renderer supports:
1. Standard markdown: headings (#, ##, ###), lists (-, 1.), bold (**), italic (*), tables, images (![](url)), links, code blocks, blockquotes (>)
2. Raw HTML mixed with markdown (via rehypeRaw) — inline HTML with style attributes
3. Mermaid diagrams: use \`\`\`mermaid code blocks for flowcharts, sequence diagrams, etc.
4. Emojis: standard emoji characters work directly in markdown

LAYOUT & ALIGNMENT (controlled by change_layout tool, NOT markdown):
- "default" → left-aligned, top-aligned (standard slide)
- "center" → horizontally + vertically centered content
- "title" → large centered title, vertically centered (for title/cover slides)
- "section" → section divider style
- "two-col" → two equal columns (use <!--columns-->...<!--col-->...<!--/columns-->)
- "two-col-wide-left" → 60/40 columns
- "two-col-wide-right" → 40/60 columns
- "three-col" → three equal columns
- "top-bottom" → top/bottom split
- "big-number" → large number highlight
- "quote" → centered quote, vertically centered
- "blank" → no padding, full canvas
IMPORTANT: To ALIGN TEXT LEFT, set layout to "default". To CENTER, set layout to "center". Do NOT try to change alignment via markdown/HTML.

VISUAL COMPONENTS (use in markdown via HTML):
- Status badges: \`<span class="slide-badge slide-badge-green">Done</span>\` (colors: green, yellow, red)
- Badge icons: \`<span class="slide-badge-icon slide-badge-green">✓</span>\`
- Progress bars: \`<div class="slide-progress"><div class="slide-progress-bar" style="width:75%"><span class="slide-progress-label">75%</span></div></div>\`
- Metric cards: \`<div class="slide-metric"><span class="slide-metric-value">42%</span><span class="slide-metric-context">Growth YoY</span></div>\`
- Columns: \`<!--columns-->Column 1 content<!--col-->Column 2 content<!--/columns-->\`
- Text boxes (absolute positioned): \`<!-- textbox x=100 y=200 w=300 -->Content<!-- /textbox -->\`
  Optional params: fs=fontsize, fc=#color, fb=1 (bold), fi=1 (italic)

INLINE STYLING (use within markdown):
- Colors: \`<span style="color: #e74c3c">red text</span>\`
- Font size: \`<span style="font-size: 2rem">large text</span>\`
- Text align (within a block): \`<div style="text-align: center">centered block</div>\`
- Center a table: wrap in \`<div style="display: flex; justify-content: center;">\` with blank lines around it
- Background: \`<div style="background: #f0f0f0; padding: 1rem; border-radius: 8px">card</div>\`

SUB-SLIDES:
- Slides can have multiple sub-slides (pages within a slide), separated by \`---\` in the markdown
- Each sub-slide is a separate page during presentation

IMPORTANT RULES FOR HTML IN MARKDOWN:
- ALWAYS leave a blank line before and after HTML blocks, otherwise markdown inside won't be parsed
- When wrapping a markdown table in an HTML div, the table markdown must be separated by blank lines from the div tags
- Self-closing tags must use /> (e.g., <br/>, <hr/>)`

    const anthropicTools = getToolSchemas()

    // --- Anthropic path ---
    if (provider === 'anthropic') {
      const client = await this.getAnthropicClient()
      const maxIterations = 10
      const conversationMessages = [...messages]
      let iterations = 0

      while (iterations < maxIterations) {
        iterations++

        const response = await client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          tools: anthropicTools,
          messages: conversationMessages
        })

        const assistantContent: Anthropic.ContentBlock[] = response.content
        const toolUseBlocks = assistantContent.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        )

        for (const block of assistantContent) {
          if (block.type === 'text' && block.text) {
            onEvent({ type: 'text_delta', text: block.text })
          }
        }

        conversationMessages.push({ role: 'assistant', content: assistantContent })

        if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
          break
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const toolUse of toolUseBlocks) {
          const { result, isError } = await this.executeToolCall(
            toolUse.id,
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            snapshot,
            actionMode,
            onEvent,
            confirmAction
          )

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
            is_error: isError
          })
        }

        conversationMessages.push({ role: 'user', content: toolResults })
      }

      onEvent({ type: 'done' })
      return conversationMessages
    }

    // --- Google/Gemini path ---
    if (provider === 'google') {
      const client = await this.getGeminiClient()

      // Convert tool schemas to Gemini format
      const geminiFunctionDeclarations = anthropicTools.map((t) => ({
        name: t.name,
        description: t.description || '',
        parameters: t.input_schema as Record<string, unknown>
      }))

      // Build Gemini contents from messages
      const geminiContents: { role: string; parts: { text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } }[] }[] = []

      for (const m of messages) {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        geminiContents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: content }]
        })
      }

      const maxIterations = 10
      let iterations = 0

      while (iterations < maxIterations) {
        iterations++

        const response = await client.models.generateContent({
          model: this.model,
          contents: geminiContents,
          config: {
            systemInstruction: systemPrompt,
            maxOutputTokens: 4096,
            tools: [{ functionDeclarations: geminiFunctionDeclarations }]
          }
        })

        const candidate = response.candidates?.[0]
        if (!candidate?.content?.parts) break

        const parts = candidate.content.parts
        let hasToolCalls = false

        // Emit text parts
        for (const part of parts) {
          if (part.text) {
            onEvent({ type: 'text_delta', text: part.text })
          }
        }

        // Add model response to conversation
        geminiContents.push({ role: 'model', parts: parts as any })

        // Process function calls
        const functionResponseParts: { functionResponse: { name: string; response: Record<string, unknown> } }[] = []

        for (const part of parts) {
          if (part.functionCall) {
            hasToolCalls = true
            const fc = part.functionCall
            const toolCallId = `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
            const args = (fc.args || {}) as Record<string, unknown>

            const { result, isError } = await this.executeToolCall(
              toolCallId,
              fc.name!,
              args,
              snapshot,
              actionMode,
              onEvent,
              confirmAction
            )

            functionResponseParts.push({
              functionResponse: {
                name: fc.name!,
                response: { result, isError }
              }
            })
          }
        }

        if (!hasToolCalls) break

        // Add function responses back to conversation
        geminiContents.push({ role: 'user', parts: functionResponseParts as any })
      }

      onEvent({ type: 'done' })
      return messages
    }

    // --- OpenAI and all OpenAI-compatible providers (default path) ---
    // Any provider not explicitly handled above uses OpenAI function-calling format.
    // This covers: openai, mistral, meta, xai, perplexity, and any future providers.
    const client = provider === 'openai'
      ? await this.getOpenAIClient()
      : await this.getOpenAICompatClient(provider)

    const openaiTools: OpenAI.ChatCompletionTool[] = anthropicTools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.input_schema as Record<string, unknown>
      }
    }))

    const isReasoning = provider === 'openai' && /^(o[1-9]|o\d+-mini)/.test(this.model)

    // Convert Anthropic-format messages to OpenAI format
    const oaiMessages: OpenAI.ChatCompletionMessageParam[] = isReasoning
      ? []
      : [{ role: 'system', content: systemPrompt }]

    for (const m of messages) {
      if (m.role === 'user') {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        oaiMessages.push({
          role: 'user',
          content: isReasoning && oaiMessages.length === 0
            ? `${systemPrompt}\n\n${content}`
            : content
        })
      } else if (m.role === 'assistant') {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        oaiMessages.push({ role: 'assistant', content })
      }
    }

    const maxIterations = 10
    let iterations = 0

    while (iterations < maxIterations) {
      iterations++

      const response = await client.chat.completions.create({
        model: this.model,
        ...(isReasoning
          ? { max_completion_tokens: 4096 }
          : { max_tokens: 4096 }
        ),
        messages: oaiMessages,
        tools: openaiTools,
        ...(isReasoning ? {} : { tool_choice: 'auto' as const })
      })

      const choice = response.choices[0]
      if (!choice) break

      const assistantMsg = choice.message

      // Emit text content
      if (assistantMsg.content) {
        onEvent({ type: 'text_delta', text: assistantMsg.content })
      }

      // Add assistant message to conversation
      oaiMessages.push(assistantMsg)

      const toolCalls = assistantMsg.tool_calls
      if (!toolCalls || toolCalls.length === 0 || choice.finish_reason !== 'tool_calls') {
        break
      }

      // Execute each tool call and add results
      for (const tc of toolCalls) {
        if (tc.type !== 'function') continue
        let parsedInput: Record<string, unknown> = {}
        try {
          parsedInput = JSON.parse(tc.function.arguments || '{}')
        } catch { /* empty */ }

        const { result } = await this.executeToolCall(
          tc.id,
          tc.function.name,
          parsedInput,
          snapshot,
          actionMode,
          onEvent,
          confirmAction
        )

        oaiMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result
        })
      }
    }

    onEvent({ type: 'done' })
    return messages
  }
}
