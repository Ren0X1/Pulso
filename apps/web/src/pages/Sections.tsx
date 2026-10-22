import { EmptyState } from './EmptyState.tsx'

export function ActivityPage() {
  return (
    <EmptyState title="Sin actividad todavía">
      Tus sesiones de juego aparecerán aquí cuando el launcher detecte lo que juegas (Fase 4).
    </EmptyState>
  )
}

export function AchievementsPage() {
  return (
    <EmptyState title="Sin logros todavía">
      Los logros de Steam, con su rareza global y tu progreso por juego, llegan en la Fase 3.
    </EmptyState>
  )
}

