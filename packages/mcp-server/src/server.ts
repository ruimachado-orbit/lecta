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

## The 7×7 Rule
- ONE heading per slide (max 7 words)
- Max 7 bullet points per slide
- Each bullet: max 7 words
- NO paragraphs — use speaker notes for detail

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

## Workflow
1. Create the presentation with create_presentation (pick a good theme, format: "mdx")
2. Edit slide 0 (the title slide) with proper JSX content
3. Add remaining slides one by one with add_slide (format: "mdx")
4. Use add_image to embed local images into slides
5. Use customize_theme to override colors/fonts if needed
6. Use list_slides to review the deck
7. Do NOT export — the user views it in the Lecta app`

export function createLectaServer(): McpServer {
  const server = new McpServer({
    name: 'lecta',
    version: '0.1.0',
  })

  // ── MCP Prompt ──
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

  // ── Slide content guidelines (shared across tool descriptions) ──
  const SLIDE_CONTENT_GUIDE = `

SLIDE CONTENT GUIDELINES — follow these for every slide:

Canvas: 1280×720px. Slides should fill the entire canvas.

The 7×7 Rule:
1. ONE title/heading per slide (max 7 words)
2. Max 7 bullet points below the heading
3. Each bullet: max 7 words
4. NO paragraphs or long sentences
5. Emphasize 1-2 key words per bullet only
6. If you need more content, create another slide — NEVER exceed 7 bullets

CRITICAL — MDX format (always use this):
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
      content: z.string().describe('MDX (preferred) or Markdown content for the slide. For MDX: write pure JSX with a root <div> covering the full canvas — title must be a styled <div>, not a markdown # heading. For MD: start with a single # heading. Follow the 7×7 rule: max 7 bullets, max 7 words each. Keep content sparse — slides should breathe.'),
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

  return server
}
