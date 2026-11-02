import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import { useLive, userTopic } from '../lib/live.ts'
import {
  formatAgo,
  isStalled,
  kickSync,
  loadLastSync,
  startSync,
  syncErrorMessage,
  syncProgressText,
  syncSummaryText,
  type SyncRun,
} from '../lib/steam.ts'

/**
 * Botón "Sincronizar con Steam". La sincronización avanza sola en el servidor: aquí solo se lanza y se sigue
 * su progreso en directo (también si la lanzó un administrador o si se recarga la página).
 */
export function SyncSteam({ onSynced }: { onSynced?: () => void }) {
  const { state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : null
  const [last, setLast] = useState<SyncRun | null | undefined>(undefined)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seen = useRef<SyncRun | null>(null)
  const [finishedHere, setFinishedHere] = useState(false)
  const onSyncedRef = useRef(onSynced)
  onSyncedRef.current = onSynced

  const reload = useCallback(async () => {
    const run = await loadLastSync()
    const before = seen.current
    seen.current = run
    if (before && run && before.id === run.id && before.status === 'running') {
      // La biblioteca y las horas ya están al terminar la primera tanda; los logros, al terminar todo.
      if (before.games === null && run.games !== null) onSyncedRef.current?.()
      if (run.status !== 'running') {
        setFinishedHere(true)
        if (run.status === 'ok') onSyncedRef.current?.()
      }
    }
    setLast(run)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])
  useLive([me && userTopic(me)], reload)

  const running = last?.status === 'running'
  // Por si se pierde algún aviso en directo, se mira cada 10 s; y si una tanda se ha perdido, se relanza.
  useEffect(() => {
    if (!running || !last) return
    const timer = setInterval(() => {
      if (isStalled(last)) void kickSync(last.id).then(() => reload())
      else void reload()
    }, 10_000)
    return () => clearInterval(timer)
  }, [running, last, reload])

  async function run() {
    setStarting(true)
    setError(null)
    setFinishedHere(false)
    const res = await startSync()
    if ('error' in res) setError(syncErrorMessage(res))
    await reload()
    setStarting(false)
  }

  const status = last === undefined
    ? ' '
    : last === null
      ? 'Aún no has sincronizado.'
      : running
        ? syncProgressText(last)
        : last.status === 'ok'
          ? `Última sincronización ${formatAgo(last.finished_at ?? last.started_at)}`
          : `La última sincronización falló ${formatAgo(last.started_at)}`

  return (
    <div className="sync">
      <div className="sync-row">
        <Button variant="ghost" busy={starting || running} disabled={starting || running} onClick={() => void run()}>
          <RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" className={starting || running ? 'spin' : undefined} />
          {starting || running ? 'Sincronizando con Steam…' : 'Sincronizar con Steam'}
        </Button>
        <span className="muted sync-when">{status}</span>
      </div>
      <div aria-live="polite">
        {running && last?.forced_by && last.forced_by !== me && (
          <p className="muted sync-note">Un administrador ha lanzado una sincronización completa de tu cuenta.</p>
        )}
        {running && <p className="muted sync-note">Sigue sola en el servidor: puedes cerrar Pulso, no se pierde.</p>}
        {last?.status === 'ok' && finishedHere && <p className="sync-result num">{syncSummaryText(last)}</p>}
        {(error || (last?.status === 'error' && last.error)) && (
          <p className="notice" role="alert">
            {error ?? syncErrorMessage({ error: last!.error! })}
          </p>
        )}
      </div>
    </div>
  )
}
