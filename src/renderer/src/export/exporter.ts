import { usePresentationStore } from '../stores/presentation-store'

/**
 * Single entry point for deck export.
 *
 * PDF and HTML are rendered by the app's own renderer (see `ExportRoute`) in a hidden window;
 * PPTX is built in main from the deck's markdown. Every kind reports the same way: the saved
 * path on success, `null` when the user cancels, and a visible error (the store error the
 * StatusBar shows) when something fails — never a console-only failure.
 */

export type ExportKind = 'pdf' | 'html' | 'pptx'

export interface ExportOutcome {
  path: string
  warnings?: string[]
}

/** Options the main process forwards into the export route's URL hash. */
interface ExportRenderOptions {
  theme: string
  slides: number
  mdxTrusted: boolean
}

function showError(message: string): void {
  usePresentationStore.setState({ error: message })
}

function clearError(): void {
  if (usePresentationStore.getState().error) usePresentationStore.setState({ error: null })
}

const KIND_LABEL: Record<ExportKind, string> = { pdf: 'PDF', html: 'HTML', pptx: 'PowerPoint' }

/**
 * Export the open deck. Returns the saved path (plus any exporter warnings), or `null` when the
 * user cancelled the save dialog or the export failed (the failure is surfaced to the user).
 */
export async function exportDeck(kind: ExportKind): Promise<ExportOutcome | null> {
  const { presentation, slides, mdxTrusted } = usePresentationStore.getState()
  if (!presentation) {
    showError('Open a presentation before exporting')
    return null
  }

  const exportable = slides.filter((s) => !s.config.skipped)
  if (exportable.length === 0) {
    showError('This deck has no slides to export')
    return null
  }

  const options: ExportRenderOptions = {
    theme: presentation.theme || 'dark',
    slides: exportable.length,
    mdxTrusted
  }

  try {
    const outcome = kind === 'pptx'
      ? await exportPptx()
      : await exportRendered(kind, options)
    // Warnings are not failures: they ride back to the caller, which shows them in the
    // completion toast next to the saved path.
    if (outcome) clearError()
    return outcome
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    showError(`${KIND_LABEL[kind]} export failed: ${message}`)
    return null
  }
}

async function exportRendered(kind: 'pdf' | 'html', options: ExportRenderOptions): Promise<ExportOutcome | null> {
  const { presentation } = usePresentationStore.getState()
  if (!presentation) return null
  const api = window.electronAPI

  const path = kind === 'pdf'
    ? await api.exportPdf(presentation.rootPath, options, presentation.title)
    : await api.exportHtml(presentation.rootPath, options, presentation.title, options.theme)

  return path ? { path } : null
}

async function exportPptx(): Promise<ExportOutcome | null> {
  const { presentation, slides } = usePresentationStore.getState()
  if (!presentation) return null

  const result = await window.electronAPI.exportPptx({
    title: presentation.title,
    author: presentation.author,
    theme: presentation.theme,
    rootPath: presentation.rootPath,
    slides: slides.map((s) => ({
      id: s.config.id,
      layout: s.config.layout,
      markdownContent: s.markdownContent,
      codeContent: s.codeContent,
      codeLanguage: s.codeLanguage,
      codeFile: s.config.code?.file ?? null,
      notesContent: s.notesContent,
      isMdx: s.isMdx,
      skip: s.config.skipped
    }))
  })

  if (!result) return null
  return { path: result.path, warnings: result.warnings?.length ? result.warnings : undefined }
}

/** Reveal an exported file in the OS file manager (no-op when the bridge does not expose it). */
export function revealExport(path: string): void {
  const api = window.electronAPI as unknown as { showItemInFolder?: (p: string) => void }
  api.showItemInFolder?.(path)
}
