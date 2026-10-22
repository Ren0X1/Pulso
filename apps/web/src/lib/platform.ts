import { isTauri } from '@tauri-apps/api/core'

export type LoginClient = 'web' | 'desktop'

/** La misma app corre en el navegador y dentro del launcher; esto decide qué puede hacer. */
export const isDesktop = (): boolean => isTauri()

export const loginClient = (): LoginClient => (isDesktop() ? 'desktop' : 'web')
