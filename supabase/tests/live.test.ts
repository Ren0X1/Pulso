import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './harness.ts'

const OWNER = '00000000-0000-0000-0000-00000000000a'
const MEMBER = '00000000-0000-0000-0000-00000000000b'
const FRIEND = '00000000-0000-0000-0000-00000000000c'
const STRANGER = '00000000-0000-0000-0000-00000000000d'
const LIST = '10000000-0000-0000-0000-000000000001'

let t: Awaited<ReturnType<typeof createTestDb>>

const befriend = (a: string, b: string) =>
  t.db.query(`insert into public.friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [a, b])

beforeEach(async () => {
  t = await createTestDb()
  for (const [id, name] of [[OWNER, 'owner'], [MEMBER, 'member'], [FRIEND, 'friend'], [STRANGER, 'stranger']] as const) {
    await t.createUser(id, name)
  }
  await befriend(OWNER, MEMBER)
  await befriend(FRIEND, OWNER)
  await t.db.exec(`insert into public.games (id, slug, name) overriding system value values (1, 'portal', 'Portal')`)
  await t.db.query(`insert into public.game_lists (id, owner_id, name, visibility) values ($1, $2, 'Coop', 'private')`, [LIST, OWNER])
  await t.as({ user: OWNER }, `insert into public.game_list_members (list_id, user_id, role) values ($1, $2, 'editor')`, [LIST, MEMBER])
  await t.db.exec('delete from realtime.messages')
})

/** Canales avisados desde el último borrado, sin repetir. */
async function topics() {
  const rows = (await t.db.query<{ topic: string; payload: unknown }>('select topic, payload from realtime.messages')).rows
  for (const r of rows) expect(r.payload).toEqual({}) // el aviso nunca lleva datos
  return [...new Set(rows.map((r) => r.topic))].sort()
}

/** Si ese usuario puede suscribirse al canal: Realtime comprueba la política de realtime.messages igual que aquí. */
async function canListen(user: string, topic: string) {
  await t.db.query(`insert into realtime.messages (topic, event, payload, private) values ($1, 'changed', '{}', true)`, [topic])
  return t.db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('realtime.topic', $2, true)`, [user, topic])
    return (await tx.query('select 1 from realtime.messages where topic = $1', [topic])).rows.length > 0
  })
}

describe('avisos de cambios', () => {
  it('un juego añadido a la lista avisa a su canal', async () => {
    await t.as({ user: MEMBER }, 'insert into public.game_list_items (list_id, game_id) values ($1, 1)', [LIST])
    expect(await topics()).toEqual([`list:${LIST}`])
  })

  it('renombrar la lista avisa a la lista, al dueño y a los miembros', async () => {
    await t.as({ user: OWNER }, `update public.game_lists set name = 'Coop finde' where id = $1`, [LIST])
    expect(await topics()).toEqual([`list:${LIST}`, `user:${OWNER}`, `user:${MEMBER}`].sort())
  })

  it('salir de una lista avisa a la lista y a quien sale', async () => {
    await t.as({ user: MEMBER }, 'delete from public.game_list_members where list_id = $1 and user_id = $2', [LIST, MEMBER])
    expect(await topics()).toEqual([`list:${LIST}`, `user:${MEMBER}`].sort())
  })

  it('una solicitud de amistad avisa a los dos', async () => {
    await t.as({ user: STRANGER }, 'insert into public.friendships (requester_id, addressee_id) values ($1, $2)', [STRANGER, FRIEND])
    expect(await topics()).toContain(`user:${STRANGER}`)
    expect(await topics()).toContain(`user:${FRIEND}`)
  })

  it('la actividad nueva avisa a quien juega y a sus amigos, no a desconocidos', async () => {
    await t.db.query(`insert into public.activity_events (user_id, kind, payload) values ($1, 'played', '{}')`, [OWNER])
    expect(await topics()).toEqual([`user:${OWNER}`, `user:${MEMBER}`, `user:${FRIEND}`].sort())
  })
})

describe('quién puede escuchar cada canal', () => {
  it('cada uno solo escucha su propio canal de usuario', async () => {
    expect(await canListen(OWNER, `user:${OWNER}`)).toBe(true)
    expect(await canListen(STRANGER, `user:${OWNER}`)).toBe(false)
  })

  it('el canal de una lista privada: el dueño y sus miembros sí, un desconocido no', async () => {
    expect(await canListen(OWNER, `list:${LIST}`)).toBe(true)
    expect(await canListen(MEMBER, `list:${LIST}`)).toBe(true)
    expect(await canListen(FRIEND, `list:${LIST}`)).toBe(false)
    expect(await canListen(STRANGER, `list:${LIST}`)).toBe(false)
  })

  it('un nombre de canal raro no da error ni acceso', async () => {
    expect(await canListen(OWNER, 'list:no-es-un-uuid')).toBe(false)
    expect(await canListen(OWNER, 'cualquier-cosa')).toBe(false)
  })
})
