import { supabase } from './supabase.ts'

export const PAGE_SIZE = 60

export const STATUSES = ['backlog', 'playing', 'completed', 'dropped'] as const
export type GameStatus = (typeof STATUSES)[number]

export const STATUS_LABELS: Record<GameStatus, string> = {
  backlog: 'Pendiente',
  playing: 'Jugando',
  completed: 'Completado',
  dropped: 'Abandonado',
}

const SORTS = ['added', 'name', 'playtime'] as const
export type LibrarySort = (typeof SORTS)[number]

export const SORT_LABELS: Record<LibrarySort, string> = {
  added: 'Añadidos recientemente',
  name: 'Nombre',
  playtime: 'Horas jugadas',
}

export interface LibraryParams {
  status: GameStatus | null
  favorite: boolean
  tag: string | null
  q: string
  sort: LibrarySort
  view: 'grid' | 'list'
  page: number
}

const DEFAULTS: LibraryParams = { status: null, favorite: false, tag: null, q: '', sort: 'added', view: 'grid', page: 1 }

const oneOf = <T extends string>(list: readonly T[], value: string | null): T | null =>
  list.includes(value as T) ? (value as T) : null

/** Los filtros viven en la URL: se pueden compartir y sobreviven a recargar. */
export function parseLibraryParams(search: URLSearchParams): LibraryParams {
  const page = Number.parseInt(search.get('pagina') ?? '', 10)
  const tag = (search.get('etiqueta') ?? '').trim().slice(0, 40)
  return {
    status: oneOf(STATUSES, search.get('estado')),
    favorite: search.get('favoritos') === '1',
    tag: tag || null,
    q: (search.get('q') ?? '').trim().slice(0, 80),
    sort: oneOf(SORTS, search.get('orden')) ?? DEFAULTS.sort,
    view: search.get('vista') === 'list' ? 'list' : 'grid',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  }
}

export function toSearchParams(p: LibraryParams): URLSearchParams {
  const out = new URLSearchParams()
  if (p.status) out.set('estado', p.status)
  if (p.favorite) out.set('favoritos', '1')
  if (p.tag) out.set('etiqueta', p.tag)
  if (p.q) out.set('q', p.q)
  if (p.sort !== DEFAULTS.sort) out.set('orden', p.sort)
  if (p.view !== DEFAULTS.view) out.set('vista', p.view)
  if (p.page !== DEFAULTS.page) out.set('pagina', String(p.page))
  return out
}

export interface CatalogGame {
  id: number
  name: string
  slug: string
  summary: string | null
  release_date: string | null
  cover_url: string | null
  genres: string[]
  platforms: string[]
}

export interface LibraryEntry {
  game_id: number
  status: GameStatus
  favorite: boolean
  tags: string[]
  playtime_minutes: number | null
  last_played_at: string | null
  source: 'manual' | 'steam'
  added_at: string
  game: CatalogGame
}

const ENTRY = `game_id, status, favorite, tags, playtime_minutes, last_played_at, source, added_at,
  game:games!inner(id, name, slug, summary, release_date, cover_url, genres, platforms)`

export async function loadLibrary(userId: string, p: LibraryParams): Promise<{ rows: LibraryEntry[]; total: number }> {
  let query = supabase!.from('user_games').select(ENTRY, { count: 'exact' }).eq('user_id', userId)
  if (p.status) query = query.eq('status', p.status)
  if (p.favorite) query = query.eq('favorite', true)
  if (p.tag) query = query.contains('tags', [p.tag])
  if (p.q) query = query.ilike('game.name', `%${p.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)
  query =
    p.sort === 'name'
      ? query.order('name', { referencedTable: 'game' })
      : p.sort === 'playtime'
        ? query.order('playtime_minutes', { ascending: false, nullsFirst: false })
        : query.order('added_at', { ascending: false })
  const { data, count, error } = await query.range(0, p.page * PAGE_SIZE - 1)
  if (error) throw error
  return { rows: (data ?? []) as unknown as LibraryEntry[], total: count ?? 0 }
}

export async function loadMyTags(userId: string): Promise<string[]> {
  const { data } = await supabase!.from('user_games').select('tags').eq('user_id', userId).neq('tags', '{}')
  const all = new Set<string>()
  for (const row of (data ?? []) as { tags: string[] }[]) for (const t of row.tags) all.add(t)
  return [...all].sort((a, b) => a.localeCompare(b, 'es'))
}

export async function addToLibrary(userId: string, gameId: number) {
  const { error } = await supabase!.from('user_games').insert({ user_id: userId, game_id: gameId, source: 'manual' })
  if (error && error.code !== '23505') throw error
}

export async function updateEntry(
  userId: string,
  gameId: number,
  patch: Partial<Pick<LibraryEntry, 'status' | 'favorite' | 'tags'>>,
) {
  const { error } = await supabase!.from('user_games').update(patch).eq('user_id', userId).eq('game_id', gameId)
  if (error) throw error
}

export async function removeFromLibrary(userId: string, gameId: number) {
  const { error } = await supabase!.from('user_games').delete().eq('user_id', userId).eq('game_id', gameId)
  if (error) throw error
}

export type CatalogError = 'term_too_short' | 'catalog_not_configured' | 'catalog_unavailable' | 'not_signed_in'

export async function searchCatalog(term: string): Promise<{ games: CatalogGame[] } | { error: CatalogError }> {
  const { data, error } = await supabase!.functions.invoke(`catalog?q=${encodeURIComponent(term)}`, { method: 'GET' })
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
    return { error: (body?.error as CatalogError) ?? 'catalog_unavailable' }
  }
  return data as { games: CatalogGame[] }
}

export function formatPlaytime(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60) return `${minutes} min`
  return `${(minutes / 60).toLocaleString('es', { maximumFractionDigits: 1 })} h`
}
