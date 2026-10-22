import { describe, expect, it } from 'vitest'
import { buildSearchQuery, coverUrl, mapIgdbGame, normalizeTerm } from './igdb.ts'

describe('normalizeTerm', () => {
  it('recorta espacios y exige al menos 2 caracteres', () => {
    expect(normalizeTerm('  half life  ')).toBe('half life')
    expect(normalizeTerm('a')).toBeNull()
    expect(normalizeTerm('   ')).toBeNull()
  })

  it('limita la longitud', () => {
    expect(normalizeTerm('x'.repeat(200))?.length).toBe(80)
  })
})

describe('buildSearchQuery', () => {
  it('busca por texto y pide los campos que guardamos', () => {
    const q = buildSearchQuery('portal')
    expect(q).toContain('search "portal";')
    expect(q).toContain('fields name,slug,summary,first_release_date,cover.image_id,genres.name,platforms.abbreviation,external_games.uid,external_games.external_game_source;')
    expect(q).toContain('limit 20;')
  })

  it('escapa comillas y barras: el texto no puede romper la consulta', () => {
    const backslash = '\\'
    const q = buildSearchQuery(`a"; fields *; where id = 1; "${backslash}`)
    expect(q).toContain(`search "a${backslash}"; fields *; where id = 1; ${backslash}"${backslash}${backslash}";`)
    expect(q.match(/^search /gm)).toHaveLength(1)
  })

  it('quita saltos de línea', () => {
    expect(buildSearchQuery('half\nlife')).toContain('search "half life";')
  })
})

describe('mapIgdbGame', () => {
  const raw = {
    id: 233,
    name: 'Half-Life 2',
    slug: 'half-life-2',
    summary: 'Gordon Freeman vuelve.',
    first_release_date: 1100563200,
    cover: { id: 1, image_id: 'co1nmw' },
    genres: [{ id: 5, name: 'Shooter' }],
    platforms: [{ id: 6, abbreviation: 'PC' }],
    external_games: [
      { id: 1, uid: '220', external_game_source: 1 },
      { id: 2, uid: 'abc', external_game_source: 5 },
    ],
  }

  it('convierte el juego a nuestra fila', () => {
    const { game } = mapIgdbGame(raw)
    expect(game).toEqual({
      igdb_id: 233,
      slug: 'half-life-2',
      name: 'Half-Life 2',
      summary: 'Gordon Freeman vuelve.',
      release_date: '2004-11-16',
      cover_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1nmw.jpg',
      genres: ['Shooter'],
      platforms: ['PC'],
    })
  })

  it('detecta los AppID de Steam (fuente 1)', () => {
    expect(mapIgdbGame(raw).steamAppIds).toEqual(['220'])
  })

  it('tolera juegos sin portada, fecha, géneros ni ids externos', () => {
    const { game, steamAppIds } = mapIgdbGame({ id: 9, name: 'Pong', slug: 'pong' })
    expect(game).toMatchObject({ cover_url: null, release_date: null, summary: null, genres: [], platforms: [] })
    expect(steamAppIds).toEqual([])
  })
})

describe('coverUrl', () => {
  it('usa la CDN de IGDB con el tamaño pedido', () => {
    expect(coverUrl('abc', 't_thumb')).toBe('https://images.igdb.com/igdb/image/upload/t_thumb/abc.jpg')
  })
})
