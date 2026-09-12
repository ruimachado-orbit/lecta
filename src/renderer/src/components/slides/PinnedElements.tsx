/**
 * Presentation for canvas-pinned elements, shared by every renderer so an element looks
 * the same in the editor, the presenter/audience views and the deck thumbnails.
 *
 * Everything here positions against the *full 1280x720 slide*, not the padded content box:
 * the layer is an `inset: 0` sibling of `.slide-content`, whose containing block is the
 * slide's `absolute inset-0` wrapper. That is the same coordinate space the editable
 * overlay and the PPTX exporter use, so a pinned element does not jump between views.
 */
import type { CSSProperties } from 'react'
import {
  type ImageElement,
  type ShapeElement,
  type SlideElement,
  type TextElement,
} from './element-model'
import { effectiveRadius, surfacePadding, surfaceStyle } from './style-presets'
import { resolveImageSrc } from './slide-utils'

/** Border values are stored underscore-escaped so they survive the space-separated encoding. */
export function decodeBorder(border: string | undefined): string | undefined {
  return border ? border.replace(/_/g, ' ') : undefined
}

/**
 * Position, size, opacity, rotation, z-order and the style preset's surface — everything
 * that applies to the element's frame rather than to its content.
 */
export function elementFrameStyle(el: SlideElement): CSSProperties {
  const style: CSSProperties = { position: 'absolute', left: el.x, top: el.y }

  if (el.kind === 'shape') {
    style.width = el.w
    style.height = el.h
  } else if (el.kind === 'image') {
    style.width = el.w
    if (el.h !== undefined) style.height = el.h
  } else {
    style.width = el.w ?? 300
  }

  if (el.kind !== 'textbox') {
    if (el.opacity !== undefined) style.opacity = Math.max(0, Math.min(100, el.opacity)) / 100
    if (el.rotate) style.transform = `rotate(${el.rotate}deg)`
    if (el.z !== undefined) style.zIndex = el.z
  }

  const radius = el.kind === 'textbox' ? undefined : el.radius
  const shadow = el.kind === 'textbox' ? undefined : el.shadow
  return { ...style, ...surfaceStyle(el.style, { radius, shadow }) }
}

/** The `<img>` inside an image element's frame. */
export function PinnedImageContent({ el, rootPath }: { el: ImageElement; rootPath?: string }): JSX.Element {
  const pad = surfacePadding(el.style)
  const outerRadius = effectiveRadius(el.style, el.radius)
  return (
    <img
      src={resolveImageSrc(el.src, rootPath)}
      alt=""
      draggable={false}
      style={{
        display: 'block',
        width: '100%',
        height: el.h !== undefined ? '100%' : 'auto',
        objectFit: el.fit,
        border: decodeBorder(el.border),
        borderRadius: Math.max(0, outerRadius - pad) || undefined,
      }}
    />
  )
}

/** The `<svg>` inside a shape element's frame. */
export function PinnedShapeContent({ el }: { el: ShapeElement }): JSX.Element {
  const sw = el.sw ?? 2
  const fill = el.fill ?? 'transparent'
  const stroke = el.stroke ?? '#ffffff'
  const rx = el.radius ?? 4
  return (
    <svg
      className="slide-shape-svg"
      width="100%"
      height="100%"
      viewBox={`0 0 ${el.w} ${el.h}`}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {el.shape === 'ellipse' ? (
        <ellipse cx={el.w / 2} cy={el.h / 2} rx={el.w / 2 - sw / 2} ry={el.h / 2 - sw / 2} fill={fill} stroke={stroke} strokeWidth={sw} />
      ) : el.shape === 'line' ? (
        <line x1={sw} y1={el.h / 2} x2={el.w - sw} y2={el.h / 2} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
      ) : (
        <rect x={sw / 2} y={sw / 2} width={Math.max(0, el.w - sw)} height={Math.max(0, el.h - sw)} rx={rx} fill={fill} stroke={stroke} strokeWidth={sw} />
      )}
    </svg>
  )
}

/** Typography and padding for a text box, independent of its frame. */
export function textBoxContentStyle(el: TextElement): CSSProperties {
  return {
    fontSize: el.fs,
    color: el.fc,
    fontWeight: el.fb ? 'bold' : undefined,
    fontStyle: el.fi ? 'italic' : undefined,
    textAlign: el.align,
    whiteSpace: 'pre-wrap',
  }
}

/** Padding for a text box: its own `pad=`, else the style preset's, else the stylesheet's. */
export function textBoxPadding(el: TextElement): number | undefined {
  if (el.pad !== undefined) return el.pad
  const preset = surfacePadding(el.style)
  return preset || undefined
}

/** One read-only pinned element. */
export function PinnedElement({ el, rootPath }: { el: SlideElement; rootPath?: string }): JSX.Element {
  if (el.kind === 'image') {
    const pad = surfacePadding(el.style)
    return (
      <div style={{ ...elementFrameStyle(el), padding: pad || undefined, overflow: 'hidden' }}>
        <PinnedImageContent el={el} rootPath={rootPath} />
      </div>
    )
  }
  if (el.kind === 'shape') {
    return (
      <div style={elementFrameStyle(el)}>
        <PinnedShapeContent el={el} />
      </div>
    )
  }
  return (
    <div
      className="slide-textbox"
      style={{ ...elementFrameStyle(el), padding: textBoxPadding(el), ...textBoxContentStyle(el) }}
    >
      {el.content}
    </div>
  )
}

/**
 * Full-slide overlay holding every pinned element of a slide, in `z` then source order.
 * Renders nothing (not even the layer) when the slide has no pinned elements.
 */
export function PinnedLayer({ elements, rootPath }: { elements: SlideElement[]; rootPath?: string }): JSX.Element | null {
  if (elements.length === 0) return null
  return (
    <div className="slide-pinned-layer">
      {elements.map((el) => (
        <PinnedElement key={`pin-${el.index}`} el={el} rootPath={rootPath} />
      ))}
    </div>
  )
}
