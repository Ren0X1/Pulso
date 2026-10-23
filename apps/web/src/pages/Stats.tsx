import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.tsx'
import { STATUS_LABELS, STATUSES } from '../lib/library.ts'
import { loadStats, monthSeries, summarizeLibrary, topByPlaytime } from '../lib/stats.ts'
import { EmptyState } from './EmptyState.tsx'
import { BarList, MonthColumns } from './StatsCharts.tsx'
import { SyncSteam } from './SyncSteam.tsx'

const nf = new Intl.NumberFormat('es', { maximumFractionDigits: 0 })

export function StatsPage() {
  const { state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : ''
  const [data, setData] = useState<Awaited<ReturnType<typeof loadStats>> | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    void loadStats(me).then(setData, () => setFailed(true))
  }, [me])

  if (failed) return <p className="notice" role="alert">No se pudieron cargar tus estadísticas.</p>
  if (!data) return <p className="muted">Cargando…</p>
  if (data.rows.length === 0) {
    return (
      <EmptyState title="Aún no hay estadísticas" action={<SyncSteam />}>
        Sincroniza tu biblioteca de Steam para ver tus horas, tus juegos más jugados y tus logros.
      </EmptyState>
    )
  }

  const summary = summarizeLibrary(data.rows)
  const top = topByPlaytime(data.rows, 10)
  const months = monthSeries(data.months, new Date(), 24)
  const monthTotal = months.reduce((s, m) => s + m.value, 0)
  const unplayedPct = Math.round((summary.unplayed / summary.games) * 100)

  return (
    <div className="stack">
      <p className="finding">
        {top[0]
          ? `${top[0].name} se lleva ${nf.format(top[0].hours)} h, el ${Math.round((top[0].hours / summary.hours) * 100)} % de todo lo que has jugado.`
          : 'Aún no hay horas registradas en tu biblioteca.'}
      </p>

      <section className="panel">
        <div className="kpis kpis-6">
          <div>
            <p className="kpi-label">Horas jugadas</p>
            <p className="kpi-value num">{nf.format(summary.hours)}</p>
          </div>
          <div>
            <p className="kpi-label">Juegos</p>
            <p className="kpi-value num">{nf.format(summary.games)}</p>
          </div>
          <div>
            <p className="kpi-label">Sin estrenar</p>
            <p className="kpi-value num">
              {nf.format(summary.unplayed)} <span className="kpi-sub">{unplayedPct} %</span>
            </p>
          </div>
          <div>
            <p className="kpi-label">Logros</p>
            <p className="kpi-value num">{nf.format(data.achievements)}</p>
          </div>
          <div>
            <p className="kpi-label">Platinos</p>
            <p className="kpi-value num">{nf.format(data.platinums)}</p>
          </div>
        </div>
        <p className="muted kpi-note">
          Horas de Steam (las de los juegos añadidos a mano no cuentan). Los logros se revisan 25 juegos por sincronización.
        </p>
      </section>

      <div className="stats-grid">
        <section className="panel" aria-label="Más jugados">
          <h2 className="panel-title">Más jugados</h2>
          <BarList title="Juegos con más horas" unit="h" items={top.map((t) => ({ label: t.name, value: t.hours }))} />
        </section>

        <section className="panel" aria-label="Tu biblioteca por estado">
          <h2 className="panel-title">Tu biblioteca por estado</h2>
          <BarList
            title="Juegos por estado"
            unit="juegos"
            items={STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: summary.byStatus[s] }))}
          />
        </section>
      </div>

      <section className="panel" aria-label="Logros por mes">
        <div className="panel-title-row">
          <h2 className="panel-title">Logros por mes</h2>
          <span className="muted num">{nf.format(monthTotal)} en 24 meses</span>
        </div>
        {monthTotal === 0 ? (
          <p className="muted">No hay logros con fecha en los últimos 24 meses.</p>
        ) : (
          <MonthColumns title="Logros conseguidos por mes, últimos 24 meses" unit="logros" series={months} />
        )}
      </section>
    </div>
  )
}
