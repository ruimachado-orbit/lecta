import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ResizableImageView } from '../components/slides/ResizableImage'

export const ResizableImage = Image.extend({
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute('width') || element.style.width
          return width ? parseInt(width, 10) : null
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {}
          return { width: attributes.width, style: `width: ${attributes.width}px` }
        }
      },
      border: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-border') || null,
        renderHTML: (attributes) => {
          if (!attributes.border) return {}
          return { 'data-border': attributes.border }
        }
      },
      borderRadius: {
        default: null,
        parseHTML: (element) => {
          const r = element.getAttribute('data-border-radius')
          return r ? parseInt(r, 10) : null
        },
        renderHTML: (attributes) => {
          if (!attributes.borderRadius) return {}
          return { 'data-border-radius': `${attributes.borderRadius}` }
        }
      }
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  }
})
