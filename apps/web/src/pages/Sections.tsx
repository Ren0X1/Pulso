import { EmptyState } from './EmptyState.tsx'

export function LibraryPage() {
  return (
    <EmptyState title="Tu biblioteca está vacía">
      Llega en las Fases 2 y 3: podrás añadir cualquier juego del catálogo mundial y Pulso importará los de tu cuenta de
      Steam, con sus horas y su estado.
    </EmptyState>
  )
}

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

export function FriendsPage() {
  return (
    <EmptyState title="Aún no tienes amigos en Pulso">
      Buscar jugadores, enviar solicitudes y ver lo que juegan tus amigos llega en la Fase 2.
    </EmptyState>
  )
}
