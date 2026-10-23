import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './harness.ts'

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const LIST = '10000000-0000-0000-0000-000000000001'

let t: Awaited<ReturnType<typeof createTestDb>>

beforeEach(async () => {
  t = await createTestDb()
  await t.createUser(A, 'alpha')
  await t.createUser(B, 'bravo')
})

const notificationsOf = (user: string) =>
  t.as<{ kind: string; payload: Record<string, string> }>({ user }, 'select kind, payload from public.notifications order by id')

describe('notificaciones automáticas', () => {
  it('pedir amistad avisa al destinatario, con quién la pide', async () => {
    await t.as({ user: A }, 'insert into public.friendships (requester_id, addressee_id) values ($1, $2)', [A, B])
    expect(await notificationsOf(B)).toEqual([{ kind: 'friend_request', payload: { from: A, username: 'alpha' } }])
    expect(await notificationsOf(A)).toEqual([])
  })

  it('aceptarla avisa a quien la pidió; rechazarla no avisa a nadie', async () => {
    await t.as({ user: A }, 'insert into public.friendships (requester_id, addressee_id) values ($1, $2)', [A, B])
    await t.as({ user: B }, `update public.friendships set status = 'accepted' where requester_id = $1`, [A])
    expect(await notificationsOf(A)).toEqual([{ kind: 'friend_accepted', payload: { from: B, username: 'bravo' } }])

    await t.createUser('00000000-0000-0000-0000-00000000000c', 'charlie')
    await t.as({ user: '00000000-0000-0000-0000-00000000000c' }, 'insert into public.friendships (requester_id, addressee_id) values ($1, $2)', ['00000000-0000-0000-0000-00000000000c', A])
    await t.as({ user: A }, `update public.friendships set status = 'declined' where requester_id = $1`, ['00000000-0000-0000-0000-00000000000c'])
    expect((await notificationsOf('00000000-0000-0000-0000-00000000000c')).map((n) => n.kind)).toEqual([])
  })

  it('invitar a una lista avisa al invitado con el nombre de la lista', async () => {
    await t.db.query(`insert into public.friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [A, B])
    await t.db.query(`insert into public.game_lists (id, owner_id, name) values ($1, $2, 'Pendientes')`, [LIST, A])
    await t.as({ user: A }, `insert into public.game_list_members (list_id, user_id, role) values ($1, $2, 'editor')`, [LIST, B])
    expect(await notificationsOf(B)).toEqual([
      { kind: 'list_invite', payload: { from: A, username: 'alpha', list_id: LIST, list_name: 'Pendientes', role: 'editor' } },
    ])
  })

  it('cada uno solo ve y marca como leídas las suyas', async () => {
    await t.as({ user: A }, 'insert into public.friendships (requester_id, addressee_id) values ($1, $2)', [A, B])
    expect(await t.as({ user: A }, 'update public.notifications set read_at = now() returning 1')).toHaveLength(0)
    expect(await t.as({ user: B }, 'update public.notifications set read_at = now() returning 1')).toHaveLength(1)
  })

  it('nadie puede crear notificaciones a mano para otro', async () => {
    await expect(
      t.as({ user: A }, `insert into public.notifications (user_id, kind) values ($1, 'friend_request')`, [B]),
    ).rejects.toThrow(/row-level security/)
  })

  it('el usuario solo puede cambiar read_at', async () => {
    await t.as({ user: A }, 'insert into public.friendships (requester_id, addressee_id) values ($1, $2)', [A, B])
    await expect(t.as({ user: B }, `update public.notifications set kind = 'x'`)).rejects.toThrow(/permission denied/)
  })
})
