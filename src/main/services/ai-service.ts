import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import { loadAnthropicKey, loadOpenAIKey, loadGeminiKey, loadAIModel, loadProviderKey, getProviderKeySource, loadOpenAIAuthMode } from './env-loader'
import { DEFAULT_AI_MODEL, getProviderForModel, isOllamaPrefixedModel, stripOllamaPrefix, type AIProviderID } from '../../../packages/shared/src/constants'
import type { PresentationSnapshot, ChatStreamEvent } from '../../../packages/shared/src/types/chat'
import { getAllTools, wrapDeckContent, DECK_CONTENT_NOTICE, type ToolExecutionContext } from './chat-agent-tools'
import { getCodexAppServerClient } from './codex-app-server-client'
import { createAnthropicAdapter } from './ai/anthropic'
import { createGeminiAdapter } from './ai/gemini'
import { createOpenAICompatibleAdapter } from './ai/openai-compatible'
import { createCodexAdapter } from './ai/codex'
import { runToolLoop, type LoopTool } from './ai/tool-loop'
import type { GenerateRequest, LLMAdapter } from './ai/types'
import { getCachedSettings } from '../ipc/settings'

/** OpenAI reasoning models reject a `system` message and `tool_choice`. */
const REASONING_MODEL_PATTERN = /^(o[1-9]|o\d+-mini)/

