import { describe, expect, it } from 'vitest'
import { coverCrop, LINK_KINDS, linkKindFor, normalizeLinkUrl } from './profile.ts'

describe('normalizeLinkUrl', () => {
  it('añade https:// si falta y recorta espacios', () => {
    expect(normalizeLinkUrl('  twitch.tv/ren0x ')).toBe('https://twitch.tv/ren0x')
    expect(normalizeLinkUrl('https://youtube.com/@ren0x')).toBe('https://youtube.com/@ren0x')
  })

  it('pasa http a https', () => {
    expect(normalizeLinkUrl('http://alejandromz.es')).toBe('https://alejandromz.es')
  })

  it('rechaza lo que no es una web', () => {
    for (const bad of ['javascript:alert(1)', '', '   ', 'ftp://x.com', 'no es una url', 'https://']) {
      expect(normalizeLinkUrl(bad), bad).toBeNull()
    }
  })

  it('rechaza direcciones larguísimas', () => {
    expect(normalizeLinkUrl(`https://x.com/${'a'.repeat(300)}`)).toBeNull()
  })
})

describe('linkKindFor', () => {
  it('reconoce la plataforma por el dominio', () => {
    expect(linkKindFor('https://www.twitch.tv/ren0x')).toBe('twitch')
    expect(linkKindFor('https://youtube.com/@ren0x')).toBe('youtube')
    expect(linkKindFor('https://youtu.be/xyz')).toBe('youtube')
    expect(linkKindFor('https://x.com/ren0x')).toBe('x')
    expect(linkKindFor('https://steamcommunity.com/id/ren0x')).toBe('steam')
    expect(linkKindFor('https://alejandromz.es')).toBe('website')
  })

  it('cada tipo tiene su etiqueta', () => {
    for (const kind of ['twitch', 'youtube', 'x', 'steam', 'website'] as const) expect(LINK_KINDS[kind]).toBeTruthy()
  })
})

describe('coverCrop', () => {
  it('avatar: recorte cuadrado centrado de una foto horizontal', () => {
    expect(coverCrop(1000, 500, 1, 1)).toEqual({ sx: 250, sy: 0, sw: 500, sh: 500 })
  })

  it('banner 3:1: recorte centrado de una foto vertical', () => {
    expect(coverCrop(600, 900, 3, 1)).toEqual({ sx: 0, sy: 350, sw: 600, sh: 200 })
  })

  it('si ya tiene la proporción, no recorta', () => {
    expect(coverCrop(1500, 500, 3, 1)).toEqual({ sx: 0, sy: 0, sw: 1500, sh: 500 })
  })
})
