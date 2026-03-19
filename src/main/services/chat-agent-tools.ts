import type Anthropic from '@anthropic-ai/sdk'
import type { PresentationSnapshot, RendererAction } from '../../../packages/shared/src/types/chat'
import type { AIService } from './ai-service'

export interface ToolResult {
  success: boolean
  result: string
  rendererAction?: RendererAction
}

export interface ToolExecutionContext {
  snapshot: PresentationSnapshot
  aiService: AIService
}

export interface ToolDefinition {
  schema: Anthropic.Tool
  isMutation: boolean
  execute: (input: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolResult>
}

// --- Read-only tools ---

const getPresentationInfo: ToolDefinition = {
  schema: {
    name: 'get_presentation_info',
    description:
      'Get an overview of the entire presentation: title, author, theme, slide count, and a list of all slide IDs with their first heading.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  isMutation: false,
  execute: async (_input, context) => {
    const { snapshot } = context
    const slideList = snapshot.slides
      .map((s, i) => {
        const firstHeading =
          s.markdownContent
            .split('\n')
            .find((l) => l.startsWith('#'))
            ?.replace(/^#+\s*/, '')
            .slice(0, 60) || '(empty)'
        return `  [${i}] ${s.id} — ${firstHeading}`
      })
      .join('\n')

    return {
      success: true,
      result: `Presentation: "${snapshot.title}"\nAuthor: ${snapshot.author}\nTheme: ${snapshot.theme}\nTotal slides: ${snapshot.slides.length}\nCurrently viewing: Slide ${snapshot.currentSlideIndex + 1}\n\nSlides:\n${slideList}`
    }
  }
}

const getSlideContent: ToolDefinition = {
  schema: {
    name: 'get_slide_content',
    description:
      'Get the full content of a specific slide: markdown, code, speaker notes, layout, and transition.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slide_index: {
          type: 'number',
          description: 'The 0-based index of the slide'
        }
      },
      required: ['slide_index']
    }
  },
  isMutation: false,
  execute: async (input, context) => {
    const idx = input.slide_index as number
    const slide = context.snapshot.slides[idx]
    if (!slide) {
      return {
        success: false,
        result: `Slide ${idx} not found. Deck has ${context.snapshot.slides.length} slides (0-${context.snapshot.slides.length - 1}).`
      }
    }

    let result = `Slide ${idx + 1} (${slide.id}):\nLayout: ${slide.layout}\nTransition: ${slide.transition}\n\nMarkdown:\n${slide.markdownContent}`
    if (slide.codeContent) {
      result += `\n\nCode (${slide.codeLanguage}):\n${slide.codeContent}`
    }
    if (slide.notesContent) {
      result += `\n\nSpeaker Notes:\n${slide.notesContent}`
    }
    if (slide.renderedHtml) {
      const html = slide.renderedHtml.length > 4000
        ? slide.renderedHtml.slice(0, 4000) + '\n... (truncated)'
        : slide.renderedHtml
      result += `\n\nRendered HTML (what the user sees):\n${html}`
    }

    return { success: true, result }
  }
}

const getSlideHtml: ToolDefinition = {
  schema: {
    name: 'get_slide_html',
    description:
      'Get the rendered HTML of the current slide as displayed to the user. This shows the actual DOM structure including how tables, lists, and other elements are laid out. Only available for the currently viewed slide.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  isMutation: false,
  execute: async (_input, context) => {
    const idx = context.snapshot.currentSlideIndex
    const slide = context.snapshot.slides[idx]
    if (!slide) {
      return { success: false, result: `Current slide ${idx} not found.` }
    }
    if (!slide.renderedHtml) {
      return {
        success: true,
        result: `Rendered HTML not available. Here is the markdown source instead:\n${slide.markdownContent}`
      }
    }
    const html = slide.renderedHtml.length > 6000
      ? slide.renderedHtml.slice(0, 6000) + '\n... (truncated)'
      : slide.renderedHtml
    return {
      success: true,
      result: `Rendered HTML of slide ${idx + 1} (${slide.id}):\n${html}`
    }
  }
}

// --- Navigation tools ---

const navigateToSlide: ToolDefinition = {
  schema: {
    name: 'navigate_to_slide',
    description: 'Navigate to a specific slide by its 0-based index.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slide_index: {
          type: 'number',
          description: 'The 0-based index of the slide to navigate to'
        }
      },
      required: ['slide_index']
    }
  },
  isMutation: false,
  execute: async (input, context) => {
    const idx = input.slide_index as number
    if (idx < 0 || idx >= context.snapshot.slides.length) {
      return {
        success: false,
        result: `Invalid slide index ${idx}. Deck has ${context.snapshot.slides.length} slides (0-${context.snapshot.slides.length - 1}).`
      }
    }
    return {
      success: true,
      result: `Navigated to slide ${idx + 1} ("${context.snapshot.slides[idx].id}").`,
      rendererAction: { action: 'goToSlide', params: { index: idx } }
    }
  }
}

