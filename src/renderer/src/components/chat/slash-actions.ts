/**
 * What each slash command does.
 *
 * Every command calls the same service the prompt bar it replaced called
 * (`improveSlide`, `beautifySlide`, `streamNotes`, `generateCode`,
 * `generateChart`, `generateInlineText`, `generateImage`, `generateBulkSlides`),
 * so the behaviour is unchanged — only the place you type moved into the chat.
 *
 * The chat store owns the transcript; this module only performs the work and
 * reports back what to show.
 */
import type { LoadedSlide } from '../../../../../packages/shared/src/types/presentation'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { requireAI, showAIError } from '../ai/AIAlert'
import { formatRunOutcome, requestCodeRun } from './code-run-bridge'
import { insertAtCursor } from './inline-insert-bridge'
import { getSlashCommand, type SlashCommandName } from './slash-commands'

export type SlashOutcome =
  /** Handled here — show `message` as the assistant's reply, no model turn. */
  | { kind: 'done'; message: string }
  /** Handled here and it failed; a toast has already been shown. */
  | { kind: 'error'; message: string }
  /** Not a local action — send `prompt` to the agent as a normal turn. */
  | { kind: 'agent'; prompt: string }

interface SlideContext {
  index: number
  slide: LoadedSlide
  deckTitle: string
  rootPath: string
}

function currentSlideContext(): SlideContext | null {
  const { slides, currentSlideIndex, presentation } = usePresentationStore.getState()
  const slide = slides[currentSlideIndex]
  if (!slide || !presentation) return null
  return {
    index: currentSlideIndex,
    slide,
    deckTitle: presentation.title || 'Untitled',
    rootPath: presentation.rootPath
  }
}

