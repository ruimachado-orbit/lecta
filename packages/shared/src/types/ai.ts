export interface NotesGenerationRequest {
  slideContent: string
  codeContent: string | null
  deckTitle: string
  slideIndex: number
  totalSlides: number
}

export interface NotesGenerationResult {
  content: string
  model: string
  generatedAt: string
}

export interface SpeakerNotes {
  slideId: string
  content: string
  source: 'ai-generated' | 'user-written' | 'ai-edited'
  model?: string
  generatedAt?: string
  lastModifiedAt: string
}
