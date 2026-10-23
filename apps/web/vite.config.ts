import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Tauri carga el servidor de desarrollo en este puerto (apps/desktop/src-tauri/tauri.conf.json).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // En Windows el vigilante de archivos se pierde cambios (sobre todo en packages/), y la página se queda
  // con código o CSS viejo. Comprobar los archivos cada 300 ms es lo fiable.
  server: { port: 5173, strictPort: true, watch: { usePolling: true, interval: 300 } },
  envPrefix: ['VITE_'],
  test: { environment: 'jsdom', setupFiles: ['./vitest.setup.ts'] },
})
