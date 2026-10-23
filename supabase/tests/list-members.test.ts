import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './harness.ts'

const OWNER = '00000000-0000-0000-0000-00000000000a'
const EDITOR = '00000000-0000-0000-0000-00000000000b'
const VIEWER = '00000000-0000-0000-0000-00000000000c'
const STRANGER = '00000000-0000-0000-0000-00000000000d'
const LIST = '10000000-0000-0000-0000-000000000001'

let t: Awaited<ReturnType<typeof createTestDb>>

const befriend = (a: string, b: string) =>
  t.db.query(`insert into public.friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [a, b])

beforeEach(async () => {
  t = await createTestDb()
  for (const [id, name] of [[OWNER, 'owner'], [EDITOR, 'editor'], [VIEWER, 'viewer'], [STRANGER, 'stranger']] as const) {
    await t.createUser(id, name)
  }
  await befriend(OWNER, EDITOR)
  await befriend(VIEWER, OWNER)
  await t.db.exec(`insert into public.games (id, slug, name) overriding system value values (1, 'portal', 'Portal'), (2, 'celeste', 'Celeste')`)
  await t.db.query(`insert into public.game_lists (id, owner_id, name, visibility) values ($1, $2, 'Pendientes juntos', 'private')`, [LIST, OWNER])
  await t.db.query(`insert into public.game_list_items (list_id, game_id) values ($1, 1)`, [LIST])
  await t.as({ user: OWNER }, `insert into public.game_list_members (list_id, user_id, role) values ($1, $2, 'editor')`, [LIST, EDITOR])
  await t.as({ user: OWNER }, `insert into public.game_list_members (list_id, user_id, role) values ($1, $2, 'viewer')`, [LIST, VIEWER])
})

const seesList = async (user: string) => (await t.as({ user }, 'select id from public.game_lists where id = $1', [LIST])).length === 1
const items = (user: string) => t.as({ user }, 'select game_id from public.game_list_items where list_id = $1', [LIST])

describe('ver una lista privada compartida', () => {
  it('editores y lectores la ven con sus juegos; un desconocido no', async () => {
    expect(await seesList(EDITOR)).toBe(true)
    expect(await seesList(VIEWER)).toBe(true)
    expect(await items(VIEWER)).toHaveLength(1)
    expect(await seesList(STRANGER)).toBe(false)
    expect(await items(STRANGER)).toHaveLength(0)
  })
})

describe('modificar los juegos', () => {
  it('un editor puede añadir y quitar juegos', async () => {
    await t.as({ user: EDITOR }, 'insert into public.game_list_items (list_id, game_id) values ($1, 2)', [LIST])
    await t.as({ user: EDITOR }, 'delete from public.game_list_items where list_id = $1 and game_id = 1', [LIST])
    expect((await items(OWNER)).map((r) => r.game_id)).toEqual([2])
  })

  it('un lector no puede añadir ni quitar', async () => {
    await expect(
      t.as({ user: VIEWER }, 'insert into public.game_list_items (list_id, game_id) values ($1, 2)', [LIST]),
    ).rejects.toThrow(/row-level security/)
    await t.as({ user: VIEWER }, 'delete from public.game_list_items where list_id = $1', [LIST])
    expect(await items(OWNER)).toHaveLength(1)
  })

  it('un editor no puede cambiar el nombre ni la visibilidad de la lista', async () => {
    const rows = await t.as({ user: EDITOR }, `update public.game_lists set visibility = 'public' where id = $1 returning id`, [LIST])
    expect(rows).toHaveLength(0)
  })
})

describe('miembros', () => {
  it('solo se puede invitar a amigos', async () => {
    await expect(
      t.as({ user: OWNER }, `insert into public.game_list_members (list_id, user_id, role) values ($1, $2, 'viewer')`, [LIST, STRANGER]),
    ).rejects.toThrow(/row-level security/)
  })

  it('solo el dueño invita: un editor no puede meter a nadie', async () => {
    await befriend(EDITOR, STRANGER)
    await expect(
      t.as({ user: EDITOR }, `insert into public.game_list_members (list_id, user_id, role) values ($1, $2, 'editor')`, [LIST, STRANGER]),
    ).rejects.toThrow(/row-level security/)
  })

  it('un miembro no puede cambiarse el rol a sí mismo', async () => {
    const rows = await t.as({ user: VIEWER }, `update public.game_list_members set role = 'editor' where user_id = $1 returning 1`, [VIEWER])
    expect(rows).toHaveLength(0)
  })

  it('el dueño cambia roles y expulsa; cada miembro puede salirse', async () => {
    expect(await t.as({ user: OWNER }, `update public.game_list_members set role = 'editor' where user_id = $1 returning 1`, [VIEWER])).toHaveLength(1)
    await t.as({ user: EDITOR }, 'delete from public.game_list_members where user_id = $1', [EDITOR])
    expect(await seesList(EDITOR)).toBe(false)
    await t.as({ user: OWNER }, 'delete from public.game_list_members where user_id = $1', [VIEWER])
    expect(await seesList(VIEWER)).toBe(false)
  })

  it('cada uno ve los miembros de las listas en las que está, nadie más', async () => {
    expect(await t.as({ user: VIEWER }, 'select user_id from public.game_list_members where list_id = $1', [LIST])).toHaveLength(2)
    expect(await t.as({ user: STRANGER }, 'select user_id from public.game_list_members where list_id = $1', [LIST])).toHaveLength(0)
  })

  it('el dueño no se puede añadir a su propia lista', async () => {
    await expect(
      t.as({ user: OWNER }, `insert into public.game_list_members (list_id, user_id, role) values ($1, $2, 'editor')`, [LIST, OWNER]),
    ).rejects.toThrow()
  })
})
