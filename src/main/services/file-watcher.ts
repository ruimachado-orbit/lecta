import { watch, readFile } from 'fs'
import { readFile as readFileAsync } from 'fs/promises'
import { BrowserWindow } from 'electron'

interface WatcherEntry {
  close: () => void
}

const watchers: Map<string, WatcherEntry> = new Map()

export function startWatching(filePaths: string[]): void {
  // Close existing watchers
  stopWatching()

  for (const filePath of filePaths) {
    try {
      const watcher = watch(filePath, { persistent: false }, async (eventType) => {
        if (eventType === 'change') {
          try {
            const content = await readFileAsync(filePath, 'utf-8')
            const windows = BrowserWindow.getAllWindows()
            for (const win of windows) {
              win.webContents.send('fs:file-changed', filePath, content)
            }
          } catch {
            // File might be temporarily unavailable during saves
          }
        }
      })

      watchers.set(filePath, { close: () => watcher.close() })
    } catch {
      // File doesn't exist or can't be watched
    }
  }
}

export function stopWatching(): void {
  for (const [, watcher] of watchers) {
    watcher.close()
  }
  watchers.clear()
}

export function addFileToWatch(filePath: string): void {
  if (watchers.has(filePath)) return

  try {
    const watcher = watch(filePath, { persistent: false }, async (eventType) => {
      if (eventType === 'change') {
        try {
          const content = await readFileAsync(filePath, 'utf-8')
          const windows = BrowserWindow.getAllWindows()
          for (const win of windows) {
            win.webContents.send('fs:file-changed', filePath, content)
          }
        } catch {
          // Ignore transient read errors
        }
      }
    })

    watchers.set(filePath, { close: () => watcher.close() })
  } catch {
    // Ignore
  }
}
