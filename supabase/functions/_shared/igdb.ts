// IGDB (Twitch): catálogo mundial de juegos. Sin dependencias: corre en Deno y en los tests.
// https://api-docs.igdb.com — consultas en Apicalypse por POST, 4 peticiones por segundo.

export const IGDB_GAMES_URL = 'https://api.igdb.com/v4/games'
const STEAM_SOURCE = 1
// Juego principal, remake, remaster, juego ampliado y port: sin DLC, packs ni mods.
const GAME_TYPES = '(0,8,9,10,11)'
const FIELDS =
  'name,slug,summary,first_release_date,cover.image_id,genres.name,platforms.abbreviation,external_games.uid,external_games.external_game_source'

export interface GameRow {
  igdb_id: number
  slug: string
  name: string
  summary: string | null
  release_date: string | null
  cover_url: string | null
  genres: string[]
  platforms: string[]
}

interface IgdbGame {
  id: number
  name: string
  slug: string
  summary?: string
  first_release_date?: number
  cover?: { image_id: string }
  genres?: { name: string }[]
  platforms?: { abbreviation?: string }[]
  external_games?: { uid?: string; external_game_source?: number }[]
}

/** Texto de búsqueda limpio, o null si no da para buscar. */
export function normalizeTerm(term: string): string | null {
  const clean = term.replace(/\s+/g, ' ').trim().slice(0, 80)
  return clean.length >= 2 ? clean : null
}

export function buildSearchQuery(term: string, limit = 20): string {
  const safe = term.replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `search "${safe}"; fields ${FIELDS}; where game_type = ${GAME_TYPES} & version_parent = null; limit ${limit};`
}

export function coverUrl(imageId: string, size = 't_cover_big'): string {
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`
}

export function mapIgdbGame(raw: IgdbGame): { game: GameRow; steamAppIds: string[] } {
  return {
    game: {
      igdb_id: raw.id,
      slug: raw.slug,
      name: raw.name,
      summary: raw.summary ?? null,
      release_date: raw.first_release_date ? new Date(raw.first_release_date * 1000).toISOString().slice(0, 10) : null,
      cover_url: raw.cover?.image_id ? coverUrl(raw.cover.image_id) : null,
      genres: (raw.genres ?? []).map((g) => g.name),
      platforms: (raw.platforms ?? []).flatMap((p) => (p.abbreviation ? [p.abbreviation] : [])),
    },
    steamAppIds: (raw.external_games ?? []).flatMap((e) =>
      e.external_game_source === STEAM_SOURCE && e.uid ? [e.uid] : [],
    ),
  }
}

type Mapped = ReturnType<typeof mapIgdbGame>

/**
 * Juegos importados de Steam que aún no tienen datos de IGDB se completan (merge) en lugar de crear
 * un segundo juego. El resto se inserta o actualiza por igdb_id.
 */
export function planCatalogMerge(
  mapped: Mapped[],
  gameBySteamApp: Map<string, { id: number; igdb_id: number | null }>,
): { merge: { gameId: number; row: GameRow }[]; insert: Mapped[] } {
  const merge: { gameId: number; row: GameRow }[] = []
  const insert: Mapped[] = []
  for (const m of mapped) {
    const target = m.steamAppIds.map((id) => gameBySteamApp.get(id)).find((g) => g && g.igdb_id === null)
    if (target) merge.push({ gameId: target.id, row: m.game })
    else insert.push(m)
  }
  return { merge, insert }
}
