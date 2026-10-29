// Lo que solo puede hacer el launcher: juegos instalados, lanzar, abrir carpetas, Discord y arrancar con el sistema.
// En la web estas funciones no se llaman (isDesktop() es falso) y la interfaz no las ofrece.

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { supabase } from './supabase.ts'

export interface InstalledGame {
  appid: number
  name: string
  installDir: string
  sizeBytes: number
}

export interface Playing {
  appid: number
  name: string
  startedAt: number
}

export interface ExternalId {
  source: string
  external_id: string
}

export function steamAppId(external: ExternalId[] | undefined): number | null {
  const steam = external?.find((e) => e.source === 'steam')
  return steam ? Number(steam.external_id) : null
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** exp).toLocaleString('es', { maximumFractionDigits: 1, minimumFractionDigits: exp > 1 ? 1 : 0 })} ${units[exp]}`
}

/** Minutos de una sesión; menos de un minuto no cuenta como haber jugado. */
export function sessionMinutes(startedAt: number, endedAt: number): number {
  const minutes = (endedAt - startedAt) / 60_000
  return minutes < 1 ? 0 : Math.round(minutes)
}

let installedCache: Promise<InstalledGame[]> | null = null

/** Juegos de Steam instalados en este PC (se leen una vez por sesión salvo que se pida refrescar). */
export function installedGames(refresh = false): Promise<InstalledGame[]> {
  if (!installedCache || refresh) installedCache = invoke<InstalledGame[]>('installed_games').catch(() => [])
  return installedCache
}

export const launchGame = (appid: number, args?: string) => invoke('launch_game', { appid, args: args?.trim() || null })
export const installGame = (appid: number) => invoke('install_game', { appid })
export const openGameFolder = (appid: number) => invoke('open_game_folder', { appid })
export const setPresence = (enabled: boolean) => invoke('set_presence', { enabled })
export const nowPlaying = () => invoke<Playing | null>('now_playing')
export const onNowPlaying = (handler: (playing: Playing | null) => void): Promise<UnlistenFn> =>
  listen<Playing | null>('now-playing', (event) => handler(event.payload))

/** Ajustes del launcher que viajan con la cuenta (tabla user_settings). */
export interface LauncherSettings {
  discordPresence: boolean
  /** Parámetros de lanzamiento por AppID de Steam, p. ej. { "70": "-windowed -w 800 -h 600" }. */
  launchOptions: Record<string, string>
}

export const DEFAULT_LAUNCHER: LauncherSettings = { discordPresence: true, launchOptions: {} }

export async function loadLauncherSettings(): Promise<LauncherSettings> {
  const { data } = await supabase!.from('user_settings').select('launcher').maybeSingle()
  return { ...DEFAULT_LAUNCHER, ...((data as { launcher: Partial<LauncherSettings> } | null)?.launcher ?? {}) }
}

export async function saveLauncherSettings(userId: string, settings: LauncherSettings) {
  const { error } = await supabase!.from('user_settings').update({ launcher: settings }).eq('user_id', userId)
  if (error) throw error
}

/** Registra una partida terminada en la actividad, enlazada al juego de Pulso por su AppID de Steam. */
export async function logSession(userId: string, playing: Playing, endedAt: number) {
  const minutes = sessionMinutes(playing.startedAt, endedAt)
  if (minutes === 0) return
  const { data } = await supabase!
    .from('game_external_ids')
    .select('game_id')
    .eq('source', 'steam')
    .eq('external_id', String(playing.appid))
    .maybeSingle()
  await supabase!.from('activity_events').insert({
    user_id: userId,
    kind: 'played',
    game_id: (data as { game_id: number } | null)?.game_id ?? null,
    payload: { appid: playing.appid, name: playing.name, minutes, started_at: new Date(playing.startedAt).toISOString() },
  })
}

/** Dirección pública de la web (el botón "Mi perfil en Pulso" de Discord lleva aquí). */
export const PULSO_WEB_URL = 'https://pulso-11e.pages.dev'

const hoursFmt = new Intl.NumberFormat('es', { maximumFractionDigits: 0 })

/** La línea de Discord bajo el juego: platino o logros, y horas de Steam. Nada si no hay datos. */
export function presenceLine({ minutes, unlocked, total }: { minutes: number; unlocked: number; total: number }): string | null {
  const parts: string[] = []
  if (total > 0 && unlocked === total) parts.push('🏆 Platino')
  else if (total > 0) parts.push(`${unlocked}/${total} logros`)
  if (minutes >= 60) parts.push(`${hoursFmt.format(Math.floor(minutes / 60))} h de juego`)
  return parts.length ? parts.join(' · ') : null
}

export interface PresenceInfo {
  appid: number
  state: string | null
  badge: string | null
  profileUrl: string | null
}

export const setPresenceInfo = (info: PresenceInfo) => invoke('set_presence_info', { info })

/** Horas y logros de tu cuenta en el juego abierto, y tus platinos, para el estado de Discord. */
export async function loadPresenceInfo(userId: string, username: string, appid: number): Promise<PresenceInfo> {
  const [gameId] = await gameIdsForAppIds([appid])
  const [library, progress] = await Promise.all([
    gameId
      ? supabase!.from('user_games').select('playtime_minutes').eq('user_id', userId).eq('game_id', gameId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase!.from('achievement_progress').select('game_id, unlocked, total').eq('user_id', userId),
  ])
  const rows = (progress.data ?? []) as { game_id: number; unlocked: number; total: number }[]
  const game = rows.find((r) => r.game_id === gameId)
  const platinums = rows.filter((r) => r.total > 0 && r.unlocked === r.total).length
  return {
    appid,
    state: presenceLine({
      minutes: (library.data as { playtime_minutes: number | null } | null)?.playtime_minutes ?? 0,
      unlocked: game?.unlocked ?? 0,
      total: game?.total ?? 0,
    }),
    badge: platinums ? `${username} · ${platinums} ${platinums === 1 ? 'platino' : 'platinos'}` : username,
    profileUrl: `${PULSO_WEB_URL}/u/${encodeURIComponent(username)}`,
  }
}

/** Ids de juego de Pulso que corresponden a estos AppID de Steam. */
export async function gameIdsForAppIds(appids: number[]): Promise<number[]> {
  if (appids.length === 0) return []
  const { data } = await supabase!
    .from('game_external_ids')
    .select('game_id')
    .eq('source', 'steam')
    .in('external_id', appids.map(String))
  return ((data ?? []) as { game_id: number }[]).map((r) => r.game_id)
}
