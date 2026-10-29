// Cambios en directo: la base de datos avisa por Supabase Realtime (canales privados, broadcast "changed",
// sin datos) y la pantalla vuelve a pedir lo suyo. Quién puede escuchar cada canal lo decide RLS.

import { useEffect, useRef } from 'react'
import { supabase } from './supabase.ts'

export const userTopic = (id: string) => `user:${id}`
export const listTopic = (id: string) => `list:${id}`

/** Lo mínimo del cliente de Supabase que usa el gestor (así se prueba sin red). */
export interface LiveClient {
  channel(topic: string, opts: { config: { private: boolean } }): LiveChannel
  removeChannel(channel: LiveChannel): unknown
  realtime: { setAuth(): Promise<unknown> }
}
export interface LiveChannel {
  on(type: 'broadcast', filter: { event: string }, callback: () => void): LiveChannel
  subscribe(callback?: (status: string) => void): unknown
}

/**
 * Un canal por tema aunque lo escuchen varias pantallas a la vez; se cierra cuando ya no lo escucha nadie.
 * Tras una reconexión se avisa una vez a todos, por si se perdió algún cambio mientras tanto.
 */
export function createLiveHub(client: LiveClient) {
  const topics = new Map<string, { channel: LiveChannel; listeners: Set<() => void> }>()
  let auth: Promise<unknown> | null = null

  return function listen(topic: string, listener: () => void): () => void {
    let entry = topics.get(topic)
    if (!entry) {
      const listeners = new Set<() => void>()
      const notify = () => listeners.forEach((fn) => fn())
      const channel = client.channel(topic, { config: { private: true } }).on('broadcast', { event: 'changed' }, notify)
      let joined = false
      auth ??= client.realtime.setAuth().catch(() => {})
      void auth.then(() => {
        if (topics.get(topic)?.channel !== channel) return // ya se cerró antes de tener sesión
        channel.subscribe((status) => {
          if (status !== 'SUBSCRIBED') return
          if (joined) notify()
          joined = true
        })
      })
      entry = { channel, listeners }
      topics.set(topic, entry)
    }
    const current = entry
    current.listeners.add(listener)
    return () => {
      current.listeners.delete(listener)
      if (current.listeners.size === 0 && topics.get(topic) === current) {
        topics.delete(topic)
        void client.removeChannel(current.channel)
      }
    }
  }
}

const listen = supabase ? createLiveHub(supabase as unknown as LiveClient) : null

/**
 * Vuelve a cargar la pantalla cuando cambia algo en esos canales o al volver a ella (pestaña o ventana
 * del launcher que estaba oculta). Las ráfagas, como una sincronización, se agrupan en una sola recarga.
 */
export function useLive(topics: (string | null | undefined)[], reload: () => unknown, delay = 300) {
  const latest = useRef(reload)
  useEffect(() => {
    latest.current = reload
  })
  const key = topics.filter(Boolean).join(' ')

  useEffect(() => {
    if (!listen || !key) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const fire = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void latest.current(), delay)
    }
    const stops = key.split(' ').map((topic) => listen(topic, fire))
    const onVisible = () => {
      if (document.visibilityState === 'visible') fire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      stops.forEach((stop) => stop())
    }
  }, [key, delay])
}
