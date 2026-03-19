import { ipcMain, BrowserWindow } from 'electron'
import { getSharedAIService } from '../services/ai-singleton'
import type Anthropic from '@anthropic-ai/sdk'
import type { PresentationSnapshot, ChatStreamEvent } from '../../../packages/shared/src/types/chat'

function getAIService() {
  return getSharedAIService()
}

// Map of pending confirmations: toolCallId -> resolve function
const pendingConfirmations = new Map<string, (approved: boolean) => void>()

export function registerChatAgentHandlers(): void {
  ipcMain.handle(
    'chat:send-message',
    async (
      _event,
      messages: Anthropic.MessageParam[],
      snapshot: PresentationSnapshot,
      actionMode: 'auto' | 'ask',
      responseChannel: string
    ): Promise<Anthropic.MessageParam[]> => {
      const service = getAIService()
      const window = BrowserWindow.getFocusedWindow()

      const sendEvent = (evt: ChatStreamEvent): void => {
        window?.webContents.send(responseChannel, evt)
      }

      const confirmAction = actionMode === 'ask'
        ? (toolCallId: string, toolName: string, toolInput: unknown): Promise<boolean> => {
            return new Promise((resolve) => {
              pendingConfirmations.set(toolCallId, resolve)
              // The event is already sent from chatWithTools, so the renderer
              // will show the confirmation UI and call chat:confirm-action
            })
          }
        : undefined

      try {
        const updatedMessages = await service.chatWithTools(
          messages,
          snapshot,
          actionMode,
          sendEvent,
          confirmAction
        )
        return updatedMessages
      } catch (err) {
        sendEvent({ type: 'error', message: (err as Error).message })
        sendEvent({ type: 'done' })
        return messages
      }
    }
  )

  ipcMain.handle(
    'chat:confirm-action',
    async (_event, toolCallId: string, approved: boolean): Promise<void> => {
      const resolve = pendingConfirmations.get(toolCallId)
      if (resolve) {
        pendingConfirmations.delete(toolCallId)
        resolve(approved)
      }
    }
  )
}
