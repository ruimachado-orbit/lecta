import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  createPresentation,
  addSlide,
  editSlide,
  deleteSlide,
  listSlides,
  setTheme,
  addArtifact,
  addImage,
  customizeTheme,
  getDefaultPresentationsPath,
  generateAIImage,
  // Design System
  listDesignElements,
  getDesignElement,
  saveDesignElement,
  deleteDesignElement,
  loadDesignSystem,
  // Slide Library
  listSlideLibrary,
  getSlideFromLibrary,
  saveSlideToLibrary,
  insertLibrarySlide,
} from './lib/presentation-io.js'
import type { SlideLayout, SlideTransition, SupportedLanguage } from './lib/presentation-io.js'

// ── MCP Prompt: The Lecta Presentation Skill ──

const PRESENTATION_SKILL = `You are an expert presentation designer working with Lecta, a technical presentation platform.

## Slide Format — MDX (default)
Always use format "mdx" for visually rich slides. MDX slides are pure JSX/React:
- Every slide MUST be a single root <div> covering the full 1280×720 canvas
- Root div: <div style={{width:'100%',height:'100%',background:'#0a0e1a',padding:'60px 80px',position:'relative',overflow:'hidden'}}>
- Titles are styled <div>s, NOT markdown # headings
- Bullets are styled <div>s, NOT markdown "- " lines
- Bold uses <span style={{fontWeight:700}}>, NOT **bold**
- NO markdown syntax anywhere in MDX slides
- Use flexbox, grid, gradients, and border-radius for polished layouts
- Images: <img src="images/photo.png" style={{maxWidth:'100%',borderRadius:'8px'}} />
- If not confident with JSX, fall back to format "md" (plain markdown, always supported)

## The 7×7 Guideline (default style — adapt when the user asks for something different)
- ONE heading per slide (aim for ~7 words)
- Prefer up to 7 bullet points per slide
- Keep bullets concise (~7 words each)
- Favor bullets over paragraphs for scannability, but follow user preferences when they request a different style

## Deck Structure
1. **Title slide** (layout: title) — topic + speaker name
2. **Agenda/Overview** (layout: default) — what you'll cover
3. **Content slides** — 1 idea per slide, mix layouts
4. **Summary/Takeaways** (layout: default or big-number) — key points
5. **Closing** (layout: center or title) — call to action

## Layout Selection Guide
- **title** — opening slide: big title + subtitle
- **section** — section dividers between major topics
- **default** — standard bullet-point content
- **two-col** — comparisons, pros/cons, before/after
- **big-number** — key statistics, metrics, KPIs
- **quote** — testimonials, memorable statements
- **center** — single key message or announcement
- **three-col** — three categories side by side
- **top-bottom** — diagram on top, explanation below
- **blank** — full-canvas for images or custom layouts

## Theme Selection
- **dark** / **keynote-dark** — tech talks, developer conferences
- **executive** — board meetings, leadership reviews
- **corporate** — client presentations, enterprise
- **minimal** — academic, clean, content-focused
- **creative** — startups, creative pitches
- **paper** — editorial, warm, storytelling
- **light** — general purpose, safe default

## Design System
Lecta has a shared design system that stores reusable elements across ALL presentations.
Before creating slides, ALWAYS call list_design_elements to check for existing:
- **Components** — Reusable JSX blocks (cards, headers, stat grids, etc.)
- **Color palettes** — Named color sets for consistent branding
- **Typography** — Font + size + weight presets
- **Snippets** — Small JSX pieces (accent bars, bullets, badges)
- **Layout patterns** — Full-slide JSX templates

When you create a visually polished element, save it with save_design_element so it can be reused.
Use {{PLACEHOLDER}} syntax in saved components for variable content.

## Slide Library
Users can save reusable slides to a personal library. Before building from scratch:
1. Call list_library_slides to check if a suitable slide already exists
2. Use insert_library_slide to add it to the presentation
3. After creating a great slide, offer to save_slide_to_library for reuse

## Workflow
1. **Check design system**: list_design_elements — load existing components, colors, typography
2. **Check slide library**: list_library_slides — see if reusable slides exist
3. Create the presentation with create_presentation (pick a good theme, format: "mdx")
4. Edit slide 0 (the title slide) with proper JSX content, using design system elements
5. Add remaining slides one by one with add_slide (format: "mdx"), reusing saved components
6. Use generate_ai_image to create images with DALL-E, Gemini, or Nano Banana
7. Use add_image to embed local images into slides
8. Use customize_theme to override colors/fonts if needed
9. Use list_slides to review the deck
10. **Save good elements**: save_design_element for reusable components, save_slide_to_library for reusable slides
11. Do NOT export — the user views it in the Lecta app`

