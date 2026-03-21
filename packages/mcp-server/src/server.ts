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
  getDefaultPresentationsPath,
} from './lib/presentation-io.js'
import type { SlideLayout, SlideTransition, SupportedLanguage } from './lib/presentation-io.js'

export function createLectaServer(): McpServer {
  const server = new McpServer({
    name: 'lecta',
    version: '0.1.0',
  })

  // ── create_presentation ──
  server.tool(
    'create_presentation',
    `Create a new Lecta presentation. The presentation is saved to disk and the user opens it in the Lecta app to view, edit, and present. Do NOT call any export tool after this — the user views it in the app. If path is omitted, presentations are saved to ~/Documents/Lecta.`,
    {
      title: z.string().describe('Presentation title'),
      theme: z.enum(['dark', 'light', 'executive', 'minimal', 'corporate', 'creative', 'keynote-dark', 'paper']).optional().describe('Visual theme (default: dark)'),
      author: z.string().optional().describe('Author name'),
      slide_count: z.number().min(1).max(50).optional().describe('Number of starter slides (default: 1)'),
      slide_titles: z.array(z.string()).optional().describe('Titles for each starter slide'),
      path: z.string().optional().describe('Parent directory (default: ~/Documents/Lecta). Only set if the user specifies a custom location.'),
      format: z.enum(['md', 'mdx']).optional().describe('Slide file format (default: md). Use mdx for slides with JSX components.'),
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
    'Add a new slide to an existing Lecta presentation. Supports both Markdown (.md) and MDX (.mdx) formats. The slide_id is auto-generated from the content heading if omitted.',
    {
      presentation_path: z.string().describe('Root path of the presentation (returned by create_presentation)'),
      content: z.string().describe('Markdown or MDX content for the slide. Must start with a # heading.'),
      layout: z.enum(['default', 'center', 'title', 'section', 'two-col', 'two-col-wide-left', 'two-col-wide-right', 'three-col', 'top-bottom', 'big-number', 'quote', 'blank']).optional().describe('Slide layout (default: "default")'),
      code: z.object({
        content: z.string().describe('Code content'),
        language: z.enum([
          'javascript', 'typescript', 'python', 'sql', 'html', 'css',
          'json', 'bash', 'rust', 'go', 'java', 'csharp', 'ruby', 'php', 'markdown'
        ]).describe('Programming language'),
      }).optional().describe('Code block to attach to the slide'),
      notes: z.string().optional().describe('Speaker notes'),
      format: z.enum(['md', 'mdx']).optional().describe('Slide file format (default: md). Use mdx for slides with JSX components.'),
    },
    async (params) => {
      const result = await addSlide({
        rootPath: params.presentation_path,
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
    'Edit an existing slide in a Lecta presentation',
    {
      presentation_path: z.string().describe('Root path of the presentation'),
      slide_index: z.number().describe('0-based slide index'),
      content: z.string().optional().describe('New markdown content (replaces entire slide)'),
      layout: z.enum(['default', 'center', 'title', 'section', 'two-col', 'two-col-wide-left', 'two-col-wide-right', 'three-col', 'top-bottom', 'big-number', 'quote', 'blank']).optional().describe('New layout'),
      code_content: z.string().optional().describe('New code content'),
      notes: z.string().optional().describe('New speaker notes'),
      transition: z.enum(['none', 'left', 'right', 'top', 'bottom']).optional().describe('Slide transition'),
      format: z.enum(['md', 'mdx']).optional().describe('Convert slide to this format. Changes the file extension and updates the config.'),
    },
    async (params) => {
      const result = await editSlide({
        rootPath: params.presentation_path,
        slideIndex: params.slide_index,
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
    'Attach a file (PDF, image, document) to a slide',
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

  return server
}