// --- Content mutation tools ---

const editSlideContent: ToolDefinition = {
  schema: {
    name: 'edit_slide_content',
    description:
      "Directly replace a slide's markdown content with new content. Use this for precise edits.",
    input_schema: {
      type: 'object' as const,
      properties: {
        slide_index: {
          type: 'number',
          description: 'The 0-based index of the slide to edit'
        },
        new_content: {
          type: 'string',
          description: 'The new markdown content for the slide'
        }
      },
      required: ['slide_index', 'new_content']
    }
  },
  isMutation: true,
  execute: async (input, context) => {
    const idx = input.slide_index as number
    const newContent = input.new_content as string
    const slide = context.snapshot.slides[idx]
    if (!slide) {
      return {
        success: false,
        result: `Slide ${idx} not found.`
      }
    }
    return {
      success: true,
      result: `Updated slide ${idx + 1} content.`,
      rendererAction: {
        action: 'updateAndSaveSlide',
        params: { slideIndex: idx, content: newContent }
      }
    }
  }
}

const improveSlide: ToolDefinition = {
  schema: {
    name: 'improve_slide',
    description:
      "Use AI to improve a slide's content based on an instruction. The slide content will be rewritten.",
    input_schema: {
      type: 'object' as const,
      properties: {
        slide_index: {
          type: 'number',
          description: 'The 0-based index of the slide to improve'
        },
        instruction: {
          type: 'string',
          description:
            'What to improve (e.g., "make it more concise", "add a comparison table")'
        }
      },
      required: ['slide_index', 'instruction']
    }
  },
  isMutation: true,
  execute: async (input, context) => {
    const idx = input.slide_index as number
    const instruction = input.instruction as string
    const slide = context.snapshot.slides[idx]
    if (!slide) return { success: false, result: `Slide ${idx} not found.` }

    try {
      const improved = await context.aiService.improveSlide(
        slide.markdownContent,
        context.snapshot.title,
        instruction
      )
      return {
        success: true,
        result: `Slide ${idx + 1} improved successfully.`,
        rendererAction: {
          action: 'updateAndSaveSlide',
          params: { slideIndex: idx, content: improved }
        }
      }
    } catch (err) {
      return { success: false, result: `Failed to improve slide: ${(err as Error).message}` }
    }
  }
}

const beautifySlide: ToolDefinition = {
  schema: {
    name: 'beautify_slide',
    description:
      'Auto-beautify a slide with McKinsey-style formatting: tables, status badges, structured bullets, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slide_index: {
          type: 'number',
          description: 'The 0-based index of the slide to beautify'
        }
      },
      required: ['slide_index']
    }
  },
  isMutation: true,
  execute: async (input, context) => {
    const idx = input.slide_index as number
    const slide = context.snapshot.slides[idx]
    if (!slide) return { success: false, result: `Slide ${idx} not found.` }

    try {
      const beautified = await context.aiService.beautifySlide(
        slide.markdownContent,
        context.snapshot.title,
        slide.layout
      )
      return {
        success: true,
        result: `Slide ${idx + 1} beautified successfully.`,
        rendererAction: {
          action: 'updateAndSaveSlide',
          params: { slideIndex: idx, content: beautified }
        }
      }
    } catch (err) {
      return { success: false, result: `Failed to beautify slide: ${(err as Error).message}` }
    }
  }
}

