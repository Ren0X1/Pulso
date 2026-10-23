import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@pulso/ui'
import { formatAgo, loadLastSync, syncErrorMessage, syncSteam, type LastSync, type SyncResult } from '../lib/steam.ts'

/** Botón "Sincronizar con Steam" con la última sincronización y lo que ha pasado, en palabras. */
export function SyncSteam({ onSynced }: { onSynced?: () => void }) {
  const [last, setLast] = useState<LastSync | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadLastSync().then(setLast)
  }, [])

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    const res = await syncSteam()
    setBusy(false)
    if ('error' in res) setError(syncErrorMessage(res))
    else {
      setResult(res)
      onSynced?.()
    }
    setLast(await loadLastSync())
  }

  return (
    <div className="sync">
      <div className="sync-row">
        <Button variant="ghost" busy={busy} onClick={() => void run()}>
          <RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" className={busy ? 'spin' : undefined} />
          {busy ? 'Importando de Steam…' : 'Sincronizar con Steam'}
        </Button>
        <span className="muted sync-when">
          {busy
            ? 'Puede tardar un minuto con bibliotecas grandes.'
            : last === undefined
              ? ' '
              : last === null
                ? 'Aún no has sincronizado.'
                : last.status === 'ok'
                  ? `Última sincronización ${formatAgo(last.finished_at ?? last.started_at)}`
                  : last.status === 'error'
                    ? `La última sincronización falló ${formatAgo(last.started_at)}`
                    : 'Sincronizando…'}
        </span>
      </div>
      <div aria-live="polite">
        {result && (
          <p className="sync-result num">
            {result.games} juegos en Steam · {result.added} nuevos en tu biblioteca · logros revisados en {result.achievementGames}{' '}
            juegos ({result.unlocked} conseguidos)
          </p>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
