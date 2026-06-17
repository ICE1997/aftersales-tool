import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  // externalizeDeps defaults to true; set explicitly (electron-vite 5 deprecated
  // the externalizeDepsPlugin in favour of this build option). Keeps native/CJS
  // deps (better-sqlite3, sharp, electron-updater, …) external rather than bundled.
  main: { build: { externalizeDeps: true } },
  preload: { build: { externalizeDeps: true } },
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  }
})
