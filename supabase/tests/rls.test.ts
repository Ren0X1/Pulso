import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './harness.ts'

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const C = '00000000-0000-0000-0000-00000000000c'

let t: Awaited<ReturnType<typeof createTestDb>>

beforeEach(async () => {
  t = await createTestDb()
  await t.createUser(A, 'alpha')
  await t.createUser(B, 'bravo')
  await t.createUser(C, 'charlie')
  await t.db.exec(`insert into public.games (id, slug, name) overriding system value values (1, 'half-life', 'Half-Life')`)
  await t.db.query(`insert into public.user_games (user_id, game_id, source) values ($1, 1, 'steam')`, [A])
})

const setLibrary = (level: string) =>
  t.db.query('update public.privacy_settings set library = $1 where user_id = $2', [level, A])

const libraryOfA = (viewer: string) =>
  t.as({ user: viewer }, 'select * from public.user_games where user_id = $1', [A])

describe('privacidad de la biblioteca', () => {
  it('el perfil nuevo trae privacidad y ajustes por defecto', async () => {
    const rows = await t.as({ user: A }, 'select library, activity from public.privacy_settings')
    expect(rows).toEqual([{ library: 'public', activity: 'friends' }])
    expect(await t.as({ user: A }, 'select user_id from public.user_settings')).toHaveLength(1)
  })

  it('privada: solo la ve su dueño', async () => {
    await setLibrary('private')
    expect(await libraryOfA(B)).toHaveLength(0)
    expect(await libraryOfA(A)).toHaveLength(1)
  })

  it('pública: la ve cualquiera, también sin sesión', async () => {
    await setLibrary('public')
    expect(await libraryOfA(B)).toHaveLength(1)
    expect(await t.as('anon', 'select * from public.user_games')).toHaveLength(1)
  })

  it('solo amigos: la ve un amigo aceptado, no una solicitud pendiente', async () => {
    await setLibrary('friends')
    await t.db.query(`insert into public.friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [B, A])
    await t.db.query(`insert into public.friendships (requester_id, addressee_id, status) values ($1, $2, 'pending')`, [C, A])
    expect(await libraryOfA(B)).toHaveLength(1)
    expect(await libraryOfA(C)).toHaveLength(0)
    expect(await t.as('anon', 'select * from public.user_games')).toHaveLength(0)
  })

  it('nadie puede escribir en la biblioteca de otro', async () => {
    await t.as({ user: B }, 'update public.user_games set favorite = true where user_id = $1', [A])
    const { rows } = await t.db.query<{ favorite: boolean }>('select favorite from public.user_games')
    expect(rows[0]?.favorite).toBe(false)
    await expect(
      t.as({ user: B }, `insert into public.user_games (user_id, game_id, source) values ($1, 1, 'manual')`, [C]),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('datos verificados de Steam', () => {
  it('un usuario no puede añadir un juego haciéndolo pasar por importado de Steam', async () => {
    await t.db.exec(`insert into public.games (id, slug, name) overriding system value values (2, 'portal', 'Portal')`)
    await expect(
      t.as({ user: B }, `insert into public.user_games (user_id, game_id, source) values ($1, 2, 'steam')`, [B]),
    ).rejects.toThrow(/row-level security/)
    await t.as({ user: B }, `insert into public.user_games (user_id, game_id, source) values ($1, 2, 'manual')`, [B])
  })

  it('un usuario no puede inventarse horas de juego', async () => {
    await expect(
      t.as({ user: A }, 'update public.user_games set playtime_minutes = 99999 where user_id = $1', [A]),
    ).rejects.toThrow(/permission denied/)
    await expect(
      t.as({ user: A }, `update public.user_games set source = 'manual' where user_id = $1`, [A]),
    ).rejects.toThrow(/permission denied/)
  })

  it('sí puede cambiar el estado, el favorito y las etiquetas de sus juegos', async () => {
    const rows = await t.as(
      { user: A },
      `update public.user_games set status = 'playing', favorite = true, tags = '{rpg}' where user_id = $1 returning 1`,
      [A],
    )
    expect(rows).toHaveLength(1)
  })
})

describe('perfiles y datos privados', () => {
  it('un usuario no puede modificar el perfil de otro', async () => {
    const updated = await t.as({ user: B }, `update public.profiles set bio = 'hackeado' where id = $1 returning id`, [A])
    expect(updated).toHaveLength(0)
  })

  it('sí puede modificar el suyo', async () => {
    const updated = await t.as({ user: A }, `update public.profiles set bio = 'hola' where id = $1 returning id`, [A])
    expect(updated).toHaveLength(1)
  })

  it('las cuentas vinculadas y los ajustes de otro no se pueden leer', async () => {
    await t.db.query(
      `insert into public.linked_accounts (user_id, platform, external_user_id) values ($1, 'steam', '76561198000000001')`,
      [A],
    )
    expect(await t.as({ user: B }, 'select * from public.linked_accounts')).toHaveLength(0)
    expect(await t.as({ user: B }, 'select * from public.user_settings where user_id = $1', [A])).toHaveLength(0)
    expect(await t.as({ user: A }, 'select * from public.linked_accounts')).toHaveLength(1)
  })

  it('los logros solo los escribe el servidor, no el usuario', async () => {
    await t.db.exec(
      `insert into public.achievements (id, game_id, source, api_name, name) overriding system value values (1, 1, 'steam', 'ACH_WIN', 'Ganar')`,
    )
    await expect(
      t.as({ user: A }, 'insert into public.user_achievements (user_id, achievement_id) values ($1, 1)', [A]),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('funciones expuestas por la API', () => {
  it('ninguna función SECURITY DEFINER vive en public (la API las publicaría como /rpc)', async () => {
    const { rows } = await t.db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef`,
    )
    expect(rows).toEqual([])
  })

  it('las funciones de public fijan su search_path', async () => {
    const { rows } = await t.db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    )
    expect(rows).toEqual([])
  })
})

