import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { getSharedAIService } from '../services/ai-singleton'
import { withCancellation } from './ai'
import { CANCELLED_MESSAGE } from '../services/ai/types'
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

/** How long the `run_code` tool waits for the renderer to run and report back. */
const CODE_RUN_TIMEOUT_MS = 2 * 60 * 1000

interface PendingCodeRun {
  resolve: (result: string) => void
  senderId: number
  timer: NodeJS.Timeout
}

const pendingCodeRuns = new Map<string, PendingCodeRun>()

/** Settle every pending code run belonging to a window with an error message. */
function settleCodeRunsForSender(senderId: number, message: string): void {
  for (const [requestId, pending] of [...pendingCodeRuns]) {
    if (pending.senderId !== senderId) continue
    clearTimeout(pending.timer)
    pendingCodeRuns.delete(requestId)
    pending.resolve(message)
  }
}

export function registerChatAgentHandlers(): void {
  ipcMain.on(
    'chat:report-code-run-result',
    (event: Electron.IpcMainEvent, requestId: string, result: string) => {
      const pending = pendingCodeRuns.get(requestId)
      if (!pending || pending.senderId !== event.sender.id) return
      clearTimeout(pending.timer)
      pendingCodeRuns.delete(requestId)
      pending.resolve(typeof result === 'string' ? result : 'The code run produced no output.')
    }
  )

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

      const onSenderGone = (): void => {
        settleConfirmationsForSender(senderId)
        settleCodeRunsForSender(senderId, 'The app window closed before the code could run.')
      }
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
        // `ai:cancel` aborts this controller; the Stop button in the chat uses it.
        const updatedMessages = await withCancellation(event, (signal) => {
          // A turn parked on a confirmation must not survive a cancel.
          signal.addEventListener('abort', onSenderGone, { once: true })

          // `run_code` runs the code in the renderer and reports the result
          // back through `chat:report-code-run-result` so the model can read
          // it in the same turn instead of a follow-up message.
          const requestCodeRun = (slideIndex: number): Promise<string> => {
            if (sender.isDestroyed()) {
              return Promise.resolve('The app window closed before the code could run.')
            }
            return new Promise((resolve) => {
              const requestId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
              const timer = setTimeout(() => {
                pendingCodeRuns.delete(requestId)
                resolve('The code run did not finish within 2 minutes.')
              }, CODE_RUN_TIMEOUT_MS)
              timer.unref?.()
              pendingCodeRuns.set(requestId, { resolve, senderId, timer })
              sender.send('chat:run-code-request', { requestId, slideIndex })
            })
          }

          return service.chatWithTools(
            messages,
            snapshot,
            actionMode,
            sendEvent,
            confirmAction,
            requestCodeRun,
            () => sender.capturePage().then((img) => img.toDataURL()),
            signal
          )
        })
        return updatedMessages
      } catch (err) {
        const raw = (err as Error).message || String(err)
        // Extract user-friendly message from API error JSON
        let friendly = raw
        if (raw !== CANCELLED_MESSAGE) {
          try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0])
              friendly = parsed?.error?.message || parsed?.message || raw
            }
          } catch { /* use raw */ }
        }
        sendEvent({ type: 'error', message: friendly })
        sendEvent({ type: 'done' })
        return messages
      } finally {
        settleConfirmationsForSender(senderId)
        settleCodeRunsForSender(senderId, 'The code run was interrupted.')
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
