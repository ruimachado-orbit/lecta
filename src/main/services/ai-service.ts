import Anthropic from '@anthropic-ai/sdk'
import { loadAnthropicKey, loadAnthropicModel } from './env-loader'
import { DEFAULT_AI_MODEL } from '../../../packages/shared/src/constants'

const SLIDE_7x7_RULE = `
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
${SLIDE_7x7_RULE}
Rules:
- Output ONLY valid markdown, no explanations or wrapping
- Use headings (#, ##), bullet points, bold, code blocks as appropriate
- For diagrams: use a mermaid code block (\`\`\`mermaid)
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
    deckTitle: string,
    slideLayout?: string
  ): Promise<string> {
    const client = await this.getClient()

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: `You are a world-class McKinsey-level presentation designer. Transform slide content into visually striking, executive-quality markdown.

CRITICAL RULES:
- Output ONLY the improved markdown — no explanations, no wrapping, no code fences around the output
- NEVER change the meaning or remove information — make it RICHER, not shorter
- NEVER add fake data or made-up content
- Keep the same # title but make it punchier if possible

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

STYLE: Minimalist but information-dense. Every word earns its place. Professional executive tone. Make metrics prominent and bold.

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
      messages: [
        {
          role: 'user',
          content: `Presentation: "${deckTitle}"
Slide layout type: ${slideLayout || 'default'}

Original slide content to beautify (preserve ALL information, enrich with better structure and formatting):

${slideContent}`
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
${SLIDE_7x7_RULE}
Rules:
- Output ONLY a valid JSON array, no markdown wrapping, no explanation
- Each element: { "id": "kebab-case-id", "markdown": "# Title\\n\\ncontent..." }
- Generate exactly ${count} slides
- Each slide: one # heading + max 7 short bullet points
- Content flows logically, no repetition
- For diagrams: use mermaid code blocks in markdown
- If existing slides provided, continue from where they left off`,
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
${SLIDE_7x7_RULE}
Rules:
- Output ONLY the improved markdown, nothing else
- Apply the user's requested changes
- Enforce the 7×7 rule — condense if needed
- For diagrams: use mermaid code blocks`,
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

  async generateCode(
    prompt: string,
    language: string,
    existingCode: string,
    deckTitle: string
  ): Promise<string> {
    const client = await this.getClient()

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: `You are an expert ${language} programmer. Generate code for a presentation demo.

Rules:
- Output ONLY valid ${language} code, no markdown wrapping, no explanation
- Code should be clean, well-commented, and demonstrate the concept clearly
- If existing code is provided, extend or improve it based on the prompt
- Keep it concise — this runs in a live presentation
- Include print/console output so results are visible when executed`,
      messages: [
        {
          role: 'user',
          content: `Deck: "${deckTitle}"\nLanguage: ${language}\n${existingCode ? `\nExisting code:\n${existingCode}\n` : ''}\nGenerate code: ${prompt}`
        }
      ]
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    let code = textBlock?.text ?? ''
    // Strip markdown code fences if AI wrapped them
    code = code.replace(/^```\w*\n/, '').replace(/\n```$/, '')
    return code
  }

  async generateInlineText(
    prompt: string,
    slideContent: string,
    deckTitle: string
  ): Promise<string> {
    const client = await this.getClient()

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 256,
      system: `You are a concise writing assistant for presentation slides. Generate a short sentence or phrase based on the user's prompt.

Rules:
- Output ONLY the generated text, nothing else — no quotes, no explanation, no markdown formatting
- Maximum 300 characters
- Match the tone and context of the existing slide content
- Be direct and punchy — this is for a presentation, not an essay
- Never wrap in quotes or add prefixes like "Here is..."`,
      messages: [
        {
          role: 'user',
          content: `Deck: "${deckTitle}"\n\nCurrent slide content:\n${slideContent}\n\nGenerate text for: ${prompt}`
        }
      ]
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    const text = textBlock?.text ?? ''
    return text.slice(0, 300)
  }

  async runPrompt(
    prompt: string,
    _slideContent: string,
    _deckTitle: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const client = await this.getClient()

    const stream = client.messages.stream({
      model: this.model,
      max_tokens: 2048,
      system: `You are a helpful AI assistant. Be concise and direct. Use markdown formatting for clarity. Provide actionable, useful answers.`,
      messages: [
        {
          role: 'user',
          content: prompt
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

  async generateFullPresentation(
    prompt: string,
    title: string,
    sourceContent: string | null,
    slideCount: number,
    onProgress: (status: string, slideIndex: number, total: number) => void
  ): Promise<{ slides: { id: string; markdown: string; layout: string }[]; title: string }> {
    const client = await this.getClient()

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
- "default" → Standard content. Padded 48px. Best for bullets, tables, mixed content.
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
3. **CONTENT DENSITY IS CRITICAL**: The slide canvas is 1280x720px with 48px padding. A slide that is less than 60% filled looks broken and amateur.
   - MINIMUM per "default" slide: 10-15 lines of markdown content (bullets, tables, blockquotes combined)
   - MINIMUM per "two-col" slide: 8-10 lines per column. Each column must have its own ## heading, 4-6 bullet points, and optionally a table or blockquote.
   - Use multi-level bullets (indent with spaces) to add detail under each point
   - Add a > **Key Takeaway:** blockquote at the bottom of content-heavy slides
   - Use status badges (🟢 🟡 🔴) inline with bullet points for visual richness
4. **One # heading per slide** (the slide title). Use ## for sub-sections within.
5. **Bold key terms and metrics**: **Revenue**, **+23%**, **$4.2M**
6. **Use tables** for any comparison of 3+ items. Tables should have 4+ rows with ALL cells filled.
7. **Prefer "default" layout** for content-heavy slides. Only use "two-col" when you have enough content to fill BOTH columns densely.
8. **Vary visual elements**: Each slide should use at least 2 different elements (bullets + table, bullets + blockquote, table + status badges, etc.)

STRUCTURE for ${slideCount} slides:
- Slide 1: Title slide (layout: "title") — just title + subtitle
- Slide 2: Executive summary or key findings (layout: "default" or "center")
- Slides 3-${slideCount - 1}: Deep content with tables, data, diagrams. Use section dividers where topics shift.
- Slide ${slideCount}: Recommendations or next steps (layout: "default")

Generate exactly ${slideCount} slides.`

    // Use streaming to track progress
    const stream = client.messages.stream({
      model: this.model,
      max_tokens: 16384,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: sourceContent
            ? `Create a complete ${slideCount}-slide presentation based on the following source document and instructions.${sourceContext}\n\nAdditional instructions from the user: ${prompt}\n\nPresentation title suggestion: "${title}"\n\nGenerate the full presentation as a JSON object. Remember: ALL content must come from the source document above.`
            : `Create a complete ${slideCount}-slide presentation.\n\nTopic/instructions: ${prompt}\n\nPresentation title suggestion: "${title}"\n\nGenerate the full presentation as a JSON object.`
        }
      ]
    })

    let raw = ''
    let slidesFound = 0

    try {
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          raw += event.delta.text

          // Count completed slides by tracking "id": occurrences (each slide object has one)
          const newCount = (raw.match(/"id"\s*:/g) || []).length
          if (newCount > slidesFound) {
            slidesFound = newCount
            onProgress(`Generating slide ${slidesFound} of ${slideCount}...`, slidesFound, slideCount)
          }
        }
      }
    } catch (streamErr) {
      console.error('[generateFullPresentation] Stream error:', streamErr)
    }

    console.log('[generateFullPresentation] raw length:', raw.length, 'first 200 chars:', raw.slice(0, 200))

    onProgress('Finalizing presentation...', slideCount, slideCount)

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(jsonMatch?.[0] ?? '{}')
      const slides = parsed.slides || []
      const finalTitle = parsed.title || title

      onProgress('Generation complete', slideCount, slideCount)

      return { slides, title: finalTitle }
    } catch {
      // Fallback: try to parse as array
      try {
        const arrayMatch = raw.match(/\[[\s\S]*\]/)
        const slides = JSON.parse(arrayMatch?.[0] ?? '[]')
        return { slides: slides.map((s: any) => ({ ...s, layout: s.layout || 'default' })), title }
      } catch {
        return { slides: [{ id: 'generated', markdown: raw, layout: 'default' }], title }
      }
    }
  }

  async hasApiKey(): Promise<boolean> {
    try {
      const apiKey = await loadAnthropicKey(currentDeckPath ?? undefined)
      return !!apiKey
    } catch {
      return false
    }
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