/** Code, video, web app and artifacts on the slide — the context the bars sent. */
function artifactContext(slide: LoadedSlide): string | undefined {
  const parts: string[] = []
  if (slide.codeContent) parts.push(`Code (${slide.config.code?.language}):\n${slide.codeContent}`)
  if (slide.config.video) parts.push(`Video: ${slide.config.video.url}`)
  if (slide.config.webapp) parts.push(`Web App: ${slide.config.webapp.url}`)
  if (slide.config.artifacts.length > 0) {
    parts.push(`Artifacts: ${slide.config.artifacts.map((a) => a.label).join(', ')}`)
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

const NO_SLIDE = 'Open a presentation first — there is no slide to work on.'

function failed(err: unknown, what: string): SlashOutcome {
  showAIError(err)
  const msg = err instanceof Error ? err.message : String(err)
  return { kind: 'error', message: `${what} failed: ${msg}` }
}

/** Append markdown to the current slide and save it. */
function appendToSlide(ctx: SlideContext, addition: string): void {
  const store = usePresentationStore.getState()
  store.updateMarkdownContent(ctx.index, `${ctx.slide.markdownContent}\n\n${addition}`)
  void store.saveSlideContent(ctx.index)
}

async function runImprove(args: string): Promise<SlashOutcome> {
  const ctx = currentSlideContext()
  if (!ctx) return { kind: 'error', message: NO_SLIDE }
  try {
    const result = await window.electronAPI.improveSlide(
      ctx.slide.markdownContent,
      ctx.deckTitle,
      args,
      artifactContext(ctx.slide)
    )
    // Keep the marker the AI-generated bar used, so the slide stays labelled.
    const wasGenerated = ctx.slide.markdownContent.includes('<!-- ai-generated -->')
    const content = wasGenerated && !result.includes('<!-- ai-generated -->')
      ? `<!-- ai-generated -->\n${result}`
      : result
    const applied = usePresentationStore.getState().applyAIContent(ctx.index, content)
    return applied
      ? { kind: 'done', message: `Updated slide ${ctx.index + 1}: ${args}` }
      : { kind: 'error', message: 'This slide is executable MDX — AI edits are disabled for it.' }
  } catch (err) {
    return failed(err, 'Improving the slide')
  }
}

async function runPrettify(): Promise<SlashOutcome> {
  const ctx = currentSlideContext()
  if (!ctx) return { kind: 'error', message: NO_SLIDE }
  try {
    const result = await window.electronAPI.beautifySlide(
      ctx.slide.markdownContent,
      ctx.deckTitle,
      ctx.slide.config.layout
    )
    const applied = usePresentationStore.getState().applyAIContent(ctx.index, result)
    return applied
      ? { kind: 'done', message: `Beautified slide ${ctx.index + 1}.` }
      : { kind: 'error', message: 'This slide is executable MDX — AI edits are disabled for it.' }
  } catch (err) {
    return failed(err, 'Beautifying the slide')
  }
}

function runNotes(): Promise<SlashOutcome> {
  const ctx = currentSlideContext()
  if (!ctx) return Promise.resolve({ kind: 'error', message: NO_SLIDE })

  // Streamed so the notes pane fills in live, exactly as the Generate button did.
  return new Promise<SlashOutcome>((resolve) => {
    let accumulated = ''
    let settled = false
    const store = usePresentationStore.getState()

    const finish = (outcome: SlashOutcome): void => {
      if (settled) return
      settled = true
      resolve(outcome)
    }

    void window.electronAPI
      .streamNotes(
        ctx.slide.markdownContent,
        ctx.slide.codeContent,
        ctx.deckTitle,
        ctx.index,
        (chunk: string) => {
          if (chunk === '[DONE]') {
            store.updateNotesContent(ctx.index, accumulated)
            void store.saveSlideContent(ctx.index)
            finish({
              kind: 'done',
              message: `Speaker notes generated for slide ${ctx.index + 1}.`
            })
            return
          }
          if (chunk.startsWith('[ERROR]')) {
            finish(failed(new Error(chunk.replace('[ERROR]', '').trim()), 'Generating notes'))
            return
          }
          accumulated += chunk
          store.updateNotesContent(ctx.index, accumulated)
        }
      )
      .catch((err: unknown) => finish(failed(err, 'Generating notes')))
  })
}

async function runCodeGeneration(args: string): Promise<SlashOutcome> {
  const ctx = currentSlideContext()
  if (!ctx) return { kind: 'error', message: NO_SLIDE }
  const codeConfig = ctx.slide.config.code
  if (!codeConfig) {
    return { kind: 'error', message: 'This slide has no code block — add code to the slide first.' }
  }
  try {
    const code = await window.electronAPI.generateCode(
      args,
      codeConfig.language,
      ctx.slide.codeContent || '',
      ctx.deckTitle
    )
    const store = usePresentationStore.getState()
    store.updateCodeContent(ctx.index, code)
    void store.saveSlideContent(ctx.index)
    return { kind: 'done', message: `Updated the ${codeConfig.language} code on slide ${ctx.index + 1}.` }
  } catch (err) {
    return failed(err, 'Generating code')
  }
}

async function runChart(args: string): Promise<SlashOutcome> {
  const ctx = currentSlideContext()
  if (!ctx) return { kind: 'error', message: NO_SLIDE }
  try {
    const svg = await window.electronAPI.generateChart(args, ctx.deckTitle)
    appendToSlide(ctx, svg)
    return { kind: 'done', message: `Chart inserted into slide ${ctx.index + 1}.` }
  } catch (err) {
    return failed(err, 'Generating the chart')
  }
}

async function runImage(args: string): Promise<SlashOutcome> {
  const ctx = currentSlideContext()
  if (!ctx) return { kind: 'error', message: NO_SLIDE }
  try {
    const imagePath = await window.electronAPI.generateImage(ctx.rootPath, args, '16:9')
    appendToSlide(ctx, `![${args.slice(0, 60)}](${imagePath})`)
    return { kind: 'done', message: `Image inserted into slide ${ctx.index + 1}.` }
  } catch (err) {
    return failed(err, 'Generating the image')
  }
}

async function runInline(args: string): Promise<SlashOutcome> {
  const ctx = currentSlideContext()
  if (!ctx) return { kind: 'error', message: NO_SLIDE }
  try {
    const text = await window.electronAPI.generateInlineText(
      args,
      ctx.slide.markdownContent,
      ctx.deckTitle
    )
    if (!text) return { kind: 'error', message: 'The model returned nothing to insert.' }
    if (insertAtCursor(text)) {
      return { kind: 'done', message: 'Inserted at the cursor.' }
    }
    appendToSlide(ctx, text)
    return {
      kind: 'done',
      message: `No editor is focused, so the text was appended to slide ${ctx.index + 1}.`
    }
  } catch (err) {
    return failed(err, 'Generating text')
  }
}

async function runSlide(args: string): Promise<SlashOutcome> {
  const ctx = currentSlideContext()
  if (!ctx) return { kind: 'error', message: NO_SLIDE }
  try {
    const { slides } = usePresentationStore.getState()
    const generated = await window.electronAPI.generateBulkSlides(
      args,
      ctx.deckTitle,
      slides.map((s) => s.markdownContent),
      1
    )
    if (generated.length === 0) return { kind: 'error', message: 'No slide was generated.' }

    const marked = generated.map((s, i) => ({
      ...s,
      id: s.id || `ai-slide-${Date.now()}-${i + 1}`,
      markdown: `<!-- ai-generated -->\n${s.markdown}`
    }))
    const loaded = await window.electronAPI.addBulkSlides(ctx.rootPath, marked, ctx.index)
    usePresentationStore.setState({
      presentation: loaded.config,
      slides: loaded.slides,
      currentSlideIndex: ctx.index + 1,
      error: null
    })
    return { kind: 'done', message: `Added a new slide after slide ${ctx.index + 1}.` }
  } catch (err) {
    return failed(err, 'Generating the slide')
  }
}

function runDeck(args: string): SlashOutcome {
  const ui = useUIStore.getState()
  ui.setPendingGeneratePrompt(args)
  useUIStore.setState({ showAIGenerate: true })
  return {
    kind: 'done',
    message: 'Opened the deck generator with your prompt — pick a slide count and generate.'
  }
}

async function runExecute(): Promise<SlashOutcome> {
  try {
    const outcome = await requestCodeRun()
    return { kind: 'done', message: formatRunOutcome(outcome) }
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Commands that are simply a shorthand for asking the agent: the composer sends
 * this prompt as a normal turn instead of doing anything locally.
 */
export const AGENT_COMMAND_PROMPTS: Partial<Record<SlashCommandName, string>> = {
  explain:
    'Explain the code on the current slide and what its most recent run produced. ' +
    'Use get_slide_content for the code and get_last_output for the output; if there is ' +
    'no output yet, say so and explain what the code would do.',
  review:
    'Review this whole deck and give me an actionable critique. ' +
    'Call review_deck and present its findings: summarize the overall score, ' +
    'the narrative issues, and the 3-5 highest-impact fixes.',
  check:
    'Look at the current slide and check it for visual/layout problems. ' +
    'Call check_slide_visuals to screenshot the rendered slide and apply any fixes it finds.'
}

/** The agent prompt a command expands to, if it is one of those shorthands. */
export function agentPromptFor(command: SlashCommandName): string | undefined {
  return AGENT_COMMAND_PROMPTS[command]
}

/** Commands that never call a provider and so do not need an AI key. */
const NO_AI_NEEDED: ReadonlySet<SlashCommandName> = new Set<SlashCommandName>(['run', 'deck'])

/**
 * Run one slash command. Resolves with what the chat should show, or with an
 * `agent` prompt when the command is just a shorthand for asking the model.
 */
export async function runSlashCommand(
  command: SlashCommandName,
  args: string
): Promise<SlashOutcome> {
  const meta = getSlashCommand(command)
  if (meta?.requiresArgs && !args) {
    return {
      kind: 'error',
      message: `\`/${command}\` needs an argument — try \`/${command} ${meta.argsHint ?? '…'}\`.`
    }
  }
  if (!NO_AI_NEEDED.has(command) && !requireAI()) {
    return { kind: 'error', message: 'No AI provider is configured.' }
  }

  switch (command) {
    case 'improve':
      return runImprove(args)
    case 'prettify':
      return runPrettify()
    case 'notes':
      return runNotes()
    case 'code':
      return runCodeGeneration(args)
    case 'chart':
      return runChart(args)
    case 'image':
      return runImage(args)
    case 'inline':
      return runInline(args)
    case 'slide':
      return runSlide(args)
    case 'deck':
      return runDeck(args)
    case 'run':
      return runExecute()
    case 'explain':
      return { kind: 'agent', prompt: AGENT_COMMAND_PROMPTS.explain as string }
    case 'review':
      return { kind: 'agent', prompt: AGENT_COMMAND_PROMPTS.review as string }
    case 'check':
      return { kind: 'agent', prompt: AGENT_COMMAND_PROMPTS.check as string }
  }
}
