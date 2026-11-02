import { describe, expect, it } from 'vitest'
import { mergeNews, newsExcerpt, newsImage, parseNews, type NewsItem } from './news.ts'

describe('newsExcerpt', () => {
  it('quita BBCode, imágenes, enlaces y espacios de sobra', () => {
    const raw = '[img]{STEAM_CLAN_IMAGE}/1/a.png[/img][h1]Parche 9[/h1] Nuevo [b]modo[/b] cooperativo. https://x.com\n\n  Más cosas.'
    expect(newsExcerpt(raw)).toBe('Parche 9 Nuevo modo cooperativo. Más cosas.')
  })

  it('quita las barras con las que Steam escapa el texto', () => {
    expect(newsExcerpt('\\Added an option \\[beta\\]')).toBe('Added an option [beta]')
  })

  it('recorta por palabras con puntos suspensivos', () => {
    expect(newsExcerpt('uno dos tres cuatro cinco', 12)).toBe('uno dos tres…')
  })
})

describe('newsImage', () => {
  it('saca la primera imagen del anuncio con su dirección completa', () => {
    expect(newsImage('hola [img]{STEAM_CLAN_IMAGE}/123/abc.png[/img]')).toBe('https://clan.akamai.steamstatic.com/images/123/abc.png')
    expect(newsImage('<p><img src="https://cdn.x/y.jpg"></p>')).toBe('https://cdn.x/y.jpg')
    expect(newsImage('sin imágenes')).toBeNull()
  })
})

describe('parseNews', () => {
  it('se queda solo con los anuncios oficiales', () => {
    const body = {
      appnews: {
        newsitems: [
          { title: 'Parche 9', url: 'https://store.steampowered.com/news/1', date: 100, contents: 'Notas', feedname: 'steam_community_announcements' },
          { title: 'Artículo externo', url: 'https://web.ru/x', date: 200, contents: 'texto', feedname: 'PlayGround.ru' },
        ],
      },
    }
    expect(parseNews(7, body)).toEqual([
      { appid: 7, title: 'Parche 9', url: 'https://store.steampowered.com/news/1', date: 100, excerpt: 'Notas', image: null },
    ])
    expect(parseNews(7, null)).toEqual([])
  })
})

describe('mergeNews', () => {
  it('las más recientes primero, hasta el límite', () => {
    const item = (appid: number, date: number): NewsItem => ({ appid, title: 't', url: 'u', date, excerpt: '', image: null })
    expect(mergeNews([[item(1, 10), item(1, 30)], [item(2, 20)]], 2).map((n) => n.date)).toEqual([30, 20])
  })
})
