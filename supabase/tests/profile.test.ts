import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './harness.ts'

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'

let t: Awaited<ReturnType<typeof createTestDb>>

beforeEach(async () => {
  t = await createTestDb()
  await t.createUser(A, 'alpha')
  await t.createUser(B, 'bravo')
})

const update = (user: string, set: string, params: unknown[] = []) =>
  t.as({ user }, `update public.profiles set ${set} where id = '${user}' returning 1`, params)

describe('enlaces externos', () => {
  it('acepta hasta 6 enlaces https con etiqueta', async () => {
    const links = JSON.stringify([
      { kind: 'twitch', url: 'https://twitch.tv/ren0x' },
      { kind: 'website', url: 'https://alejandromz.es' },
    ])
    expect(await update(A, 'links = $1::jsonb', [links])).toHaveLength(1)
  })

  it('rechaza enlaces que no son https (javascript:, http:)', async () => {
    for (const url of ['javascript:alert(1)', 'http://inseguro.com', 'ftp://x']) {
      await expect(update(A, 'links = $1::jsonb', [JSON.stringify([{ kind: 'website', url }])])).rejects.toThrow(
        /check constraint/,
      )
    }
  })

  it('rechaza más de 6 enlaces o un formato que no es una lista', async () => {
    const seven = JSON.stringify(Array.from({ length: 7 }, (_, i) => ({ kind: 'website', url: `https://x${i}.com` })))
    await expect(update(A, 'links = $1::jsonb', [seven])).rejects.toThrow(/check constraint/)
    await expect(update(A, `links = '{"a": 1}'::jsonb`)).rejects.toThrow(/check constraint/)
  })
})

describe('avatar, banner y favoritos', () => {
  it('avatar y banner solo pueden ser direcciones https', async () => {
    expect(await update(A, `avatar_url = 'https://x.supabase.co/a.webp', banner_url = 'https://x.supabase.co/b.webp'`)).toHaveLength(1)
    await expect(update(A, `banner_url = 'javascript:alert(1)'`)).rejects.toThrow(/check constraint/)
  })

  it('como mucho 6 juegos favoritos', async () => {
    expect(await update(A, `favorite_game_ids = '{1,2,3,4,5,6}'`)).toHaveLength(1)
    await expect(update(A, `favorite_game_ids = '{1,2,3,4,5,6,7}'`)).rejects.toThrow(/check constraint/)
  })
})

describe('imágenes del perfil (Storage)', () => {
  const upload = (user: string, name: string) =>
    t.as({ user }, `insert into storage.objects (bucket_id, name) values ('profile-media', $1)`, [name])

  it('cada uno sube a su propia carpeta', async () => {
    await upload(A, `${A}/avatar-1.webp`)
    await expect(upload(B, `${A}/avatar-2.webp`)).rejects.toThrow(/row-level security/)
  })

  it('cualquiera puede ver las imágenes; solo el dueño las borra', async () => {
    await upload(A, `${A}/banner-1.webp`)
    expect(await t.as('anon', `select name from storage.objects where bucket_id = 'profile-media'`)).toHaveLength(1)
    expect(await t.as({ user: B }, 'delete from storage.objects returning 1')).toHaveLength(0)
    expect(await t.as({ user: A }, 'delete from storage.objects returning 1')).toHaveLength(1)
  })

  it('el bucket limita tamaño y tipos de imagen', async () => {
    const { rows } = await t.db.query<{ file_size_limit: number; allowed_mime_types: string[] }>(
      `select file_size_limit, allowed_mime_types from storage.buckets where id = 'profile-media'`,
    )
    expect(rows[0]?.file_size_limit).toBe(2 * 1024 * 1024)
    expect(rows[0]?.allowed_mime_types).toEqual(['image/webp', 'image/jpeg', 'image/png'])
  })
})

describe('logros por mes', () => {
  beforeEach(async () => {
    await t.db.exec(`
      insert into public.games (id, slug, name) overriding system value values (1, 'g', 'G');
      insert into public.achievements (id, game_id, source, api_name, name) overriding system value
        values (1, 1, 'steam', 'a', 'A'), (2, 1, 'steam', 'b', 'B'), (3, 1, 'steam', 'c', 'C');
    `)
    await t.db.query(
      `insert into public.user_achievements (user_id, achievement_id, unlocked_at)
       values ($1, 1, '2026-01-10'), ($1, 2, '2026-01-20'), ($1, 3, '2026-03-05')`,
      [A],
    )
  })

  it('agrupa por mes', async () => {
    const rows = await t.as<{ month: string; unlocked: number }>(
      { user: A },
      `select to_char(month, 'YYYY-MM') as month, unlocked from public.achievements_by_month where user_id = $1 order by 1`,
      [A],
    )
    expect(rows).toEqual([
      { month: '2026-01', unlocked: 2 },
      { month: '2026-03', unlocked: 1 },
    ])
  })

  it('respeta la privacidad de logros', async () => {
    await t.db.query(`update public.privacy_settings set achievements = 'private' where user_id = $1`, [A])
    expect(await t.as({ user: B }, 'select * from public.achievements_by_month where user_id = $1', [A])).toHaveLength(0)
  })
})