describe('catálogo y restricciones', () => {
  it('el catálogo es legible por todos pero solo lo escribe el servidor', async () => {
    expect(await t.as('anon', 'select name from public.games')).toEqual([{ name: 'Half-Life' }])
    await expect(t.as('anon', `insert into public.games (slug, name) values ('x', 'X')`)).rejects.toThrow(/row-level security/)
    await expect(t.as({ user: A }, `insert into public.games (slug, name) values ('x', 'X')`)).rejects.toThrow(
      /row-level security/,
    )
    await t.as('service_role', `insert into public.games (slug, name) values ('x', 'X')`)
  })

  it('el username es único y debe cumplir el formato', async () => {
    const D = '00000000-0000-0000-0000-0000000000dd'
    await t.db.query('insert into auth.users (id) values ($1)', [D])
    await expect(t.db.query(`insert into public.profiles (id, username) values ($1, 'alpha')`, [D])).rejects.toThrow(
      /duplicate key/,
    )
    await expect(t.db.query(`insert into public.profiles (id, username) values ($1, 'Alpha')`, [D])).rejects.toThrow(
      /check constraint/,
    )
  })

  it('no se puede pedir amistad en nombre de otro ni duplicarla al revés', async () => {
    await expect(
      t.as({ user: B }, 'insert into public.friendships (requester_id, addressee_id) values ($1, $2)', [C, A]),
    ).rejects.toThrow(/row-level security/)
    await t.as({ user: B }, 'insert into public.friendships (requester_id, addressee_id) values ($1, $2)', [B, A])
    await expect(
      t.as({ user: A }, 'insert into public.friendships (requester_id, addressee_id) values ($1, $2)', [A, B]),
    ).rejects.toThrow(/duplicate key/)
  })

  it('solo el destinatario acepta una solicitud', async () => {
    await t.as({ user: B }, 'insert into public.friendships (requester_id, addressee_id) values ($1, $2)', [B, A])
    expect(await t.as({ user: B }, `update public.friendships set status = 'accepted' returning 1`)).toHaveLength(0)
    expect(await t.as({ user: A }, `update public.friendships set status = 'accepted' returning 1`)).toHaveLength(1)
  })

  it('el destinatario no puede cambiar quién envió la solicitud', async () => {
    await t.as({ user: B }, 'insert into public.friendships (requester_id, addressee_id) values ($1, $2)', [B, A])
    await expect(
      t.as({ user: A }, 'update public.friendships set requester_id = $1', [C]),
    ).rejects.toThrow(/permission denied/)
  })

  it('no se puede crear una solicitud ya aceptada', async () => {
    await expect(
      t.as({ user: B }, `insert into public.friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [B, A]),
    ).rejects.toThrow(/row-level security/)
  })
})
