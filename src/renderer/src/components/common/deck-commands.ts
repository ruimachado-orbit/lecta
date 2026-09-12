import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'

// Type-only import: erased at build time, so the exporter itself still loads lazily.
import type { ExportKind, ExportOutcome } from '../../export/exporter'

export type { ExportKind, ExportOutcome }

/**
 * Export the open deck. The rendering itself lives in `src/renderer/src/export/exporter.ts`,
 * which renders through the real slide renderer; this module only routes the menu and the
 * command palette to it so both stay on one code path.
 */
export async function exportDeckAs(kind: ExportKind): Promise<ExportOutcome | null> {
  const { exportDeck } = await import('../../export/exporter')
  return exportDeck(kind)
}

export const EXPORT_LABELS: Record<ExportKind, string> = {
  pdf: 'Export PDF',
  html: 'Export HTML',
  pptx: 'Export PowerPoint',
  md: 'Export single Markdown file'
}

/** Import slides from another deck, inserting them after the current slide. */
export async function importSlidesIntoDeck(): Promise<void> {
  const { presentation, currentSlideIndex, loadPresentation } = usePresentationStore.getState()
  if (!presentation) return
  const imported = await window.electronAPI.importSlides()
  if (!imported || imported.length === 0) return
  await window.electronAPI.addBulkSlides(presentation.rootPath, imported, currentSlideIndex)
  await loadPresentation(presentation.rootPath)
}

/** Close every side panel, then start presenting. */
export function startPresenting(): void {
  useUIStore.setState({
    showArtifactDrawer: false,
    showArticlePanel: false,
    showSlideMap: false,
    showRightPane: false,
    showNotes: false,
    showCommandPalette: false,
    showShortcuts: false
  })
  useUIStore.getState().togglePresenting()
}

/** Add a slide after the current one. */
export function addSlide(): void {
  const { addSlide: add, slides } = usePresentationStore.getState()
  add(`slide-${slides.length + 1}`)
}
