import { ipcMain, app } from 'electron'
import { access, cp, mkdir } from 'fs/promises'
import { join } from 'path'

const DEMO_SOURCE_DIR = join('example-decks', 'hello-world')
/** Where the demo lands the first time someone opens it. */
const DEMO_FOLDER_NAME = 'Hello Lecta'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Where the bundled demo deck lives. Packaged builds ship it as an extraResource
 * (see `electron-builder.yml`); in development it is read straight from the repo.
 */
async function findDemoSource(): Promise<string | null> {
  const candidates = [
    join(process.resourcesPath ?? '', DEMO_SOURCE_DIR),
    join(app.getAppPath(), DEMO_SOURCE_DIR),
    join(app.getAppPath(), '..', DEMO_SOURCE_DIR),
    join(process.cwd(), DEMO_SOURCE_DIR)
  ]
  for (const candidate of candidates) {
    if (await exists(join(candidate, 'lecta.yaml'))) return candidate
  }
  return null
}

/** Absolute path of the user's copy of the demo deck. */
export function demoDeckPath(): string {
  return join(app.getPath('documents'), 'Lecta', DEMO_FOLDER_NAME)
}

/**
 * Copy the bundled demo deck into `~/Documents/Lecta/Hello Lecta/` if it is not
 * there yet and return its path, so the first run has something real to open.
 * Returns `null` when the demo deck is not bundled with this build.
 *
 * An existing copy is never overwritten: whatever the user did to their copy is
 * theirs, and reopening the demo just reopens it.
 */
export async function ensureDemoDeck(): Promise<string | null> {
  const destination = demoDeckPath()
  if (await exists(join(destination, 'lecta.yaml'))) return destination

  const source = await findDemoSource()
  if (!source) return null

  await mkdir(destination, { recursive: true })
  await cp(source, destination, { recursive: true, force: false, errorOnExist: false })

  return (await exists(join(destination, 'lecta.yaml'))) ? destination : null
}

export function registerDemoHandlers(): void {
  ipcMain.handle('fs:open-demo-deck', async () => ensureDemoDeck())
}