const generateSpeakerNotes: ToolDefinition = {
  schema: {
    name: 'generate_speaker_notes',
    description: 'Generate AI speaker notes for a specific slide.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slide_index: {
          type: 'number',
          description: 'The 0-based index of the slide'
        }
      },
      required: ['slide_index']
    }
  },
  isMutation: true,
  execute: async (input, context) => {
    const idx = input.slide_index as number
    const slide = context.snapshot.slides[idx]
    if (!slide) return { success: false, result: `Slide ${idx} not found.` }

    try {
      const notes = await context.aiService.generateNotes(
        slide.markdownContent,
        slide.codeContent,
        context.snapshot.title,
        idx
      )
      return {
        success: true,
        result: `Speaker notes generated for slide ${idx + 1}.`,
        rendererAction: {
          action: 'updateAndSaveNotes',
          params: { slideIndex: idx, content: notes }
        }
      }
    } catch (err) {
      return { success: false, result: `Failed to generate notes: ${(err as Error).message}` }
    }
  }
}

const generateCode: ToolDefinition = {
  schema: {
    name: 'generate_code',
    description: 'Generate or modify code for a slide.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slide_index: {
          type: 'number',
          description: 'The 0-based index of the slide'
        },
        prompt: {
          type: 'string',
          description: 'What code to generate or how to modify existing code'
        },
        language: {
          type: 'string',
          description:
            'Programming language (javascript, typescript, python, sql, bash, go, rust, etc.)'
        }
      },
      required: ['slide_index', 'prompt', 'language']
    }
  },
  isMutation: true,
  execute: async (input, context) => {
    const idx = input.slide_index as number
    const prompt = input.prompt as string
    const language = input.language as string
    const slide = context.snapshot.slides[idx]
    if (!slide) return { success: false, result: `Slide ${idx} not found.` }

    try {
      const code = await context.aiService.generateCode(
        prompt,
        language,
        slide.codeContent || '',
        context.snapshot.title
      )
      return {
        success: true,
        result: `Code generated for slide ${idx + 1} (${language}).`,
        rendererAction: {
          action: 'updateCode',
          params: { slideIndex: idx, content: code, language }
        }
      }
    } catch (err) {
      return { success: false, result: `Failed to generate code: ${(err as Error).message}` }
    }
  }
}

const generateChart: ToolDefinition = {
  schema: {
    name: 'generate_chart',
    description:
      'Generate an SVG chart or diagram (bar, line, pie, flow, architecture, timeline).',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'Description of the chart to generate'
        }
      },
      required: ['prompt']
    }
  },
  isMutation: true,
  execute: async (input, context) => {
    const prompt = input.prompt as string
    try {
      const svg = await context.aiService.generateSvgChart(prompt, context.snapshot.title)
      return {
        success: true,
        result: `Chart generated. SVG length: ${svg.length} characters.`,
        rendererAction: {
          action: 'insertChartInSlide',
          params: { slideIndex: context.snapshot.currentSlideIndex, svg }
        }
      }
    } catch (err) {
      return { success: false, result: `Failed to generate chart: ${(err as Error).message}` }
    }
  }
}

const generateImage: ToolDefinition = {
  schema: {
    name: 'generate_image',
    description: 'Generate an AI image and insert it into the current slide.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'Description of the image to generate'
        },
        aspect_ratio: {
          type: 'string',
          description: 'Aspect ratio: "1:1", "16:9", or "9:16". Default "16:9".'
        }
      },
      required: ['prompt']
    }
  },
  isMutation: true,
  execute: async (input, context) => {
    const prompt = input.prompt as string
    const aspectRatio = (input.aspect_ratio as string) || '16:9'
    try {
      // Image generation happens via IPC — we return a renderer action to trigger it
      return {
        success: true,
        result: `Image generation requested. The renderer will handle the actual generation.`,
        rendererAction: {
          action: 'generateImage',
          params: { prompt, aspectRatio }
        }
      }
    } catch (err) {
      return { success: false, result: `Failed to generate image: ${(err as Error).message}` }
    }
  }
}

// --- Structural tools ---

const addSlide: ToolDefinition = {
  schema: {
    name: 'add_slide',
    description: 'Create a new empty slide after the current slide.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slide_id: {
          type: 'string',
          description:
            'A kebab-case ID for the new slide (e.g., "introduction", "key-findings")'
        }
      },
      required: ['slide_id']
    }
  },
  isMutation: true,
  execute: async (input) => {
    const slideId = input.slide_id as string
    return {
      success: true,
      result: `New slide "${slideId}" will be created.`,
      rendererAction: { action: 'addSlide', params: { slideId } }
    }
  }
}

