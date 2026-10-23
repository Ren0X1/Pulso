import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './harness.ts'

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'

let t: Awaited<ReturnType<typeof createTestDb>>

beforeEach(async () => {
  t = await createTestDb()
  await t.createUser(A, 'alpha')
  await t.createUser(B, 'bravo')
  await t.db.exec(`
    insert into public.games (id, slug, name) overriding system value values (1, 'steam-400', 'Portal');
    insert into public.achievements (id, game_id, source, api_name, name) overriding system value
      values (1, 1, 'steam', 'A', 'Uno'), (2, 1, 'steam', 'B', 'Dos'), (3, 1, 'steam', 'C', 'Tres'), (4, 1, 'steam', 'D', 'Cuatro');
  `)
  await t.db.query(`insert into public.user_games (user_id, game_id, source) values ($1, 1, 'steam')`, [A])
  await t.db.query(`insert into public.user_achievements (user_id, achievement_id) values ($1, 1), ($1, 2), ($1, 3)`, [A])
})

const progressOfA = (viewer: string) =>
  t.as<{ game_id: number; unlocked: number; total: number }>({ user: viewer }, 'select game_id, unlocked, total from public.achievement_progress where user_id = $1', [A])

describe('achievement_progress', () => {
  it('cuenta conseguidos sobre el total del juego', async () => {
    expect(await progressOfA(A)).toEqual([{ game_id: 1, unlocked: 3, total: 4 }])
  })

  it('respeta la privacidad de logros del dueño', async () => {
    expect(await progressOfA(B)).toHaveLength(1)
    await t.db.query(`update public.privacy_settings set achievements = 'private' where user_id = $1`, [A])
    expect(await progressOfA(B)).toHaveLength(0)
    expect(await progressOfA(A)).toHaveLength(1)
  })

  it('el usuario no puede marcar logros como revisados', async () => {
    await expect(
      t.as({ user: A }, 'update public.user_games set achievements_synced_at = now() where user_id = $1', [A]),
    ).rejects.toThrow(/permission denied/)
  })
})
