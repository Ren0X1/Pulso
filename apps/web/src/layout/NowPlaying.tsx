import { useEffect, useRef, useState } from 'react'
import { loadLauncherSettings, logSession, nowPlaying, onNowPlaying, setPresence, type Playing } from '../lib/desktop.ts'

function elapsed(startedAt: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - startedAt) / 60_000))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/**
 * Solo en el launcher: qué juego está abierto (lo detecta Rust mirando los procesos), cuánto llevas,
 * y al cerrarlo la partida queda en tu actividad. También aplica tu preferencia de Discord al arrancar.
 */
export function NowPlaying({ userId }: { userId: string }) {
  const [playing, setPlaying] = useState<Playing | null>(null)
  const [now, setNow] = useState(Date.now())
  const current = useRef<Playing | null>(null)

  useEffect(() => {
    void loadLauncherSettings().then((s) => setPresence(s.discordPresence))
    void nowPlaying().then((p) => {
      current.current = p
      setPlaying(p)
    })
    const unlisten = onNowPlaying((next) => {
      const previous = current.current
      if (previous && previous.appid !== next?.appid) void logSession(userId, previous, Date.now())
      current.current = next
      setPlaying(next)
    })
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      void unlisten.then((fn) => fn())
      clearInterval(tick)
    }
  }, [userId])

  if (!playing) return null
  return (
    <p className="now-playing" aria-live="polite">
      <span className="now-dot" aria-hidden="true" />
      Jugando a <strong>{playing.name}</strong>
      <span className="muted num">· {elapsed(playing.startedAt, now)}</span>
    </p>
  )
}
