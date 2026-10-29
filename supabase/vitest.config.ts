import { defineConfig } from 'vitest/config'

// Cada test arranca un Postgres entero en WASM (PGlite). Cuando Turborepo pasa los tests de todos los
// paquetes a la vez, alguno tarda más de los 5 s por defecto sin que haya ningún fallo.
export default defineConfig({
  test: { testTimeout: 60_000, hookTimeout: 60_000 },
})
