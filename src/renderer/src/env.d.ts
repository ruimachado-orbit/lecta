/// <reference types="vite/client" />

import type { ElectronAPI } from '../../main/src/preload'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
