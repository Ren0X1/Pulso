import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './harness.ts'

const ADMIN = '00000000-0000-0000-0000-0000000000a1'
const USER = '00000000-0000-0000-0000-0000000000b2'

let t: Awaited<ReturnType<typeof createTestDb>>

beforeEach(async () => {
  t = await createTestDb()
  await t.createUser(ADMIN, 'jefa')
  await t.createUser(USER, 'jugador')
  await t.db.query('insert into public.app_admins (user_id) values ($1)', [ADMIN])
})

describe('administradores', () => {
  it('cada uno sabe si es administrador; solo un administrador ve la lista entera', async () => {
    expect(await t.as({ user: USER }, 'select user_id from public.app_admins')).toEqual([])
    expect(await t.as({ user: ADMIN }, 'select user_id from public.app_admins')).toEqual([{ user_id: ADMIN }])
    expect(await t.as('anon', 'select user_id from public.app_admins').catch(() => [])).toEqual([])
  })

  it('nadie se hace administrador desde la API, ni siquiera otro administrador (eso lo hace el servidor)', async () => {
    await expect(t.as({ user: USER }, 'insert into public.app_admins (user_id) values ($1)', [USER])).rejects.toThrow(
      /row-level security/,
    )
    await expect(t.as({ user: ADMIN }, 'insert into public.app_admins (user_id) values ($1)', [USER])).rejects.toThrow(
      /row-level security/,
    )
    await t.as({ user: ADMIN }, 'delete from public.app_admins where user_id = $1', [ADMIN])
    expect(await t.db.query('select 1 from public.app_admins')).toMatchObject({ rows: [{}] })
  })

  it('el resumen del panel solo lo lee el servidor', async () => {
    await expect(t.as('anon', 'select * from public.admin_user_stats')).rejects.toThrow(/permission denied/)
    await expect(t.as({ user: ADMIN }, 'select * from public.admin_user_stats')).rejects.toThrow(/permission denied/)
    const rows = await t.as<{ username: string; is_admin: boolean; games: number }>(
      'service_role',
      'select username, is_admin, games from public.admin_user_stats order by username',
    )
    expect(rows).toEqual([
      { username: 'jefa', is_admin: true, games: 0 },
      { username: 'jugador', is_admin: false, games: 0 },
    ])
  })
})

describe('progreso de la sincronización', () => {
  it('cada cambio de una sincronización avisa al canal de su usuario', async () => {
    await t.db.exec('delete from realtime.messages')
    await t.db.query(`insert into public.sync_runs (user_id, platform) values ($1, 'steam')`, [USER])
    await t.db.query('update public.sync_runs set checked = 30, total = 70')
    const { rows } = await t.db.query<{ topic: string }>('select topic from realtime.messages')
    expect(rows.map((r) => r.topic)).toEqual([`user:${USER}`, `user:${USER}`])
  })

  it('el usuario ve el progreso de sus sincronizaciones, también las forzadas por un administrador', async () => {
    await t.db.query(`insert into public.sync_runs (user_id, platform, forced_by, checked) values ($1, 'steam', $2, 12)`, [USER, ADMIN])
    expect(await t.as({ user: USER }, 'select checked, forced_by from public.sync_runs')).toEqual([{ checked: 12, forced_by: ADMIN }])
    expect(await t.as({ user: ADMIN }, 'select checked from public.sync_runs')).toEqual([])
  })
})