const SLIDE_7x7_RULE = `
SLIDE CANVAS: 1280×720px with 80px horizontal / 60px vertical padding.
Usable content area: ~1100×600px. Content should leave breathing room.

7×7 GUIDELINE (default style — adapt when the user requests something different):
1. One # heading per slide (aim for max 7 words)
2. Prefer up to 7 bullet points below the heading
3. Keep bullets concise (around 7 words each)
4. Favor bullets over paragraphs for scannability
5. Use **bold** on 1-2 key words per bullet
6. If content is dense, consider splitting across slides

If the user explicitly asks for longer text, paragraphs, different layouts, or a non-bullet style, follow their request — the 7×7 rule is a sensible default, not an absolute constraint.

WRONG (too long for a bullet):
- Retrieval-Augmented Generation combines document retrieval with generative AI models
RIGHT (concise):
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

/** Cap on the chat history forwarded to the model (the system prompt is rebuilt every turn). */
const MAX_HISTORY_MESSAGES = 40
const MAX_HISTORY_CHARS = 60_000

/**
 * Keep only the most recent messages so the request cannot grow without bound.
 * The result always starts with a `user` message (required by Anthropic and
 * expected by the other providers).
 */
export function capChatHistory<T extends { role: string; content: unknown }>(messages: T[]): T[] {
  const sizeOf = (m: T): number =>
    typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content ?? '').length

  let kept = messages.slice(-MAX_HISTORY_MESSAGES)
  let total = kept.reduce((sum, m) => sum + sizeOf(m), 0)
  while (kept.length > 1 && total > MAX_HISTORY_CHARS) {
    total -= sizeOf(kept[0])
    kept = kept.slice(1)
  }
  while (kept.length > 1 && kept[0].role !== 'user') {
    kept = kept.slice(1)
  }
  return kept
}

export class AIService {
  private anthropicClient: Anthropic | null = null
  private openaiClient: OpenAI | null = null
  private geminiClient: GoogleGenAI | null = null
  private openaiCompatClients: Map<string, OpenAI> = new Map() // Mistral, Meta, xAI, Perplexity
  /** One adapter per provider (plus an `openai:codex` entry), dropped with the clients. */
  private adapters: Map<string, LLMAdapter> = new Map()
  private model: string = DEFAULT_AI_MODEL
  /** Model ids reported by a running Ollama instance (see fetchOllamaModels). */
  private knownOllamaModels = new Set<string>()

  async setDeckPath(deckPath: string): Promise<void> {
    currentDeckPath = deckPath
    // Reset all clients so they reload keys
    this.anthropicClient = null
    this.openaiClient = null
    this.geminiClient = null
    this.openaiCompatClients.clear()
    this.adapters.clear()

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
    this.adapters.clear()
  }

  /**
   * Resolve the provider for the selected model. Unknown ids are an error:
   * only ids from the static catalog, ids returned by `fetchOllamaModels()`,
   * or ids explicitly prefixed with `ollama:` are accepted.
   */
  private async resolveProvider(model: string): Promise<AIProviderID> {
    const provider = getProviderForModel(model)
    if (provider) return provider.id
    if (isOllamaPrefixedModel(model)) return 'ollama'
    if (this.knownOllamaModels.has(model)) return 'ollama'
    // The id may be an Ollama model selected in a previous session — refresh the list once.
    await this.fetchOllamaModels()
    if (this.knownOllamaModels.has(model)) return 'ollama'
    throw new Error(`Unknown model "${model}"`)
  }

  /**
   * Abort any in-flight Codex turn. SDK-backed providers are cancelled through
   * the `AbortSignal` threaded from the IPC layer, not from here.
   */
  async cancelActiveGeneration(): Promise<void> {
    await getCodexAppServerClient().cancelTurn()
  }

  private async shouldUseCodexForOpenAI(): Promise<boolean> {
    return loadOpenAIAuthMode().then((mode) => mode === 'codex')
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

  // ── Adapters ──

  /**
   * The adapter for the currently selected model. Adapters are cached per
   * provider and dropped whenever the deck or the model changes, because the
   * underlying SDK clients reload their keys then.
   */
  async getAdapter(model: string = this.model): Promise<LLMAdapter> {
    const provider = await this.resolveProvider(model)
    const useCodex = provider === 'openai' && (await this.shouldUseCodexForOpenAI())
    const cacheKey = useCodex ? 'openai:codex' : provider

    const cached = this.adapters.get(cacheKey)
    if (cached) return cached

    const adapter = this.buildAdapter(provider, useCodex)
    this.adapters.set(cacheKey, adapter)
    return adapter
  }

  private buildAdapter(provider: AIProviderID, useCodex: boolean): LLMAdapter {
    switch (provider) {
      case 'anthropic':
        return createAnthropicAdapter(() => this.getAnthropicClient())
      case 'google':
        return createGeminiAdapter(() => this.getGeminiClient())
      case 'openai':
        return useCodex
          ? createCodexAdapter({ getClient: () => getCodexAppServerClient() })
          : createOpenAICompatibleAdapter({
              id: 'openai',
              getClient: () => this.getOpenAIClient(),
              // GPT-5 and the o-series reject `max_tokens`.
              tokenParam: 'max_completion_tokens',
              reasoningModelPattern: REASONING_MODEL_PATTERN,
            })
      case 'ollama':
        return createOpenAICompatibleAdapter({
          id: 'ollama',
          getClient: () => this.getOpenAICompatClient('ollama'),
          tokenParam: 'max_tokens',
          requestModelId: stripOllamaPrefix,
        })
      case 'mistral':
      case 'meta':
      case 'xai':
      case 'perplexity':
        return createOpenAICompatibleAdapter({
          id: provider,
          getClient: () => this.getOpenAICompatClient(provider),
          tokenParam: 'max_tokens',
        })
      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }
  }

  // ── Unified generation ──

  /** Build the single-user-turn request every prompt-shaped method sends. */
  private buildRequest(params: {
    system: string
    userMessage: string
    maxTokens: number
    temperature?: number
    signal?: AbortSignal
  }): GenerateRequest {
    return {
      model: this.model,
      system: params.system,
      messages: [{ role: 'user', content: params.userMessage }],
      maxTokens: params.maxTokens,
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
      ...(params.signal ? { signal: params.signal } : {}),
    }
  }

  private async generate(params: {
    system: string
    userMessage: string
    maxTokens: number
    temperature?: number
    signal?: AbortSignal
  }): Promise<GenerationResult> {
    const adapter = await this.getAdapter()
    const text = await adapter.generate(this.buildRequest(params))
    return { text }
  }

  private async streamGenerate(params: {
    system: string
    userMessage: string
    maxTokens: number
    temperature?: number
    signal?: AbortSignal
    onChunk: (chunk: string) => void
  }): Promise<string> {
    const adapter = await this.getAdapter()
    return adapter.stream(this.buildRequest(params), params.onChunk)
  }

  async generateNotes(
    slideContent: string,
    codeContent: string | null,
    deckTitle: string,
    slideIndex: number,
    signal?: AbortSignal
  ): Promise<string> {
    let userMessage = `Deck: "${deckTitle}"\nSlide ${slideIndex + 1}:\n\n${slideContent}`
    if (codeContent) {
      userMessage += `\n\nAssociated code:\n\`\`\`\n${codeContent}\n\`\`\``
    }

    const result = await this.generate({
      system: SYSTEM_PROMPT,
      userMessage,
      maxTokens: 1024,
      signal
    })
    return result.text
  }

  async streamNotes(
    slideContent: string,
    codeContent: string | null,
    deckTitle: string,
    slideIndex: number,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    let userMessage = `Deck: "${deckTitle}"\nSlide ${slideIndex + 1}:\n\n${slideContent}`
    if (codeContent) {
      userMessage += `\n\nAssociated code:\n\`\`\`\n${codeContent}\n\`\`\``
    }

    await this.streamGenerate({
      system: SYSTEM_PROMPT,
      userMessage,
      maxTokens: 1024,
      onChunk,
      signal
    })
  }

  async generateSlideContent(
    prompt: string,
    deckTitle: string,
    existingContent: string,
    signal?: AbortSignal
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
      maxTokens: 2048,
      signal
    })
    return result.text
  }

  async generateSvgChart(
    prompt: string,
    deckTitle: string,
    signal?: AbortSignal
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
      maxTokens: 4096,
      signal
    })
    return result.text
  }

  async beautifySlide(
    slideContent: string,
    deckTitle: string,
    slideLayout?: string,
    signal?: AbortSignal
  ): Promise<string> {
    const result = await this.generate({
      system: `You are a world-class McKinsey-level presentation designer. Transform slide content into visually striking, executive-quality markdown.

CANVAS: 1280×720px with 80px horizontal / 60px vertical padding → usable area ~1100×600px.
Content must breathe — aim for 50-70% fill. Sparse, high-impact slides beat dense walls of text.

RULES:
- Output ONLY the improved markdown — no explanations, no wrapping, no code fences around the output
- Do not change the meaning or remove information — restructure for clarity and impact
- Do not add fake data or made-up content
- Keep the same # title but make it punchier if possible
- Follow the 7×7 guideline as a default: prefer concise bullets. But preserve the user's style if they intentionally used a different format.

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
      maxTokens: 4096,
      signal
    })
    return result.text
  }

  async generateBulkSlides(
    prompt: string,
    deckTitle: string,
    existingSlides: string[],
    count: number,
    artifactContext?: string,
    signal?: AbortSignal
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
      maxTokens: 4096 * 2,
      signal
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
    artifactContext?: string,
    signal?: AbortSignal
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
- Follow the 7×7 guideline by default, but respect the user's style preferences
- For diagrams: use mermaid code blocks`,
      userMessage: `Deck: "${deckTitle}"\n\nCurrent slide:\n${slideContent}${artifactInfo}\n\nImprove this slide: ${userPrompt}`,
      maxTokens: 2048,
      signal
    })
    return result.text
  }

  async generateCode(
    prompt: string,
    language: string,
    existingCode: string,
    deckTitle: string,
    signal?: AbortSignal
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
      maxTokens: 2048,
      signal
    })

    let code = result.text
    code = code.replace(/^```\w*\n/, '').replace(/\n```$/, '')
    return code
  }

  async generateInlineText(
    prompt: string,
    slideContent: string,
    deckTitle: string,
    signal?: AbortSignal
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
      maxTokens: 256,
      signal
    })
    return result.text.slice(0, 300)
  }

  /**
   * LLM-as-judge critique of the whole deck: narrative arc, redundancy,
   * density and consistency. Read-only — returns an actionable Markdown review.
   */
  async reviewDeck(
    slides: { index: number; id: string; markdown: string; layout: string }[],
    deckTitle: string,
    signal?: AbortSignal
  ): Promise<string> {
    const slideDump = slides
      .map((s) => `--- Slide ${s.index + 1} (id: ${s.id}, layout: ${s.layout}) ---\n${s.markdown}`)
      .join('\n\n')

    const result = await this.generate({
      system: `You are a senior presentation design reviewer. Review a deck and return an actionable critique in Markdown.

Structure your review exactly as:
## Overall — one short paragraph verdict and a score out of 10.
## Narrative & flow — does it tell a story? Where does it sag or jump?
## Per-slide issues — one bullet per slide, each citing its slide number and a concrete fix.
## Prioritized fixes — the 3-5 highest-impact changes first.

Rules:
- Be specific: reference slide numbers and quote the offending text.
- Flag redundancy, over-dense slides (7×7 rule), orphan titles, missing takeaways, and inconsistent tone.
- Prefer concrete rewrites over vague advice.
- Do not invent content the deck does not have.`,
      userMessage: `Deck: "${deckTitle}"\n\n${slideDump}`,
      maxTokens: 4096,
      signal
    })
    return result.text
  }

  /**
   * Vision critique of a rendered slide screenshot. Returns a written critique
   * plus, when the model is confident it can fix the slide, corrected markdown.
   * Only Anthropic, Google and OpenAI (API-key mode) support image input; the
   * OpenAI-compatible providers and Codex fall back to a text-only note.
   */
  async reviewSlideVisual(
    imageBase64: string,
    mimeType: string,
    slideMarkdown: string,
    deckTitle: string,
    signal?: AbortSignal
  ): Promise<{ critique: string; improvedMarkdown: string | null }> {
    const prompt = `You are reviewing a rendered presentation slide (image) and its markdown source. Return a JSON object with exactly this shape:
{
  "issues": ["short issue", "short issue"],
  "improved_markdown": "full corrected markdown, or empty string if no change is needed"
}

Check for: text overflowing or clipped, elements overlapping, too-dense slides, poor hierarchy, misaligned columns, and anything that looks broken on screen. If there are no problems, return an empty issues array and an empty improved_markdown. When you do fix, output the FULL corrected markdown (never a fragment).`

    const provider = await this.resolveProvider(this.model)

    if (provider === 'google') {
      const client = await this.getGeminiClient()
      const response = await client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }]
          }
        ],
        config: {
          maxOutputTokens: 4096,
          ...(signal ? { abortSignal: signal } : {})
        }
      })
      return this.parseVisualResponse(response.text ?? '')
    }

    if (provider === 'anthropic') {
      const client = await this.getAnthropicClient()
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/png', data: imageBase64 } },
              { type: 'text', text: prompt }
            ]
          }
        ],
        ...(signal ? { signal } : {})
      })
      const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
      return this.parseVisualResponse(text)
    }

    if (provider === 'openai') {
      const client = await this.getOpenAIClient()
      const response = await client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
            ]
          }
        ],
        max_completion_tokens: 4096
      })
      return this.parseVisualResponse(response.choices?.[0]?.message?.content ?? '')
    }

    return {
      critique: 'The selected model/provider does not support image input for visual review. Switch to Claude, Gemini, or an OpenAI API-key model to use this.',
      improvedMarkdown: null
    }
  }

  /** Parse the JSON a vision critique returns; degrade to text-only on failure. */
  private parseVisualResponse(text: string): { critique: string; improvedMarkdown: string | null } {
    const parsed = this.extractJSON(text) as { issues?: string[]; improved_markdown?: string } | null
    if (parsed && Array.isArray(parsed.issues)) {
      const improved = typeof parsed.improved_markdown === 'string' && parsed.improved_markdown.trim()
        ? parsed.improved_markdown.trim()
        : null
      const critique = parsed.issues.length > 0 ? parsed.issues.map((i) => `- ${i}`).join('\n') : 'The slide renders correctly — no layout issues found.'
      return { critique, improvedMarkdown: improved }
    }
    return { critique: text.trim() || 'No visual feedback was returned.', improvedMarkdown: null }
  }

  async runPrompt(
    prompt: string,
    _slideContent: string,
    _deckTitle: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    await this.streamGenerate({
      system: `You are a helpful AI assistant. Be concise and direct. Use markdown formatting for clarity. Provide actionable, useful answers.`,
      userMessage: prompt,
      maxTokens: 2048,
      onChunk,
      signal
    })
  }

  /**
   * Inline the source material in a user message (bounded), or '' when absent.
   */
  private sourceBlock(sourceContent: string | null): string {
    if (!sourceContent) return ''
    return `\n\nSOURCE DOCUMENT — THIS IS YOUR PRIMARY INPUT:\n\`\`\`\n${sourceContent.slice(0, 30000)}\n\`\`\`\n\nYou MUST base the presentation content on the source document above. Extract real facts, data points, names, figures, and structure directly from it. Do NOT invent information that is not in the source document.`
  }

  /** Grounding rule appended to system prompts when source material is present. */
  private sourceSystemRule(sourceContent: string | null): string {
    if (!sourceContent) return ''
    return `\n\nCRITICAL RULE — SOURCE MATERIAL PROVIDED: The user has uploaded source material. You MUST ground ALL slide content in it. Extract actual data, facts, quotes, and structure. Do NOT hallucinate or fabricate information that is not present in the source. If the source does not contain enough for a slide, state what is available rather than making things up.`
  }

  /**
   * Brand-kit context from Settings: the user's brand name and voice, injected
   * into every generation prompt so decks stay on-brand without re-prompting.
   */
  private brandContext(): string {
    const s = getCachedSettings()
    const name = typeof s.brandName === 'string' ? s.brandName.trim() : ''
    const voice = typeof s.brandVoice === 'string' ? s.brandVoice.trim() : ''
    if (!name && !voice) return ''
    const lines: string[] = []
    if (name) lines.push(`- Brand/company name: ${name}`)
    if (voice) lines.push(`- Voice and tone: ${voice}`)
    return `\n\nBRAND GUIDELINES — follow these whenever you write slide content, speaker notes or articles:\n${lines.join('\n')}`
  }

  /**
   * Phase 1 of deck generation: produce a slide outline grounded in the source.
   * Returns the outline slides, or null if the model produced nothing usable.
   */
  private async generateOutline(
    prompt: string,
    title: string,
    sourceContent: string | null,
    slideCount: number,
    signal?: AbortSignal,
    options?: { tone?: string; verbosity?: string; language?: string; temperature?: number }
  ): Promise<{ id: string; title: string; layout: string; keyPoints: string[] }[] | null> {
    const result = await this.generate({
      system: `You are a technical presentation architect. Produce a slide outline for a ${slideCount}-slide deck.${this.sourceSystemRule(sourceContent)}${this.generationStyleRule(options)}

OUTPUT FORMAT: a valid JSON array of exactly ${slideCount} objects, no markdown, no explanation:
[
  { "id": "kebab-case-id", "title": "Slide heading", "layout": "default", "key_points": ["short bullet", "short bullet"] }
]

RULES:
- One entry per slide, in presentation order. Slide 1 is a title slide (layout "title"), the last slide closes with recommendations/next steps.
- Each entry has 2-5 key points. Layouts: title, center, section, two-col, three-col, top-bottom, big-number, quote, default.
- Ground every key point in the source material when present — no invented facts.
- Use a logical narrative arc: context → problem → solution → evidence → recommendation.`,
      userMessage: `Topic/instructions: ${prompt}\n\nSuggested title: "${title}"${this.sourceBlock(sourceContent)}\n\nGenerate exactly ${slideCount} outline entries as a JSON array.`,
      maxTokens: 4096,
      temperature: options?.temperature,
      signal
    })

    const parsed = this.extractJSON(result.text)
    const rawSlides = Array.isArray(parsed)
      ? parsed
      : parsed && Array.isArray((parsed as { slides?: unknown[] }).slides)
        ? (parsed as { slides: unknown[] }).slides
        : null
    if (!rawSlides || rawSlides.length === 0) return null

    // Sanitize: a local model may return key_points as a string, or omit fields.
    return rawSlides.map((s) => {
      const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
      return {
        id: typeof o.id === 'string' && o.id ? o.id : 'generated',
        title: typeof o.title === 'string' ? o.title : 'Slide',
        layout: typeof o.layout === 'string' ? o.layout : 'default',
        keyPoints: Array.isArray(o.keyPoints)
          ? o.keyPoints.filter((k): k is string => typeof k === 'string')
          : []
      }
    })
  }

  /** Style rule injected into generation prompts from tone / verbosity picks. */
  private generationStyleRule(options?: { tone?: string; verbosity?: string; language?: string }): string {
    const parts: string[] = []
    if (options?.tone && options.tone !== 'default') {
      parts.push(`- Tone: ${options.tone.replace(/_/g, ' ')}`)
    }
    if (options?.verbosity) {
      const density =
        options.verbosity === 'concise'
          ? 'Keep every slide tight: heading + 3-5 short bullets, no filler.'
          : options.verbosity === 'text-heavy'
            ? 'Write fuller slides: heading + detailed bullets, tables and takeaways where useful.'
            : 'Follow the default 7×7 density guideline.'
      parts.push(`- Content density: ${options.verbosity}. ${density}`)
    }
    if (parts.length === 0 && !options?.language) return ''
    if (options?.language && options.language !== 'English') {
      parts.push(`- Language: write the ENTIRE presentation (titles, body, takeaways) in ${options.language}`)
    }
    if (parts.length === 0) return ''
    return `\n\nSTYLE PREFERENCES:\n${parts.join('\n')}`
  }

  /**
   * Web-search grounding (Presenton `web_search`): run the whole generation
   * pass on Perplexity Sonar so claims are checked against live web results.
   * The user's model is restored afterwards, even on failure.
   */
  private async withWebSearch<T>(enabled: boolean | undefined, work: () => Promise<T>): Promise<T> {
    if (!enabled) return work()
    const key = await loadProviderKey('perplexity')
    if (!key) {
      throw new Error('Web search grounding needs a Perplexity API key. Add PERPLEXITY_API_KEY in Settings or your .env file.')
    }
    const prev = this.model
    this.setModel('sonar-pro')
    try {
      return await work()
    } finally {
      this.setModel(prev)
    }
  }

  /**
   * Public outline pass for the generation wizard: returns an editable outline
   * without writing any slides, so the UI can let the user reorder / edit first.
   */
  async generatePresentationOutline(
    prompt: string,
    title: string,
    sourceContent: string | null,
    slideCount: number,
    signal?: AbortSignal,
    options?: { tone?: string; verbosity?: string; language?: string; temperature?: number; webSearch?: boolean }
  ): Promise<{ id: string; title: string; layout: string; keyPoints: string[] }[]> {
    return this.withWebSearch(options?.webSearch, async () => {
      const outline = await this.generateOutline(prompt, title, sourceContent, slideCount, signal, options)
      if (!outline || outline.length === 0) {
        throw new Error('The model returned no outline. Try rephrasing the prompt.')
      }
      return outline
    })
  }

  /** The write-phase system prompt (moved out of the orchestrator). */
  private buildPresentationSystemPrompt(slideCount: number, sourceContent: string | null, options?: { tone?: string; verbosity?: string; language?: string }): string {
    return `You are a McKinsey-level presentation designer. You create executive-quality presentations that are rich in content, data-driven, and visually structured.${this.sourceSystemRule(sourceContent)}${this.brandContext()}${this.generationStyleRule(options)}

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
   - Follow the 7×7 guideline by default: ONE heading (~7 words), up to 7 concise bullets (~7 words each)
   - "title", "section", "big-number", "quote" layouts are intentionally minimal
   - "default" slides: heading + 4-7 concise bullets. Use ## sub-headings for visual breaks
   - "two-col" slides: 3-5 bullets per column max
   - Adapt structure and density if the user's prompt implies a different style
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
  }

  /**
   * Phase 2: expand the outline into full markdown slides.
   */
  private async generateSlidesFromOutline(
    prompt: string,
    title: string,
    sourceContent: string | null,
    outline: { id: string; title: string; layout: string; keyPoints: string[] }[] | null,
    slideCount: number,
    onProgress: (status: string, slideIndex: number, total: number) => void,
    signal?: AbortSignal,
    options?: { tone?: string; verbosity?: string; language?: string; temperature?: number }
  ): Promise<{ slides: { id: string; markdown: string; layout: string }[]; title: string }> {
    const outlineText = outline
      ? `\n\nOUTLINE TO FOLLOW (use these ids, titles and layouts exactly):\n${outline
          .map((s) => `- ${s.id} [${s.layout}] — "${s.title}": ${(s.keyPoints || []).join(' | ')}`)
          .join('\n')}`
      : ''

    const userMessage = `Create a complete ${slideCount}-slide presentation.${outlineText}${this.sourceBlock(sourceContent)}\n\nTopic/instructions: ${prompt}\n\nPresentation title suggestion: "${title}"\n\nGenerate the full presentation as a JSON object.${sourceContent ? ' Remember: ALL content must come from the source document above.' : ''}`

    let raw = ''
    let slidesFound = 0

    // Provider errors propagate to the caller — a failed request must not become a "successful" empty deck.
    await this.streamGenerate({
      system: this.buildPresentationSystemPrompt(slideCount, sourceContent, options),
      userMessage,
      maxTokens: 16384,
      temperature: options?.temperature,
      signal,
      onChunk: (chunk: string) => {
        raw += chunk
        const newCount = (raw.match(/"id"\s*:/g) || []).length
        if (newCount > slidesFound) {
          slidesFound = newCount
          onProgress(`Generating slide ${slidesFound} of ${slideCount}...`, slidesFound, slideCount)
        }
      }
    })

    console.log('[generateFullPresentation] raw length:', raw.length)

    if (!raw.trim()) {
      throw new Error('The model returned no content for the presentation.')
    }

    const parsed = this.extractJSON(raw)

    let slides: { id: string; markdown: string; layout: string }[] | null = null
    let finalTitle = title

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.slides) {
      slides = parsed.slides
      finalTitle = parsed.title || title
    } else if (Array.isArray(parsed) && parsed.length > 0) {
      slides = parsed.map((s: { id?: string; markdown?: string; layout?: string }) => ({
        id: s.id ?? 'generated',
        markdown: s.markdown ?? '',
        layout: s.layout || 'default'
      }))
    }

    if (slides && slides.length > 0) {
      // Post-process: ensure every "default" slide has body content, not just a title
      for (const slide of slides) {
        if (!slide.markdown) continue
        const lines = slide.markdown.split('\n').filter((l: string) => l.trim())
        const layout = slide.layout || 'default'
        if (['default', 'center'].includes(layout) && lines.length <= 2) {
          const hasOnlyHeading = lines.every((l: string) => l.startsWith('#') || l.trim() === '')
          if (hasOnlyHeading) {
            console.warn(`[generateFullPresentation] Slide "${slide.id}" has only a heading — converting to section layout`)
            slide.layout = 'section'
          }
        }
      }
      return { slides, title: finalTitle }
    }

    // Fallback — text was received but is not valid JSON: keep it as a single slide
    console.error('[generateFullPresentation] Failed to parse JSON from response. First 500 chars:', raw.slice(0, 500))
    return { slides: [{ id: 'generated', markdown: raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim(), layout: 'default' }], title }
  }

  /**
   * Phase 3: LLM-as-judge critique + one corrective pass over the generated
   * deck. Falls back to the input slides if the model returns unusable output.
   */
  private async refineSlides(
    prompt: string,
    title: string,
    sourceContent: string | null,
    slides: { id: string; markdown: string; layout: string }[],
    slideCount: number,
    signal?: AbortSignal
  ): Promise<{ slides: { id: string; markdown: string; layout: string }[]; title: string }> {
    const current = slides
      .map((s, i) => `--- Slide ${i + 1} (id: ${s.id}, layout: ${s.layout}) ---\n${s.markdown}`)
      .join('\n\n')

    const result = await this.generate({
      system: `You are a ruthless senior presentation editor. Review a generated deck and output a corrected version as JSON.${this.sourceSystemRule(sourceContent)}

OUTPUT FORMAT: a valid JSON object, no markdown, no explanation:
{
  "title": "Presentation Title",
  "slides": [ { "id": "same-id", "markdown": "# Title\\n\\ncorrected content", "layout": "default" } ]
}

FIX, in priority order:
1. Remove redundant slides and repeated points; merge where two slides say the same thing.
2. Tighten over-dense slides (7×7 rule) and fix orphan titles with no body.
3. Sharpen vague headings into specific, outcome-oriented ones.
4. Ensure each content slide has a clear takeaway; add **Key Takeaway:** where missing.
5. Fix factual errors and anything not grounded in the source material.

KEEP the same number of slides and their ids. Output the FULL corrected deck (every slide).`,
      userMessage: `Topic/instructions: ${prompt}\n\nTitle: "${title}"${this.sourceBlock(sourceContent)}\n\nCurrent deck (${slideCount} slides):\n\n${current}\n\nOutput the full corrected deck as a JSON object.`,
      maxTokens: 16384,
      signal
    })

    const parsed = this.extractJSON(result.text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.slides) && parsed.slides.length > 0) {
      const cleaned = (parsed.slides as { id?: string; markdown?: string; layout?: string }[]).map((s) => ({
        id: s.id ?? 'generated',
        markdown: s.markdown ?? '',
        layout: s.layout || 'default'
      }))
      return { slides: cleaned, title: (parsed as { title?: string }).title || title }
    }

    console.warn('[generateFullPresentation] Refine pass returned unusable output — keeping the pre-refine slides.')
    return { slides, title }
  }

  async generateFullPresentation(
    prompt: string,
    title: string,
    sourceContent: string | null,
    slideCount: number,
    onProgress: (status: string, slideIndex: number, total: number) => void,
    signal?: AbortSignal,
    options?: { tone?: string; verbosity?: string; language?: string; temperature?: number; webSearch?: boolean; outline?: { id: string; title: string; layout: string; keyPoints: string[] }[] | null }
  ): Promise<{ slides: { id: string; markdown: string; layout: string }[]; title: string }> {
    return this.withWebSearch(options?.webSearch, async () => {
      // Phase 1 — outline. The wizard may supply a user-edited outline; otherwise
      // generate one (optional — the write phase works without it).
      let outline: { id: string; title: string; layout: string; keyPoints: string[] }[] | null = options?.outline ?? null
      if (!outline) {
        try {
          onProgress('Outlining the presentation…', 0, slideCount)
          outline = await this.generateOutline(prompt, title, sourceContent, slideCount, signal, options)
        } catch (err) {
          console.warn('[generateFullPresentation] outline step failed; writing slides without it:', (err as Error).message)
        }
      }

      // Phase 2 — write the slides from the outline. This is the required step;
      // provider errors still propagate so a failed request never becomes an
      // empty deck.
      const written = await this.generateSlidesFromOutline(
        prompt,
        title,
        sourceContent,
        outline,
        slideCount,
        onProgress,
        signal,
        options
      )

      // Phase 3 — critique + one corrective pass (optional). Fall back to the
      // already-generated slides if this fails.
      let refined = written
      try {
        onProgress('Reviewing and refining…', slideCount, slideCount)
        refined = await this.refineSlides(prompt, title, sourceContent, written.slides, slideCount, signal)
      } catch (err) {
        console.warn('[generateFullPresentation] refine step failed; keeping the generated slides:', (err as Error).message)
      }

      onProgress('Generation complete', slideCount, slideCount)
      return { slides: refined.slides, title: refined.title || written.title || title }
    })
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
      const provider = await this.resolveProvider(this.model)
      if (provider === 'openai' && await this.shouldUseCodexForOpenAI()) {
        const account = await getCodexAppServerClient().accountRead(false)
        return account.account?.type === 'chatgpt'
      }
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
      if (p === 'openai' && await this.shouldUseCodexForOpenAI()) {
        try {
          const account = await getCodexAppServerClient().accountRead(false)
          if (account.account?.type === 'chatgpt') return true
        } catch {
          // Keep checking other providers.
        }
        continue
      }
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
  async getProviderStatuses(): Promise<{ id: string; hasKey: boolean; status: 'connected' | 'invalid' | 'not_configured'; keySource: 'env-file' | 'settings' | 'env-var' | 'codex' | null; authMode?: 'apiKey' | 'codex'; accountEmail?: string; accountPlan?: string }[]> {
    const openaiAuthMode = await loadOpenAIAuthMode()
    return Promise.all(
      AIService.ALL_PROVIDER_IDS.map(async (id) => {
        if (id === 'openai' && openaiAuthMode === 'codex') {
          try {
            const accountResponse = await getCodexAppServerClient().accountRead(false)
            const account = accountResponse.account
            if (account?.type === 'chatgpt') {
              return {
                id,
                hasKey: true,
                status: 'connected' as const,
                keySource: 'codex' as const,
                authMode: 'codex' as const,
                accountEmail: account.email,
                accountPlan: account.planType,
              }
            }
            return {
              id,
              hasKey: false,
              status: account ? 'invalid' as const : 'not_configured' as const,
              keySource: 'codex' as const,
              authMode: 'codex' as const,
            }
          } catch {
            return {
              id,
              hasKey: false,
              status: 'not_configured' as const,
              keySource: 'codex' as const,
              authMode: 'codex' as const,
            }
          }
        }

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
      const models = (data.models || []).map((m) => ({ id: m.name, name: m.name }))
      for (const m of models) this.knownOllamaModels.add(m.id)
      return models
    } catch {
      return []
    }
  }

  async streamArticle(
    deckTitle: string,
    author: string,
    slidesContent: { title: string; markdown: string; code: string | null; notes: string | null }[],
    rules: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
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
      onChunk,
      signal
    })
  }

  /** Build the chat system prompt for the current deck snapshot. */
  private buildChatSystemPrompt(snapshot: PresentationSnapshot): string {
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
      currentSlideContext = `\n\nCurrent slide (index ${snapshot.currentSlideIndex}) markdown source:\n${wrapDeckContent('current slide markdown', currentSlide.markdownContent)}`
      if (currentSlide.renderedHtml) {
        // Truncate very large HTML to avoid blowing up the context
        const html = currentSlide.renderedHtml.length > 4000
          ? currentSlide.renderedHtml.slice(0, 4000) + '\n... (truncated)'
          : currentSlide.renderedHtml
        currentSlideContext += `\n\nRendered HTML of current slide (what the user sees):\n${wrapDeckContent('current slide rendered html', html)}`
      }
    }

    const systemPrompt = `You are Lecta AI, an intelligent assistant embedded in the Lecta presentation app. You help users view, edit, and improve their presentations through natural conversation.

${DECK_CONTENT_NOTICE}
${this.brandContext()}

Current presentation context:
- Title: ${wrapDeckContent('title', snapshot.title)}
- Author: ${wrapDeckContent('author', snapshot.author)}
- Theme: ${snapshot.theme}
- Total slides: ${snapshot.slides.length}
- Currently viewing: Slide ${snapshot.currentSlideIndex + 1}
- Slide overview:
${wrapDeckContent('slide overview', slideOverview)}
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

    return systemPrompt
  }

  /**
   * Chat agent with tool use.
   *
   * Prompt building and the tool registry live here; the ReAct loop, the
   * confirmation gate and every provider wire format live behind the adapter
   * in `services/ai/`.
   */
  async chatWithTools(
    messages: Anthropic.MessageParam[],
    snapshot: PresentationSnapshot,
    actionMode: 'auto' | 'ask',
    onEvent: (event: ChatStreamEvent) => void,
    confirmAction?: (toolCallId: string, toolName: string, toolInput: unknown) => Promise<boolean>,
    requestCodeRun?: (slideIndex: number) => Promise<string>,
    captureSlide?: () => Promise<string>,
    signal?: AbortSignal
  ): Promise<Anthropic.MessageParam[]> {
    const capped = capChatHistory(messages)
    const adapter = await this.getAdapter()
    const context: ToolExecutionContext = {
      snapshot,
      aiService: this,
      ...(signal ? { signal } : {}),
      ...(requestCodeRun ? { runCode: requestCodeRun } : {}),
      ...(captureSlide ? { captureSlide } : {})
    }

    const tools: LoopTool[] = getAllTools().map((tool) => ({
      schema: {
        name: tool.schema.name,
        description: tool.schema.description || '',
        parameters: tool.schema.input_schema as Record<string, unknown>,
      },
      isMutation: tool.isMutation,
      ...(tool.alwaysConfirm ? { alwaysConfirm: true as const } : {}),
      execute: (input: Record<string, unknown>) => tool.execute(input, context),
    }))

    const request: GenerateRequest = {
      model: this.model,
      system: this.buildChatSystemPrompt(snapshot),
      messages: capped.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
      maxTokens: 4096,
      ...(signal ? { signal } : {}),
    }

    const { text } = await runToolLoop({ adapter, request, tools, actionMode, onEvent, confirmAction })

    onEvent({ type: 'done' })
    return text ? [...capped, { role: 'assistant', content: text }] : capped
  }
}
