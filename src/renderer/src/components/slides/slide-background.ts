/**
 * Reading and writing a slide's optional backdrop.
 *
 * The backdrop lives in the deck manifest (`lecta.yaml`), not in the slide markdown, so it
 * survives markdown rewrites and is available to every renderer through the presentation
 * store. Writing goes through the `fs:set-slide-background` IPC (locked, atomic), with the
 * store updated optimistically so the canvas repaints immediately.
 */
import type { SlideBackground } from '@shared/types/presentation'
import { usePresentationStore } from '../../stores/presentation-store'

/** True when the backdrop actually paints something. */
export function hasBackground(bg: SlideBackground | undefined): bg is SlideBackground {
  return !!bg && !!(bg.color || bg.gradient || bg.image)
}

/** Drop empty fields; an all-empty backdrop is removed from the manifest entirely. */
function normalize(bg: SlideBackground | undefined): SlideBackground | undefined {
  if (!bg) return undefined
  const out: SlideBackground = {}
  if (bg.color) out.color = bg.color
  if (bg.gradient) out.gradient = bg.gradient
  if (bg.image) out.image = bg.image
  if (bg.overlay) out.overlay = bg.overlay
  return hasBackground(out) ? out : undefined
}

/** The backdrop currently set on a slide, if any. */
export function slideBackground(slideIndex: number): SlideBackground | undefined {
  return usePresentationStore.getState().presentation?.slides[slideIndex]?.background
}

/**
 * Set (or, with `undefined`, clear) a slide's backdrop and persist the manifest.
 * Returns false when there is no open deck or the write failed.
 */
export async function applySlideBackground(
  slideIndex: number,
  background: SlideBackground | undefined
): Promise<boolean> {
  const { presentation, slides } = usePresentationStore.getState()
  if (!presentation || !presentation.slides[slideIndex]) return false

  const next = normalize(background)
  const configSlides = presentation.slides.map((slide, i) => {
    if (i !== slideIndex) return slide
    const copy = { ...slide }
    if (next) copy.background = next
    else delete copy.background
    return copy
  })
  const nextPresentation = { ...presentation, slides: configSlides }

  usePresentationStore.setState({
    presentation: nextPresentation,
    slides: slides.map((s, i) => (i === slideIndex ? { ...s, config: configSlides[i] } : s)),
  })

  try {
    // Locked, atomic manifest write in the main process (same path as set-layout).
    const loaded = await window.electronAPI.setSlideBackground(presentation.rootPath, slideIndex, next ?? null)
    usePresentationStore.setState({ presentation: loaded.config, slides: loaded.slides })
    return true
  } catch (error) {
    usePresentationStore.setState({ error: (error as Error).message })
    return false
  }
}

/** Merge one field into a slide's backdrop, leaving the others alone. */
export async function patchSlideBackground(
  slideIndex: number,
  patch: Partial<SlideBackground>
): Promise<boolean> {
  return applySlideBackground(slideIndex, { ...slideBackground(slideIndex), ...patch })
}
