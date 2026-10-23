import { useEffect, useRef, useState } from 'react'
import { niceTicks } from '../lib/stats.ts'

const nf = new Intl.NumberFormat('es', { maximumFractionDigits: 1 })

/**
 * Barras horizontales ordenadas (magnitud de una sola serie): etiqueta, barra y valor escrito al final.
 * Un solo color de datos; el texto va en tinta, nunca en el color de la serie.
 */
export function BarList({
  title,
  items,
  unit,
}: {
  title: string
  items: { label: string; value: number }[]
  unit: string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <figure className="chart" aria-label={title}>
      <ul className="barlist" aria-hidden="true">
        {items.map((item) => (
          <li key={item.label} title={`${item.label}: ${nf.format(item.value)} ${unit}`}>
            <span className="barlist-label">{item.label}</span>
            <span className="barlist-track">
              <span className="barlist-bar" style={{ width: `${Math.max(0.5, (item.value / max) * 100)}%` }} />
            </span>
            <span className="barlist-value num">
              {nf.format(item.value)} <span className="muted">{unit}</span>
            </span>
          </li>
        ))}
      </ul>
      <table className="visually-hidden">
        <caption>{title}</caption>
        <tbody>
          {items.map((item) => (
            <tr key={item.label}>
              <th scope="row">{item.label}</th>
              <td>
                {nf.format(item.value)} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/** Columnas por mes (cambio en el tiempo) con información al pasar el ratón o el foco. */
export function MonthColumns({
  title,
  series,
  unit,
}: {
  title: string
  series: { key: string; label: string; value: number }[]
  unit: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  // Se dibuja al ancho real de la caja: así el texto del eje mide siempre lo mismo, sin estirarse.
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(720)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry!.contentRect.width))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const H = 220
  const pad = { top: 12, right: 8, bottom: 26, left: 40 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom
  const ticks = niceTicks(Math.max(...series.map((s) => s.value)))
  const niceMax = ticks[ticks.length - 1]!
  const slot = innerW / series.length
  const barW = Math.max(2, Math.min(28, slot - 2)) // 2px de separación como mínimo, sin columnas gordísimas
  const y = (v: number) => pad.top + innerH - (v / niceMax) * innerH
  const active = hover !== null ? series[hover] : null

  return (
    <figure className="chart" aria-label={title}>
      <div className="chart-plot" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-hidden="true" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={pad.left - 8} y={y(t)} className="chart-tick" textAnchor="end" dominantBaseline="middle">
                {nf.format(t)}
              </text>
            </g>
          ))}
          {series.map((s, i) => {
            const x = pad.left + i * slot + (slot - barW) / 2
            const h = (s.value / niceMax) * innerH
            const r = Math.min(4, barW / 2, h)
            const top = y(s.value)
            const base = pad.top + innerH
            return (
              <g key={s.key} onMouseEnter={() => setHover(i)}>
                {/* Zona de hover más grande que la columna */}
                <rect x={pad.left + i * slot} y={pad.top} width={slot} height={innerH} fill="transparent" />
                {s.value > 0 && (
                  <path
                    className="chart-bar"
                    data-dim={hover !== null && hover !== i ? '' : undefined}
                    d={`M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`}
                  />
                )}
                {i % 3 === series.length % 3 && (
                  <text x={x + barW / 2} y={H - 8} className="chart-tick" textAnchor="middle">
                    {s.label.split(' ')[0]}
                  </text>
                )}
              </g>
            )
          })}
          <line x1={pad.left} x2={W - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} className="chart-axis" />
        </svg>
        {active && (
          <div className="chart-tip" style={{ left: `${((pad.left + (hover! + 0.5) * slot) / W) * 100}%` }}>
            <span className="muted">{active.label}</span>
            <strong className="num">
              {nf.format(active.value)} {unit}
            </strong>
          </div>
        )}
      </div>
      <table className="visually-hidden">
        <caption>{title}</caption>
        <tbody>
          {series.map((s) => (
            <tr key={s.key}>
              <th scope="row">{s.label}</th>
              <td>
                {s.value} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
