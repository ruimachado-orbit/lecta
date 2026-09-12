import { useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { SlideRenderer } from './SlideRenderer'
import { stripMdxToMarkdown } from './MdxRenderer'
import type { SlideBackground } from '@shared/types/presentation'

interface MdxSandboxProps {
  markdown: string
  rootPath?: string
  clickStep?: number
  onClickSteps?: (total: number) => void
  background?: SlideBackground
}

/**
 * Sandboxed renderer for trusted MDX slides.
 *
 * The slide's MDX source is reduced to plain markdown (the same
 * `stripMdxToMarkdown` used for untrusted previews), rendered through the
 * ordinary non-executing `SlideRenderer` offscreen, and the resulting HTML is
 * moved into an `<iframe sandbox="">` with no `allow-scripts` and no
 * `allow-same-origin`. The frame has an opaque origin, no bridge, no DOM
 * access to the app — even an `<img onerror>` that survives sanitization
 * cannot run. Interactive JSX components degrade to their static text; fully
 * interactive MDX stays behind the `MdxRenderer` path, which remains gated by
 * the per-deck trust flag in `ContentRenderer`.
 */
export function MdxSandbox({ markdown, rootPath, clickStep, onClickSteps, background }: MdxSandboxProps): JSX.Element {
  const measureRef = useRef<HTMLDivElement>(null)
  const [srcDoc, setSrcDoc] = useState<string>('')

  const stripped = stripMdxToMarkdown(markdown)

  useEffect(() => {
    const el = measureRef.current
    if (!el) return
    const raw = el.innerHTML
    const clean = DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] })
    setSrcDoc(
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
        `<style>body{margin:0;padding:24px;font-family:system-ui,sans-serif;color:#e5e7eb;background:transparent}` +
        `img,video{max-width:100%}a{color:#7dd3fc}</style></head>` +
        `<body>${clean}</body></html>`
    )
  }, [stripped, rootPath, clickStep, background])

  return (
    <div className="h-full w-full">
      {/* Offscreen, never shown: the only place the markdown becomes HTML. */}
      <div ref={measureRef} aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', visibility: 'hidden' }}>
        <SlideRenderer
          markdown={stripped}
          rootPath={rootPath}
          clickStep={clickStep}
          onClickSteps={onClickSteps}
          background={background}
          hidePinned
        />
      </div>
      {srcDoc ? (
        <iframe
          title="MDX slide (sandboxed)"
          sandbox=""
          srcDoc={srcDoc}
          className="h-full w-full border-0 bg-transparent"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-gray-500">Preparing sandboxed preview…</div>
      )}
    </div>
  )
}
