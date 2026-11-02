import { describe, expect, it } from 'vitest'
import { shortHours, steamHeroUrl, weekMinutes, weekStart } from './home.ts'

describe('weekStart', () => {
  it('la semana empieza el lunes a las 00:00', () => {
    const start = weekStart(new Date(2026, 10, 1, 18, 30)) // domingo 1 nov
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([2026, 9, 26, 0])
  })
})

describe('weekMinutes', () => {
  it('suma las partidas de cada día de esta semana y marca hoy', () => {
    const now = new Date(2026, 10, 1, 20, 0) // domingo
    const days = weekMinutes(
      [
        { created_at: new Date(2026, 9, 26, 22, 0).toISOString(), minutes: 90 }, // lunes
        { created_at: new Date(2026, 9, 26, 23, 0).toISOString(), minutes: 30 }, // lunes
        { created_at: new Date(2026, 9, 31, 12, 0).toISOString(), minutes: 210 }, // sábado
        { created_at: new Date(2026, 9, 25, 12, 0).toISOString(), minutes: 999 }, // domingo anterior
      ],
      now,
    )
    expect(days.map((d) => d.minutes)).toEqual([120, 0, 0, 0, 0, 210, 0])
    expect(days.map((d) => d.label).join('')).toBe('LMXJVSD')
    expect(days.findIndex((d) => d.today)).toBe(6)
  })
})

describe('shortHours', () => {
  it('cifras cortas para las horas', () => {
    expect(shortHours(45)).toBe('45 min')
    expect(shortHours(90)).toBe('1,5 h')
    expect(shortHours(7680)).toBe('128 h')
  })
})

describe('steamHeroUrl', () => {
  it('usa el arte grande de la biblioteca de Steam', () => {
    expect(steamHeroUrl(1245620)).toBe('https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/library_hero.jpg')
  })
})
