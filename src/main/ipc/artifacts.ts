import { ipcMain, shell } from 'electron'
import { readFile } from 'fs/promises'

export function registerArtifactHandlers(): void {
  ipcMain.handle('artifacts:open-system', async (_event, filePath: string): Promise<void> => {
    await shell.openPath(filePath)
  })

  ipcMain.handle('artifacts:read-buffer', async (_event, filePath: string): Promise<ArrayBuffer> => {
    const buffer = await readFile(filePath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  })
}
