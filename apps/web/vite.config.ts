import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Tauri carga el servidor de desarrollo en este puerto (apps/desktop/src-tauri/tauri.conf.json).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  envPrefix: ['VITE_'],
  test: { environment: 'jsdom', setupFiles: ['./vitest.setup.ts'] },
})
