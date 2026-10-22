/** Lo que cada plataforma permite obtener. La interfaz lo usa para no prometer datos que no existen. */
export interface PlatformAdapter {
  id: 'steam'
  displayName: string
  capabilities: { games: boolean; playtime: boolean; achievements: boolean }
}

export const steamPlatform: PlatformAdapter = {
  id: 'steam',
  displayName: 'Steam',
  capabilities: { games: true, playtime: true, achievements: true },
}
