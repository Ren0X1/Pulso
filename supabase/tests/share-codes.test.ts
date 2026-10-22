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
  await t.db.exec(`insert into public.games (id, slug, name) overriding system value values (1, 'portal', 'Portal'), (2, 'celeste', 'Celeste')`)
  await t.db.query(`insert into public.game_lists (id, owner_id, name, description) values ($1, $2, 'Pendientes de A', 'Para este invierno')`, [LIST, A])
  await t.db.query(`insert into public.game_list_items (list_id, game_id, position) values ($1, 1, 0), ($1, 2, 1)`, [LIST])
})

const createCode = (user: string, list = LIST) =>
  t.as<{ code: string }>({ user }, 'select public.create_share_code($1) as code', [list]).then((r) => r[0]!.code)

const redeem = (user: string, code: string) =>
  t.as<{ id: string }>({ user }, 'select public.redeem_share_code($1) as id', [code]).then((r) => r[0]!.id)

describe('crear código', () => {
  it('el dueño obtiene un código de 10 caracteres base32', async () => {
    expect(await createCode(A)).toMatch(/^[A-Z2-7]{10}$/)
  })

  it('cada código es distinto', async () => {
    expect(await createCode(A)).not.toBe(await createCode(A))
  })

  it('nadie más puede crear códigos de una lista ajena', async () => {
    await expect(createCode(B)).rejects.toThrow(/not_owner/)
  })

  it('sin sesión no se puede', async () => {
    await expect(t.as('anon', 'select public.create_share_code($1)', [LIST])).rejects.toThrow(/permission denied/)
  })
})

describe('canjear código', () => {
  it('copia la lista con sus juegos como privada del que canjea', async () => {
    const code = await createCode(A)
    const copy = await redeem(B, code)
    const [list] = await t.as({ user: B }, 'select owner_id, name, description, visibility from public.game_lists where id = $1', [copy])
    expect(list).toEqual({ owner_id: B, name: 'Pendientes de A', description: 'Para este invierno', visibility: 'private' })
    const items = await t.as({ user: B }, 'select game_id, position from public.game_list_items where list_id = $1 order by position', [copy])
    expect(items).toEqual([{ game_id: 1, position: 0 }, { game_id: 2, position: 1 }])
  })

  it('acepta el código con guiones, espacios y en minúsculas', async () => {
    const code = await createCode(A)
    const pretty = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`.toLowerCase()
    expect(await redeem(B, ` ${pretty} `)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('la copia es independiente del original', async () => {
    const copy = await redeem(B, await createCode(A))
    await t.as({ user: B }, 'delete from public.game_list_items where list_id = $1 and game_id = 1', [copy])
    const original = await t.db.query('select * from public.game_list_items where list_id = $1', [LIST])
    expect(original.rows).toHaveLength(2)
  })

  it('un código inexistente falla sin copiar nada', async () => {
    await expect(redeem(B, 'AAAAAAAAAA')).rejects.toThrow(/invalid_code/)
    expect(await t.as({ user: B }, 'select * from public.game_lists where owner_id = $1', [B])).toHaveLength(0)
  })

  it('un código revocado o caducado ya no vale', async () => {
    const revoked = await createCode(A)
    await t.as({ user: A }, 'update public.list_share_codes set revoked = true where code = $1', [revoked])
    await expect(redeem(B, revoked)).rejects.toThrow(/invalid_code/)

    const expired = await createCode(A)
    await t.db.query(`update public.list_share_codes set expires_at = now() - interval '1 minute' where code = $1`, [expired])
    await expect(redeem(B, expired)).rejects.toThrow(/invalid_code/)
  })

  it('no se puede canjear un código de una lista propia', async () => {
    await expect(redeem(A, await createCode(A))).rejects.toThrow(/own_list/)
  })

  it('sin sesión no se puede canjear', async () => {
    const code = await createCode(A)
    await expect(t.as('anon', 'select public.redeem_share_code($1)', [code])).rejects.toThrow(/permission denied/)
  })
})
