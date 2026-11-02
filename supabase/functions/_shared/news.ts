// Noticias de Steam de los juegos del usuario: solo los anuncios oficiales del estudio (no artículos de webs
// externas en cualquier idioma). Sin dependencias: corre en Deno y en los tests.

export interface NewsItem {
  appid: number
  title: string
  url: string
  /** Segundos Unix. */
  date: number
  excerpt: string
  image: string | null
}

const CLAN_IMAGES = 'https://clan.akamai.steamstatic.com/images/'

/** Texto plano de un anuncio de Steam (BBCode o HTML), recortado a `max` caracteres. */
export function newsExcerpt(contents: string, max = 220): string {
  const text = contents
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, ' ')
    .replace(/\[(previewyoutube|video)[^\]]*\][\s\S]*?\[\/\1\]/gi, ' ')
    .replace(/\[\/?[a-z0-9*]+(=[^\]]*)?\]/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{STEAM_CLAN_IMAGE\}\S*/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    // Steam escapa los corchetes del texto con una barra (\[): se quita.
    .replace(/\\(.)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  // Si el corte cae en mitad de una palabra, esa palabra se quita entera.
  const cut = text.slice(0, max)
  return `${text[max] === ' ' ? cut : cut.replace(/\s+\S*$/, '')}…`
}

/** La primera imagen del anuncio, si la tiene. */
export function newsImage(contents: string): string | null {
  const bb = /\[img\]\s*(\S+?)\s*\[\/img\]/i.exec(contents)?.[1] ?? /<img[^>]+src="([^"]+)"/i.exec(contents)?.[1]
  if (!bb) return null
  const url = bb.replace('{STEAM_CLAN_IMAGE}/', CLAN_IMAGES)
  return url.startsWith('https://') ? url : null
}

interface RawItem {
  title?: string
  url?: string
  date?: number
  contents?: string
  feedname?: string
}

/** Los anuncios oficiales de una respuesta de ISteamNews/GetNewsForApp. */
export function parseNews(appid: number, body: unknown): NewsItem[] {
  const items = (body as { appnews?: { newsitems?: RawItem[] } } | null)?.appnews?.newsitems ?? []
  return items
    .filter((i) => i.feedname === 'steam_community_announcements' && i.title && i.url && i.date)
    .map((i) => ({
      appid,
      title: i.title!,
      url: i.url!.replace(/ /g, '%20'),
      date: i.date!,
      excerpt: newsExcerpt(i.contents ?? ''),
      image: newsImage(i.contents ?? ''),
    }))
}

/** Junta las noticias de varios juegos: las más recientes primero, como mucho `limit`. */
export function mergeNews(lists: NewsItem[][], limit: number): NewsItem[] {
  return lists
    .flat()
    .sort((a, b) => b.date - a.date)
    .slice(0, limit)
}
