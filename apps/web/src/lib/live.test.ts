import { describe, expect, it, vi } from 'vitest'
import { createLiveHub, listTopic, userTopic, type LiveChannel, type LiveClient } from './live.ts'

/** Cliente de mentira: guarda los canales abiertos y deja simular avisos y reconexiones. */
function fakeClient() {
  const open = new Map<string, { emit: () => void; status: (s: string) => void }>()
  const client: LiveClient = {
    channel(topic, opts) {
      expect(opts.config.private).toBe(true)
      let onChange = () => {}
      const channel: LiveChannel = {
        on(_type, filter, callback) {
          expect(filter.event).toBe('changed')
          onChange = callback
          return channel
        },
        subscribe(callback) {
          open.set(topic, { emit: () => onChange(), status: (s) => callback?.(s) })
          callback?.('SUBSCRIBED')
          return channel
        },
      }
      return channel
    },
    removeChannel: vi.fn((channel: LiveChannel) => {
      for (const [topic] of open) if (channel) open.delete(topic)
    }),
    realtime: { setAuth: vi.fn(async () => {}) },
  }
  return { client, open }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('canales en directo', () => {
  it('nombres de canal de usuario y de lista', () => {
    expect(userTopic('u1')).toBe('user:u1')
    expect(listTopic('l1')).toBe('list:l1')
  })

  it('un solo canal por tema y el aviso llega a todas las pantallas que lo escuchan', async () => {
    const { client, open } = fakeClient()
    const listen = createLiveHub(client)
    const a = vi.fn()
    const b = vi.fn()
    listen('user:u1', a)
    listen('user:u1', b)
    await tick()
    expect(open.size).toBe(1)
    open.get('user:u1')!.emit()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('el canal se cierra cuando deja de escucharlo la última pantalla', async () => {
    const { client } = fakeClient()
    const listen = createLiveHub(client)
    const stopA = listen('list:l1', () => {})
    const stopB = listen('list:l1', () => {})
    await tick()
    stopA()
    expect(client.removeChannel).not.toHaveBeenCalled()
    stopB()
    expect(client.removeChannel).toHaveBeenCalledTimes(1)
  })

  it('tras reconectar avisa una vez, por si se perdió algún cambio; al conectar la primera vez no', async () => {
    const { client, open } = fakeClient()
    const listen = createLiveHub(client)
    const fn = vi.fn()
    listen('user:u1', fn)
    await tick()
    expect(fn).not.toHaveBeenCalled()
    open.get('user:u1')!.status('SUBSCRIBED')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('se identifica una sola vez antes de suscribirse', async () => {
    const { client } = fakeClient()
    const listen = createLiveHub(client)
    listen('user:u1', () => {})
    listen('list:l1', () => {})
    await tick()
    expect(client.realtime.setAuth).toHaveBeenCalledTimes(1)
  })
})
