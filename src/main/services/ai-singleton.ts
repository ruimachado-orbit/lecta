import { AIService } from './ai-service'

let instance: AIService | null = null

export function getSharedAIService(): AIService {
  if (!instance) {
    instance = new AIService()
  }
  return instance
}
