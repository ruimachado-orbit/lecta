import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { getSharedAIService } from '../services/ai-singleton'
import type Anthropic from '@anthropic-ai/sdk'
import type { PresentationSnapshot, ChatStreamEvent } from '../../../packages/shared/src/types/chat'

function getAIService() {
  return getSharedAIService()
}

/** A tool call waiting for the user's approval in the renderer. */
interface PendingConfirmation {
  resolve: (approved: boolean) => void
  /** id of the webContents that asked — only that window may answer. */
  senderId: number
  expiresAt: number
  timer: NodeJS.Timeout
}

/** Confirmations that are never answered would otherwise pin the turn forever. */
const CONFIRMATION_TIMEOUT_MS = 10 * 60 * 1000

const pendingConfirmations = new Map<string, PendingConfirmation>()

/** Answer one pending confirmation and drop it from the map. */
function settleConfirmation(toolCallId: string, approved: boolean): boolean {
  const pending = pendingConfirmations.get(toolCallId)
  if (!pending) return false
  clearTimeout(pending.timer)
  pendingConfirmations.delete(toolCallId)
  pending.resolve(approved)
  return true
}

/** Deny every confirmation belonging to a window that went away. */
function settleConfirmationsForSender(senderId: number): void {
  for (const [toolCallId, pending] of [...pendingConfirmations]) {
    if (pending.senderId === senderId) settleConfirmation(toolCallId, false)
  }
}

/** Drop anything left behind by a crashed turn (belt and braces for the timers). */
function pruneExpiredConfirmations(): void {
  const now = Date.now()
  for (const [toolCallId, pending] of [...pendingConfirmations]) {
    if (pending.expiresAt <= now) settleConfirmation(toolCallId, false)
  }
}

export function registerChatAgentHandlers(): void {
  ipcMain.handle(
    'chat:send-message',
    async (
      event: IpcMainInvokeEvent,
      messages: Anthropic.MessageParam[],
      snapshot: PresentationSnapshot,
      actionMode: 'auto' | 'ask',
      responseChannel: string
    ): Promise<Anthropic.MessageParam[]> => {
      const service = getAIService()
      const sender = event.sender
      const senderId = sender.id

      pruneExpiredConfirmations()

      // Events go back to the window that asked, not to whatever is focused.
      const sendEvent = (evt: ChatStreamEvent): void => {
        if (sender.isDestroyed()) return
        sender.send(responseChannel, evt)
      }

      const onSenderGone = (): void => settleConfirmationsForSender(senderId)
      sender.once('destroyed', onSenderGone)

      // `confirmAction` is always provided: tools flagged `alwaysConfirm` need
      // the user's approval even in `auto` mode.
      const confirmAction = (toolCallId: string): Promise<boolean> => {
        if (sender.isDestroyed()) return Promise.resolve(false)
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            settleConfirmation(toolCallId, false)
          }, CONFIRMATION_TIMEOUT_MS)
          // Do not keep the process alive just for a confirmation.
          timer.unref?.()
          pendingConfirmations.set(toolCallId, {
            resolve,
            senderId,
            expiresAt: Date.now() + CONFIRMATION_TIMEOUT_MS,
            timer,
          })
          // The confirm request event is emitted by chatWithTools, so the
          // renderer already knows to show the confirmation UI.
        })
      }

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
        const raw = (err as Error).message || String(err)
        // Extract user-friendly message from API error JSON
        let friendly = raw
        try {
          const jsonMatch = raw.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            friendly = parsed?.error?.message || parsed?.message || raw
          }
        } catch { /* use raw */ }
        sendEvent({ type: 'error', message: friendly })
        sendEvent({ type: 'done' })
        return messages
      } finally {
        settleConfirmationsForSender(senderId)
        if (!sender.isDestroyed()) sender.off('destroyed', onSenderGone)
      }
    }
  )

  ipcMain.handle(
    'chat:confirm-action',
    async (event, toolCallId: string, approved: boolean): Promise<void> => {
      const pending = pendingConfirmations.get(toolCallId)
      // Only the window that requested the confirmation may answer it.
      if (!pending || pending.senderId !== event.sender.id) return
      settleConfirmation(toolCallId, approved)
    }
  )
}