const deleteSlide: ToolDefinition = {
  schema: {
    name: 'delete_slide',
    description: 'Delete a slide by its index. This action cannot be undone.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slide_index: {
          type: 'number',
          description: 'The 0-based index of the slide to delete'
        }
      },
      required: ['slide_index']
    }
  },
  isMutation: true,
  execute: async (input, context) => {
    const idx = input.slide_index as number
    if (idx < 0 || idx >= context.snapshot.slides.length) {
      return { success: false, result: `Invalid slide index ${idx}.` }
    }
    return {
      success: true,
      result: `Slide ${idx + 1} ("${context.snapshot.slides[idx].id}") will be deleted.`,
      rendererAction: { action: 'deleteSlide', params: { slideIndex: idx } }
    }
  }
}

const reorderSlides: ToolDefinition = {
  schema: {
    name: 'reorder_slides',
    description: 'Move a slide from one position to another.',
    input_schema: {
      type: 'object' as const,
      properties: {
        from_index: {
          type: 'number',
          description: 'The current 0-based index of the slide'
        },
        to_index: {
          type: 'number',
          description: 'The target 0-based index to move the slide to'
        }
      },
      required: ['from_index', 'to_index']
    }
  },
  isMutation: true,
  execute: async (input, context) => {
    const from = input.from_index as number
    const to = input.to_index as number
    const len = context.snapshot.slides.length
    if (from < 0 || from >= len || to < 0 || to >= len) {
      return { success: false, result: `Invalid indices. Deck has ${len} slides (0-${len - 1}).` }
    }
    return {
      success: true,
      result: `Moved slide from position ${from + 1} to ${to + 1}.`,
      rendererAction: { action: 'reorderSlide', params: { fromIndex: from, toIndex: to } }
    }
  }
}

const changeLayout: ToolDefinition = {
  schema: {
    name: 'change_layout',
    description:
      'Change a slide\'s layout. Available layouts: default, center, title, section, two-col, two-col-wide-left, two-col-wide-right, three-col, top-bottom, big-number, quote, blank.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slide_index: {
          type: 'number',
          description: 'The 0-based index of the slide'
        },
        layout: {
          type: 'string',
          description: 'The layout type to set'
        }
      },
      required: ['slide_index', 'layout']
    }
  },
  isMutation: true,
  execute: async (input, context) => {
    const idx = input.slide_index as number
    const layout = input.layout as string
    if (!context.snapshot.slides[idx]) {
      return { success: false, result: `Slide ${idx} not found.` }
    }
    return {
      success: true,
      result: `Changed slide ${idx + 1} layout to "${layout}".`,
      rendererAction: { action: 'setSlideLayout', params: { slideIndex: idx, layout } }
    }
  }
}

const generateSlides: ToolDefinition = {
  schema: {
    name: 'generate_slides',
    description: 'Generate multiple new slides from a prompt using AI.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'Instructions for what slides to generate'
        },
        count: {
          type: 'number',
          description: 'Number of slides to generate (1-10)'
        }
      },
      required: ['prompt', 'count']
    }
  },
  isMutation: true,
  execute: async (input, context) => {
    const prompt = input.prompt as string
    const count = Math.min(Math.max(input.count as number, 1), 10)
    const existingSlides = context.snapshot.slides.map((s) => s.markdownContent)

    try {
      const slides = await context.aiService.generateBulkSlides(
        prompt,
        context.snapshot.title,
        existingSlides,
        count
      )
      return {
        success: true,
        result: `Generated ${slides.length} new slides.`,
        rendererAction: {
          action: 'addBulkSlides',
          params: { slides }
        }
      }
    } catch (err) {
      return { success: false, result: `Failed to generate slides: ${(err as Error).message}` }
    }
  }
}

// --- Exports ---

const allTools: ToolDefinition[] = [
  getPresentationInfo,
  getSlideContent,
  getSlideHtml,
  navigateToSlide,
  editSlideContent,
  improveSlide,
  beautifySlide,
  generateSpeakerNotes,
  generateCode,
  generateChart,
  generateImage,
  addSlide,
  deleteSlide,
  reorderSlides,
  changeLayout,
  generateSlides
]

export function getAllTools(): ToolDefinition[] {
  return allTools
}

export function getToolSchemas(): Anthropic.Tool[] {
  return allTools.map((t) => t.schema)
}

export function findTool(name: string): ToolDefinition | undefined {
  return allTools.find((t) => t.schema.name === name)
}