export function createLectaServer(): McpServer {
  const server = new McpServer({
    name: 'lecta',
    version: '0.1.0',
  })

  // ── MCP Prompts ──
  server.prompt(
    'create-deck',
    'Expert guide for creating professional Lecta presentations with proper layouts, structure, and styling',
    () => ({
      messages: [{
        role: 'user' as const,
        content: { type: 'text' as const, text: PRESENTATION_SKILL },
      }],
    })
  )

  server.prompt(
    'use-design-system',
    'Load the full design system (all reusable components, palettes, typography, snippets) for building consistent presentations',
    async () => {
      const ds = await loadDesignSystem()
      if (ds.elements.length === 0) {
        return {
          messages: [{
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'The design system is currently empty. As you create presentations, save reusable elements with save_design_element to build up a consistent visual library. Categories: component, color-palette, typography, snippet, layout-pattern.',
            },
          }],
        }
      }

      const grouped: Record<string, typeof ds.elements> = {}
      for (const el of ds.elements) {
        if (!grouped[el.category]) grouped[el.category] = []
        grouped[el.category].push(el)
      }

      let text = `# Design System — ${ds.elements.length} elements\n\n`
      text += 'Use these elements for visual consistency across all presentations.\n\n'

      for (const [category, elements] of Object.entries(grouped)) {
        text += `## ${category.charAt(0).toUpperCase() + category.slice(1).replace('-', ' ')} (${elements.length})\n\n`
        for (const el of elements) {
          text += `### ${el.name} [${el.id}]\n`
          text += `${el.description}\n`
          text += `Tags: ${el.tags.join(', ')}\n`
          text += '```\n' + el.content + '\n```\n\n'
        }
      }

      return {
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text },
        }],
      }
    }
  )

  // ── Slide content guidelines (shared across tool descriptions) ──
  const SLIDE_CONTENT_GUIDE = `

SLIDE CONTENT GUIDELINES — follow these for every slide:

Canvas: 1280×720px. Slides should fill the entire canvas.

7×7 Guideline (default style — adapt when the user asks for something different):
1. One title/heading per slide (aim for ~7 words)
2. Prefer up to 7 bullet points below the heading
3. Keep bullets concise (~7 words each)
4. Favor bullets over paragraphs for scannability
5. Emphasize 1-2 key words per bullet
6. If content is dense, consider splitting across slides
7. When the user requests a different style (longer text, paragraphs, etc.), follow their preference

MDX format (preferred):
- ALWAYS set format to "mdx" — it produces richer, more visual slides
- MDX slides must be 100% PURE JSX/React — absolutely NO markdown syntax anywhere
- DO NOT use markdown headings (# ## ###), markdown bullets (- or *), markdown bold (**text**), markdown code (\`code\`), markdown blockquotes (>), or any other markdown syntax
- The slide TITLE must be a styled <div> element, NOT a markdown # heading
- Bullets must be styled <div> elements, NOT markdown "- " lines
- Bold text must use <span style={{fontWeight:700}}>, NOT markdown **bold**
- Code/monospace text must use <span style={{fontFamily:'monospace'}}>, NOT markdown \`backticks\`
- MDX slides automatically get the full 1280×720 canvas with NO padding — you control all spacing via your own styles
- Every MDX slide MUST start with a single root <div> that covers the full canvas: <div style={{width:'100%',height:'100%',background:'#0a0e1a',padding:'60px 80px',position:'relative',overflow:'hidden'}}>
- Use <div> with style objects for custom layouts: <div style={{display: 'flex', gap: '16px'}}>
- Style props use camelCase: fontSize, backgroundColor, borderRadius, fontWeight, etc.
- Build card grids with CSS Grid: <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px'}}>
- Styled containers: <div style={{background: 'rgba(255,255,255,0.08)', padding: '24px', borderRadius: '12px'}}>
- Gradients for cards: <div style={{background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '14px', padding: '28px', color: 'white'}}>
- Images: <img src="images/photo.png" style={{width: '400px', borderRadius: '8px'}} />
- Keep JSX simple — no import statements, no custom components, just HTML tags + style objects
- FALLBACK: If you are not confident writing pure JSX/React, use plain .md format with markdown syntax instead — it is always supported

Layout-specific rules (all content as JSX, no markdown):
- "title": Large styled title <div> + optional subtitle <div> only, NO bullets
- "section": Bold styled heading + 1 line description (divider slide)
- "center": Centered content — keep minimal (quote, stat, key message)
- "big-number": ONE large metric <div> + 2-3 context <div> bullets
- "quote": Single styled blockquote with attribution
- "two-col" / "two-col-wide-*": Use flexbox with two columns, max 4 bullet <div>s per column
- "three-col": Three flex columns, max 3 bullet <div>s each
- "top-bottom": Use flexbox with column direction for top/bottom halves
- "default": Styled title <div> + bullet <div>s
- "blank": Full canvas, no padding — use for custom positioned elements

WRONG (uses markdown in MDX — headings and bullets render outside the styled container):
# Machine Learning Pipeline

- **Collect** → raw data from sources
- **Engineer** → meaningful features

RIGHT (pure JSX — full control over layout and styling, title is a styled div):
<div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,#0a0e1a,#0f1729)',padding:'60px 80px',position:'relative',overflow:'hidden'}}>
  <div style={{fontSize:'11px',letterSpacing:'3px',color:'#00c8ff',textTransform:'uppercase',marginBottom:'24px'}}>Section Title</div>
  <div style={{fontSize:'44px',fontWeight:800,color:'#fff',marginBottom:'40px'}}>ML Pipeline Overview</div>
  <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
    <div style={{fontSize:'18px',color:'#e2e8f0'}}><span style={{fontWeight:700,color:'#00c8ff'}}>Collect</span> → raw data from sources</div>
    <div style={{fontSize:'18px',color:'#e2e8f0'}}><span style={{fontWeight:700,color:'#00c8ff'}}>Engineer</span> → meaningful features</div>
    <div style={{fontSize:'18px',color:'#e2e8f0'}}><span style={{fontWeight:700,color:'#00c8ff'}}>Train</span> → select and fit model</div>
    <div style={{fontSize:'18px',color:'#e2e8f0'}}><span style={{fontWeight:700,color:'#00c8ff'}}>Deploy</span> → containerize and serve</div>
  </div>
</div>`

  // ── create_presentation ──
  server.tool(
    'create_presentation',
    `Create a new Lecta presentation. Always use format 'mdx' for visually rich slides with inline JSX/React. If you are not confident writing JSX/React, fall back to 'md'. The presentation is saved to disk and the user opens it in the Lecta app to view, edit, and present. Do NOT call any export tool after this — the user views it in the app. If path is omitted, presentations are saved to ~/Documents/Lecta.${SLIDE_CONTENT_GUIDE}`,
    {
      title: z.string().describe('Presentation title'),
      theme: z.enum(['dark', 'light', 'executive', 'minimal', 'corporate', 'creative', 'keynote-dark', 'paper']).optional().describe('Visual theme (default: dark)'),
      author: z.string().optional().describe('Author name'),
      slide_count: z.number().min(1).max(50).optional().describe('Number of starter slides (default: 1)'),
      slide_titles: z.array(z.string()).optional().describe('Titles for each starter slide'),
      path: z.string().optional().describe('Parent directory (default: ~/Documents/Lecta). Only set if the user specifies a custom location.'),
      format: z.enum(['md', 'mdx']).optional().describe('Slide file format (default: mdx). Use mdx for rich slides with inline JSX/React styling. Fall back to md if you are not comfortable with JSX/React.'),
    },
    async (params) => {
      const result = await createPresentation({
        path: params.path,
        title: params.title,
        theme: params.theme,
        author: params.author,
        slideCount: params.slide_count,
        slideTitles: params.slide_titles,
        format: params.format,
      })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            rootPath: result.rootPath,
            slideCount: result.slideCount,
            message: `Created "${params.title}" with ${result.slideCount} slide(s) at ${result.rootPath}. The user can now open it in Lecta. Do NOT export.`,
          }, null, 2),
        }],
      }
    }
  )

  // ── add_slide ──
  server.tool(
    'add_slide',
    `Add a new slide to an existing Lecta presentation. Use MDX (.mdx) format for rich, visually styled slides with inline JSX/React. If you are not confident writing JSX/React, fall back to plain Markdown (.md) which is always supported. The slide_id is auto-generated from the content heading if omitted.${SLIDE_CONTENT_GUIDE}`,
    {
      presentation_path: z.string().describe('Root path of the presentation (returned by create_presentation)'),
      title: z.string().optional().describe('Short slide title for the navigation bar (not rendered on the slide). Auto-derived from content heading if omitted.'),
      content: z.string().describe('MDX (preferred) or Markdown content for the slide. For MDX: write pure JSX with a root <div> covering the full canvas — title must be a styled <div>, not a markdown # heading. For MD: start with a single # heading. Follow the 7×7 guideline by default (concise bullets, ~7 words each) but adapt to the user\'s requested style.'),
      layout: z.enum(['default', 'center', 'title', 'section', 'two-col', 'two-col-wide-left', 'two-col-wide-right', 'three-col', 'top-bottom', 'big-number', 'quote', 'blank']).optional().describe('Slide layout (default: "default")'),
      code: z.object({
        content: z.string().describe('Code content'),
        language: z.enum([
          'javascript', 'typescript', 'python', 'sql', 'html', 'css',
          'json', 'bash', 'rust', 'go', 'java', 'csharp', 'ruby', 'php', 'markdown'
        ]).describe('Programming language'),
      }).optional().describe('Code block to attach to the slide'),
      notes: z.string().optional().describe('Speaker notes'),
      format: z.enum(['md', 'mdx']).optional().describe('Slide file format (default: mdx). Use mdx for rich slides with inline JSX/React styling. Fall back to md if you are not comfortable with JSX/React.'),
    },
    async (params) => {
      const result = await addSlide({
        rootPath: params.presentation_path,
        title: params.title,
        content: params.content,
        layout: params.layout as SlideLayout | undefined,
        format: params.format,
        code: params.code ? {
          content: params.code.content,
          language: params.code.language as SupportedLanguage,
        } : undefined,
        notes: params.notes,
      })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            slideIndex: result.slideIndex,
            slideCount: result.slideCount,
          }, null, 2),
        }],
      }
    }
  )

  // ── edit_slide ──
  server.tool(
    'edit_slide',
    `Edit an existing slide in a Lecta presentation.${SLIDE_CONTENT_GUIDE}`,
    {
      presentation_path: z.string().describe('Root path of the presentation'),
      slide_index: z.number().describe('0-based slide index'),
      title: z.string().optional().describe('New slide title for the navigation bar (not rendered on the slide)'),
      content: z.string().optional().describe('New markdown content (replaces entire slide)'),
      layout: z.enum(['default', 'center', 'title', 'section', 'two-col', 'two-col-wide-left', 'two-col-wide-right', 'three-col', 'top-bottom', 'big-number', 'quote', 'blank']).optional().describe('New layout'),
      code_content: z.string().optional().describe('New code content'),
      notes: z.string().optional().describe('New speaker notes'),
      transition: z.enum(['none', 'left', 'right', 'top', 'bottom']).optional().describe('Slide transition'),
      format: z.enum(['md', 'mdx']).optional().describe('Convert slide to this format (default: mdx). Changes the file extension and updates the config. Use mdx for rich slides with inline JSX/React styling. Fall back to md if you are not comfortable with JSX/React.'),
    },
    async (params) => {
      const result = await editSlide({
        rootPath: params.presentation_path,
        slideIndex: params.slide_index,
        title: params.title,
        content: params.content,
        layout: params.layout as SlideLayout | undefined,
        codeContent: params.code_content,
        notes: params.notes,
        transition: params.transition as SlideTransition | undefined,
        format: params.format,
      })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, slideId: result.slideId }, null, 2),
        }],
      }
    }
  )

  // ── delete_slide ──
  server.tool(
    'delete_slide',
    'Delete a slide (cannot delete the last one)',
    {
      presentation_path: z.string().describe('Root path of the presentation'),
      slide_index: z.number().describe('0-based slide index'),
    },
    async (params) => {
      const result = await deleteSlide(params.presentation_path, params.slide_index)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            deletedId: result.deletedId,
            remaining: result.slideCount,
          }, null, 2),
        }],
      }
    }
  )

  // ── list_slides ──
  server.tool(
    'list_slides',
    'List all slides in a presentation',
    {
      presentation_path: z.string().describe('Root path of the presentation'),
      include_content: z.boolean().optional().describe('Include full markdown content (default: false)'),
    },
    async (params) => {
      const result = await listSlides(params.presentation_path, params.include_content)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      }
    }
  )

  // ── set_theme ──
  server.tool(
    'set_theme',
    'Change the visual theme',
    {
      presentation_path: z.string().describe('Root path of the presentation'),
      theme: z.enum(['dark', 'light', 'executive', 'minimal', 'corporate', 'creative', 'keynote-dark', 'paper']).describe('Theme to apply'),
    },
    async (params) => {
      const result = await setTheme(params.presentation_path, params.theme)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, oldTheme: result.oldTheme, newTheme: result.newTheme }, null, 2),
        }],
      }
    }
  )

  // ── add_artifact ──
  server.tool(
    'add_artifact',
    'Attach a non-image file (PDF, document, spreadsheet) to a slide as a downloadable artifact. Do NOT use this for images — use the add_image tool instead to embed images directly into slide content. Only use add_artifact for images if the user explicitly asks for it as an attachment.',
    {
      presentation_path: z.string().describe('Root path of the presentation'),
      slide_index: z.number().describe('0-based slide index'),
      file_path: z.string().describe('Absolute path to the file'),
      label: z.string().optional().describe('Display label'),
    },
    async (params) => {
      const result = await addArtifact({
        rootPath: params.presentation_path,
        slideIndex: params.slide_index,
        filePath: params.file_path,
        label: params.label,
      })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, artifactPath: result.artifactPath, label: result.label }, null, 2),
        }],
      }
    }
  )

  // ── add_image ──
  server.tool(
    'add_image',
    'Add a local image file to the presentation and embed it into a slide. This is the PRIMARY tool for adding images — always use this instead of add_artifact for images. Copies the image into the presentation\'s images/ directory and inserts it into the slide content. For MDX slides use <img src="images/..." /> in the slide JSX. Returns the relative path. Supported formats: PNG, JPG, JPEG, GIF, SVG, WebP, BMP.',
    {
      presentation_path: z.string().describe('Root path of the presentation (returned by create_presentation)'),
      file_path: z.string().describe('Absolute path to the local image file to add'),
      slide_index: z.number().optional().describe('0-based slide index to insert the image into. If omitted, the image is only copied to images/ without inserting into any slide.'),
      alt_text: z.string().optional().describe('Alt text for the image (used in markdown ![alt](...) syntax)'),
      position: z.object({
        x: z.number().describe('X position in pixels from left'),
        y: z.number().describe('Y position in pixels from top'),
        w: z.number().describe('Width in pixels'),
      }).optional().describe('Position the image absolutely on the slide canvas (1280x720). If omitted, inserts as inline markdown image.'),
    },
    async (params) => {
      const result = await addImage({
        rootPath: params.presentation_path,
        filePath: params.file_path,
        slideIndex: params.slide_index,
        position: params.position,
        altText: params.alt_text,
      })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            imagePath: result.imagePath,
            inserted: result.inserted,
            message: result.inserted
              ? `Image added and inserted into slide. Reference: ${result.imagePath}`
              : `Image copied to ${result.imagePath}. For MDX slides use <img src="${result.imagePath}" style={{maxWidth:'100%',borderRadius:'8px'}} /> in slide content. For MD slides use ![alt](${result.imagePath}).`,
          }, null, 2),
        }],
      }
    }
  )

  // ── generate_ai_image ──
  server.tool(
    'generate_ai_image',
    'Generate an AI image from a text prompt and optionally insert it into a slide. Supports multiple image providers: "openai" (DALL-E 3), "gemini" (Google Gemini ImageFX), and "nanobanana" (Nano Banana Pro — best for text in images, 4K HD). The generated image is saved to the presentation\'s images/ directory. If slide_index is provided, the image is automatically embedded into the slide content.',
    {
      presentation_path: z.string().describe('Root path of the presentation (returned by create_presentation)'),
      prompt: z.string().describe('Detailed description of the image to generate. Be specific about subject, style, colors, composition, and mood.'),
      provider: z.enum(['openai', 'gemini', 'nanobanana']).optional().describe('Image generation provider. "openai" uses DALL-E 3, "gemini" uses Google Gemini ImageFX, "nanobanana" uses Nano Banana Pro (best for text in images, 4K HD). Default: uses the configured provider.'),
      aspect_ratio: z.enum(['1:1', '16:9', '9:16']).optional().describe('Aspect ratio for the generated image. Default: "16:9" (landscape, ideal for slides).'),
      slide_index: z.number().optional().describe('0-based slide index to insert the image into. If omitted, the image is saved to images/ without inserting into any slide.'),
      alt_text: z.string().optional().describe('Alt text for the image when inserted into a slide'),
    },
    async (params) => {
      try {
        const result = await generateAIImage({
          rootPath: params.presentation_path,
          prompt: params.prompt,
          provider: params.provider,
          aspectRatio: params.aspect_ratio,
          slideIndex: params.slide_index,
          altText: params.alt_text,
        })
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              imagePath: result.imagePath,
              inserted: result.inserted,
              provider: result.provider,
              message: result.inserted
                ? `AI image generated with ${result.provider} and inserted into slide ${params.slide_index}. Path: ${result.imagePath}`
                : `AI image generated with ${result.provider} and saved to ${result.imagePath}. For MDX slides use <img src="${result.imagePath}" style={{maxWidth:'100%',borderRadius:'8px'}} />`,
            }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: (err as Error).message,
            }, null, 2),
          }],
        }
      }
    }
  )

  // ── customize_theme ──
  server.tool(
    'customize_theme',
    'Customize the presentation theme colors and fonts. Overrides are saved in lecta.yaml and applied on top of the base theme.',
    {
      presentation_path: z.string().describe('Root path of the presentation'),
      accent_color: z.string().optional().describe('Accent color hex (e.g., "#ff6b35")'),
      bg_color: z.string().optional().describe('Background color hex'),
      text_color: z.string().optional().describe('Text color hex'),
      heading_font: z.string().optional().describe('Heading font family (e.g., "Georgia", "Inter")'),
      body_font: z.string().optional().describe('Body font family'),
    },
    async (params) => {
      const result = await customizeTheme({
        rootPath: params.presentation_path,
        accentColor: params.accent_color,
        bgColor: params.bg_color,
        textColor: params.text_color,
        headingFont: params.heading_font,
        bodyFont: params.body_font,
      })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      }
    }
  )

  // ══════════════════════════════════════════════════════
  // ── Design System Tools ──
  // ══════════════════════════════════════════════════════

  server.tool(
    'list_design_elements',
    `List reusable design elements from the shared design system. The design system works like a frontend component library — it stores reusable JSX snippets, color palettes, typography presets, and layout patterns that the AI should use for consistency across presentations.

Categories:
- "component" — Reusable JSX blocks (cards, headers, stat grids, timelines, icon rows, etc.)
- "color-palette" — Named color sets (e.g. "brand-primary: #6366f1, brand-secondary: #ec4899")
- "typography" — Font + size + weight combinations for headings, body, captions
- "snippet" — Small JSX fragments (styled bullets, accent bars, gradient backgrounds)
- "layout-pattern" — Full-slide JSX templates with placeholder content

IMPORTANT: Before creating a new presentation, ALWAYS call this tool first to check if there are design elements to reuse. This ensures visual consistency across all the user's decks.`,
    {
      category: z.enum(['component', 'color-palette', 'typography', 'snippet', 'layout-pattern']).optional().describe('Filter by category'),
      tags: z.array(z.string()).optional().describe('Filter by tags (returns elements matching ANY of the tags)'),
      search: z.string().optional().describe('Search by name, description, or tag'),
    },
    async (params) => {
      const elements = await listDesignElements({
        category: params.category,
        tags: params.tags,
        search: params.search,
      })
      return {
        content: [{
          type: 'text',
          text: elements.length === 0
            ? 'No design elements found. The design system is empty — you can create elements with save_design_element to build up a reusable library.'
            : JSON.stringify({
                count: elements.length,
                elements: elements.map(e => ({
                  id: e.id,
                  name: e.name,
                  category: e.category,
                  description: e.description,
                  tags: e.tags,
                  contentPreview: e.content.length > 300 ? e.content.slice(0, 300) + '...' : e.content,
                })),
              }, null, 2),
        }],
      }
    }
  )

  server.tool(
    'get_design_element',
    'Get the full content of a design element by its ID. Returns the complete JSX/CSS/markdown content ready to be used in a slide.',
    {
      element_id: z.string().describe('The ID of the design element (from list_design_elements)'),
    },
    async (params) => {
      const element = await getDesignElement(params.element_id)
      if (!element) {
        return {
          content: [{ type: 'text', text: `Design element "${params.element_id}" not found.` }],
        }
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(element, null, 2),
        }],
      }
    }
  )

  server.tool(
    'save_design_element',
    `Save a reusable design element to the shared design system. Elements are shared across ALL presentations — use this to build up a consistent visual language.

Best practices for creating elements:
- Components: Save self-contained JSX blocks with placeholder content (use {{TITLE}}, {{VALUE}}, {{DESCRIPTION}} placeholders)
- Color palettes: Save as key-value pairs, e.g. "primary: #6366f1\\nsecondary: #ec4899\\nbg: #0a0e1a"
- Typography: Save font-family + size + weight + color combos
- Snippets: Small reusable JSX pieces (accent bars, dividers, icon badges)
- Layout patterns: Full 1280×720 slide JSX templates with placeholder slots

Use descriptive tags so elements can be found later (e.g. "card", "stats", "header", "dark-theme", "corporate").`,
    {
      id: z.string().optional().describe('If provided, updates an existing element. Otherwise creates a new one.'),
      name: z.string().describe('Short descriptive name (e.g. "Metric Card", "Section Header", "Brand Colors")'),
      category: z.enum(['component', 'color-palette', 'typography', 'snippet', 'layout-pattern']).describe('Element category'),
      description: z.string().describe('One-line description of what this element is and when to use it'),
      content: z.string().describe('The reusable content — JSX snippet, CSS values, color definitions, or full slide template'),
      tags: z.array(z.string()).describe('Tags for discovery (e.g. ["card", "stats", "dark-theme"])'),
    },
    async (params) => {
      const element = await saveDesignElement({
        id: params.id,
        name: params.name,
        category: params.category,
        description: params.description,
        content: params.content,
        tags: params.tags,
      })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            id: element.id,
            name: element.name,
            message: params.id
              ? `Updated design element "${element.name}".`
              : `Created design element "${element.name}" (${element.id}). It will now be available across all presentations.`,
          }, null, 2),
        }],
      }
    }
  )

  server.tool(
    'delete_design_element',
    'Delete a design element from the shared design system.',
    {
      element_id: z.string().describe('The ID of the design element to delete'),
    },
    async (params) => {
      const deleted = await deleteDesignElement(params.element_id)
      return {
        content: [{
          type: 'text',
          text: deleted
            ? `Design element "${params.element_id}" deleted.`
            : `Design element "${params.element_id}" not found.`,
        }],
      }
    }
  )

  // ══════════════════════════════════════════════════════
  // ── Slide Library Tools ──
  // ══════════════════════════════════════════════════════

  server.tool(
    'list_library_slides',
    'List saved slides from the user\'s slide library. These are reusable slides the user has saved for use across presentations. Use this when the user asks to reuse a slide, or when you want to check if there\'s already a suitable slide before creating one from scratch.',
    {
      tags: z.array(z.string()).optional().describe('Filter by tags'),
      search: z.string().optional().describe('Search by name or content'),
    },
    async (params) => {
      const slides = await listSlideLibrary({
        tags: params.tags,
        search: params.search,
      })
      return {
        content: [{
          type: 'text',
          text: slides.length === 0
            ? 'No saved slides in the library.'
            : JSON.stringify({
                count: slides.length,
                slides: slides.map(s => ({
                  id: s.id,
                  name: s.name,
                  layout: s.layout || 'default',
                  hasCode: !!s.codeContent,
                  codeLanguage: s.codeLanguage || null,
                  tags: s.tags || [],
                  savedAt: s.savedAt,
                  contentPreview: s.markdown.length > 200 ? s.markdown.slice(0, 200) + '...' : s.markdown,
                })),
              }, null, 2),
        }],
      }
    }
  )

  server.tool(
    'get_library_slide',
    'Get the full content of a saved slide from the library by its ID.',
    {
      slide_id: z.string().describe('The ID of the saved slide'),
    },
    async (params) => {
      const slide = await getSlideFromLibrary(params.slide_id)
      if (!slide) {
        return {
          content: [{ type: 'text', text: `Slide "${params.slide_id}" not found in the library.` }],
        }
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(slide, null, 2),
        }],
      }
    }
  )

  server.tool(
    'insert_library_slide',
    'Insert a saved slide from the library into the current presentation. The slide\'s markdown content, layout, and code (if any) will be copied into the presentation.',
    {
      presentation_path: z.string().describe('Root path of the presentation'),
      slide_id: z.string().describe('The ID of the saved slide to insert (from list_library_slides)'),
      after_index: z.number().optional().describe('Insert after this 0-based slide index. If omitted, appends at the end.'),
      format: z.enum(['md', 'mdx']).optional().describe('Override the file format (default: mdx)'),
    },
    async (params) => {
      try {
        const result = await insertLibrarySlide({
          rootPath: params.presentation_path,
          slideId: params.slide_id,
          afterIndex: params.after_index,
          format: params.format,
        })
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              slideIndex: result.slideIndex,
              slideCount: result.slideCount,
              message: `Library slide inserted at position ${result.slideIndex + 1}.`,
            }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2),
          }],
        }
      }
    }
  )

  server.tool(
    'save_slide_to_library',
    'Save a slide from the current presentation to the user\'s reusable slide library. The slide can then be inserted into any future presentation via insert_library_slide.',
    {
      presentation_path: z.string().describe('Root path of the presentation'),
      slide_index: z.number().describe('0-based index of the slide to save'),
      name: z.string().describe('Name for the saved slide (e.g. "Company Intro", "Q&A Slide")'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
    },
    async (params) => {
      try {
        const { slides } = await listSlides(params.presentation_path, true)
        const slide = slides[params.slide_index]
        if (!slide) {
          return {
            content: [{ type: 'text', text: `Slide ${params.slide_index} not found.` }],
          }
        }

        const stored = await saveSlideToLibrary({
          name: params.name,
          markdown: slide.content || '',
          layout: slide.layout,
          codeContent: slide.codeContent,
          codeLanguage: slide.codeLanguage,
          tags: params.tags,
        })

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              id: stored.id,
              name: stored.name,
              message: `Slide saved to library as "${stored.name}" (${stored.id}). It can now be reused in any presentation.`,
            }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2),
          }],
        }
      }
    }
  )

  return server
}
