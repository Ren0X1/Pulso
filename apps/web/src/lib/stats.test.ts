import { describe, expect, it } from 'vitest'
import { monthSeries, summarizeLibrary, topByPlaytime } from './stats.ts'

const row = (status: string, minutes: number | null, name = 'X') => ({ status, playtime_minutes: minutes, game: { name, cover_url: null } })

describe('summarizeLibrary', () => {
  it('cuenta juegos, horas, jugados y sin estrenar', () => {
    const s = summarizeLibrary([row('playing', 600), row('backlog', 0), row('backlog', null), row('completed', 90)])
    expect(s).toEqual({
      games: 4,
      hours: 11.5,
      played: 2,
      unplayed: 2,
      byStatus: { backlog: 2, playing: 1, completed: 1, dropped: 0 },
    })
  })

  it('una biblioteca vacía da ceros, no errores', () => {
    expect(summarizeLibrary([])).toEqual({ games: 0, hours: 0, played: 0, unplayed: 0, byStatus: { backlog: 0, playing: 0, completed: 0, dropped: 0 } })
  })
})

describe('topByPlaytime', () => {
  it('los N juegos con más horas, de mayor a menor, sin los que no tienen horas', () => {
    const top = topByPlaytime([row('playing', 60, 'B'), row('playing', 600, 'A'), row('backlog', 0, 'C'), row('backlog', null, 'D')], 10)
    expect(top).toEqual([
      { name: 'A', hours: 10, cover_url: null },
      { name: 'B', hours: 1, cover_url: null },
    ])
  })
})

describe('monthSeries', () => {
  it('rellena con ceros los meses sin logros y acaba en el mes actual', () => {
    const series = monthSeries(
      [
        { month: '2026-08-01T00:00:00+00:00', unlocked: 5 },
        { month: '2026-10-01T00:00:00+00:00', unlocked: 2 },
      ],
      new Date('2026-10-24T12:00:00Z'),
      4,
    )
    expect(series).toEqual([
      { key: '2026-07', label: 'jul 2026', value: 0 },
      { key: '2026-08', label: 'ago 2026', value: 5 },
      { key: '2026-09', label: 'sept 2026', value: 0 },
      { key: '2026-10', label: 'oct 2026', value: 2 },
    ])
  })

  it('ignora meses fuera de la ventana', () => {
    const series = monthSeries([{ month: '2020-01-01T00:00:00+00:00', unlocked: 9 }], new Date('2026-10-24T12:00:00Z'), 2)
    expect(series.map((m) => m.value)).toEqual([0, 0])
  })
})
