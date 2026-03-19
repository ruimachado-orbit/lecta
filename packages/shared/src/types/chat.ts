export interface SlideSnapshot {
  id: string
  markdownContent: string
  codeContent: string | null
  codeLanguage: string | null
  notesContent: string | null
  layout: string
  transition: string
  renderedHtml?: string
}

export interface PresentationSnapshot {
  title: string
  author: string
  theme: string
  rootPath: string
  currentSlideIndex: number
  slides: SlideSnapshot[]
}

export interface RendererAction {
  action: string
  params: Record<string, unknown>
}

export type ChatStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; id: string; toolName: string; toolInput: unknown }
  | { type: 'tool_call_result'; id: string; toolName: string; result: string; success: boolean; rendererAction?: RendererAction }
  | { type: 'tool_confirm_request'; id: string; toolName: string; toolInput: unknown }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface SerializedChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: {
    id: string
    name: string
    input: unknown
    result?: string
  }[]
}
