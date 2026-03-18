import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile, access, readdir } from 'fs/promises'
import { join } from 'path'
import { parsePresentationYaml } from '../../../packages/shared/src/utils/yaml-parser'
import { resolveRelativePath } from '../../../packages/shared/src/utils/path-resolver'
import { DECK_CONFIG_FILE } from '../../../packages/shared/src/constants'
import { startWatching } from '../services/file-watcher'
import type { LoadedPresentation, LoadedSlide } from '../../../packages/shared/src/types/presentation'

let recentDecks: string[] = []

export function registerFileSystemHandlers(): void {
  ipcMain.handle('fs:open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Open Presentation Folder'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('fs:load-presentation', async (_event, folderPath: string): Promise<LoadedPresentation> => {
    const configPath = join(folderPath, DECK_CONFIG_FILE)

    try {
      await access(configPath)
    } catch {
      throw new Error(`No ${DECK_CONFIG_FILE} found in ${folderPath}`)
    }

    const yamlContent = await readFile(configPath, 'utf-8')
    const config = parsePresentationYaml(yamlContent, folderPath)

    // Load all slide content
    const slides: LoadedSlide[] = await Promise.all(
      config.slides.map(async (slideConfig) => {
        const markdownPath = resolveRelativePath(folderPath, slideConfig.content)
        const markdownContent = await readFile(markdownPath, 'utf-8')

        let codeContent: string | null = null
        if (slideConfig.code) {
          const codePath = resolveRelativePath(folderPath, slideConfig.code.file)
          codeContent = await readFile(codePath, 'utf-8')
        }

        let notesContent: string | null = null
        if (slideConfig.notes) {
          try {
            const notesPath = resolveRelativePath(folderPath, slideConfig.notes)
            notesContent = await readFile(notesPath, 'utf-8')
          } catch {
            // Notes file doesn't exist yet, that's fine
          }
        }

        return {
          config: slideConfig,
          markdownContent,
          codeContent,
          codeLanguage: slideConfig.code?.language ?? null,
          notesContent
        }
      })
    )

    // Track recent decks
    recentDecks = [folderPath, ...recentDecks.filter((d) => d !== folderPath)].slice(0, 10)

    // Start watching code files for changes
    const codeFiles = config.slides
      .filter((s) => s.code)
      .map((s) => resolveRelativePath(folderPath, s.code!.file))
    startWatching(codeFiles)

    return { config, slides }
  })

  ipcMain.handle('fs:read-file', async (_event, filePath: string): Promise<string> => {
    return readFile(filePath, 'utf-8')
  })

  ipcMain.handle('fs:get-recent-decks', async (): Promise<string[]> => {
    return recentDecks
  })
}
