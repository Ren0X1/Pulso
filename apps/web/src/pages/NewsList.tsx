import { ExternalLink } from 'lucide-react'
import { newsAgo, type NewsItem } from '../lib/news.ts'

/** Anuncios oficiales de Steam: imagen, título, de qué juego y cuándo. Se abren en Steam. */
export function NewsList({ news, names }: { news: NewsItem[] | null; names?: Map<number, string> }) {
  if (news === null) return <p className="muted">Cargando…</p>
  if (news.length === 0) return <p className="muted">Ningún anuncio reciente de estos juegos en Steam.</p>
  return (
    <ul className="news-list">
      {news.map((n) => (
        <li key={n.url}>
          <a className="news-item" href={n.url} target="_blank" rel="noreferrer">
            {n.image ? <img className="news-image" src={n.image} alt="" loading="lazy" /> : <span className="news-image" aria-hidden="true" />}
            <span className="news-text">
              <span className="news-title">{n.title}</span>
              <span className="muted news-meta">
                {names?.get(n.appid) ? `${names.get(n.appid)} · ` : ''}
                {newsAgo(n.date)} <ExternalLink size={11} strokeWidth={1.5} aria-hidden="true" />
              </span>
              {n.excerpt && <span className="muted news-excerpt">{n.excerpt}</span>}
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
