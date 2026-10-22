import type { ReactNode } from 'react'

/** Un apartado que aún no tiene datos. Dice la verdad: qué falta y cuándo llega. */
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="empty" aria-label={title}>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </section>
  )
}
