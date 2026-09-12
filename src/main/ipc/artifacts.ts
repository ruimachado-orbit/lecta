import { ipcMain, shell } from 'electron'
import { readFile } from 'fs/promises'
import { assertInsideOpenDeck } from '../services/deck-roots'

export function registerArtifactHandlers(): void {
  ipcMain.handle('artifacts:open-system', async (_event, filePath: string): Promise<void> => {
    const safePath = assertInsideOpenDeck(filePath)
    await shell.openPath(safePath)
  })

  ipcMain.handle('artifacts:read-buffer', async (_event, filePath: string): Promise<ArrayBuffer> => {
    const safePath = assertInsideOpenDeck(filePath)
    const buffer = await readFile(safePath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  })
}
