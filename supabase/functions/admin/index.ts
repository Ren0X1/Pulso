// Edge Function: panel de administración. Solo para quien está en public.app_admins (se comprueba en cada llamada).
//   POST { action: 'overview' }                → resumen de la app, usuarios y últimas sincronizaciones
//   POST { action: 'sync', user }              → fuerza una sincronización completa de ese usuario (sin esperar)
//   POST { action: 'cancel', run }             → para una sincronización en marcha
//   POST { action: 'grant' | 'revoke', user }  → da o quita acceso al panel (nadie se quita a sí mismo)
// Errores: 401 not_signed_in · 403 forbidden · 400 bad_request · 404 not_found

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const RUN_FIELDS = 'id, user_id, status, error, started_at, finished_at, updated_at, games, added, total, checked, unlocked, hidden_games, forced_by'

async function count(db: SupabaseClient, table: string, filter?: (q: any) => any) {
  let query = db.from(table).select('*', { count: 'exact', head: true })
  if (filter) query = filter(query)
  const { count } = await query
  return count ?? 0
}

async function overview(db: SupabaseClient) {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const [users, runs, stats] = await Promise.all([
    db.from('admin_user_stats').select('*').order('created_at', { ascending: true }),
    db.from('sync_runs').select(RUN_FIELDS).order('started_at', { ascending: false }).limit(300),
    Promise.all([
      count(db, 'profiles'),
      count(db, 'games'),
      count(db, 'user_games'),
      count(db, 'user_achievements'),
      count(db, 'game_lists'),
      count(db, 'sync_runs', (q) => q.eq('status', 'running')),
      count(db, 'sync_runs', (q) => q.eq('status', 'error').gte('started_at', dayAgo)),
    ]),
  ])
  if (users.error || runs.error) throw new Error('overview')
  const latest = new Map<string, unknown>()
  for (const run of runs.data) if (!latest.has(run.user_id)) latest.set(run.user_id, run)
  const names = new Map(users.data.map((u) => [u.id as string, u.username as string]))
  const [profiles, catalog, library, achievements, lists, running, errors] = stats
  return {
    stats: { users: profiles, catalog, library, achievements, lists, running, errors },
    users: users.data.map((u) => ({ ...u, run: latest.get(u.id) ?? null })),
    runs: runs.data.slice(0, 40).map((r) => ({ ...r, username: names.get(r.user_id) ?? null })),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? ''
  const { data: auth } = await db.auth.getUser(jwt)
  const me = auth.user
  if (!me) return json({ error: 'not_signed_in' }, 401)
  const { data: isAdmin } = await db.from('app_admins').select('user_id').eq('user_id', me.id).maybeSingle()
  if (!isAdmin) return json({ error: 'forbidden' }, 403)

  const body = (await req.json().catch(() => ({}))) as { action?: unknown; user?: unknown; run?: unknown }
  const user = typeof body.user === 'string' ? body.user : null

  try {
    switch (body.action) {
      case 'overview':
        return json(await overview(db))

      case 'sync': {
        if (!user) return json({ error: 'bad_request' }, 400)
        // La sincronización la hace steam-sync, igual que cuando la pide el propio usuario, pero sin esperar.
        const res = await fetch(`${SUPABASE_URL}/functions/v1/steam-sync`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            'x-pulso-internal': SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ user, forcedBy: me.id }),
        })
        return json(await res.json().catch(() => ({ error: 'server_error' })), res.status)
      }

      case 'cancel': {
        if (typeof body.run !== 'number') return json({ error: 'bad_request' }, 400)
        const { data } = await db
          .from('sync_runs')
          .update({ status: 'error', error: 'cancelled', finished_at: new Date().toISOString() })
          .eq('id', body.run)
          .eq('status', 'running')
          .select('id')
        return data?.length ? json({ ok: true }) : json({ error: 'not_found' }, 404)
      }

      case 'grant': {
        if (!user) return json({ error: 'bad_request' }, 400)
        const { error } = await db.from('app_admins').upsert({ user_id: user, granted_by: me.id }, { onConflict: 'user_id', ignoreDuplicates: true })
        return error ? json({ error: 'not_found' }, 404) : json({ ok: true })
      }

      case 'revoke': {
        if (!user) return json({ error: 'bad_request' }, 400)
        // Así nunca se queda la app sin nadie que la administre.
        if (user === me.id) return json({ error: 'cannot_revoke_self' }, 400)
        await db.from('app_admins').delete().eq('user_id', user)
        return json({ ok: true })
      }

      default:
        return json({ error: 'bad_request' }, 400)
    }
  } catch (err) {
    console.error('admin', err instanceof Error ? err.message : '')
    return json({ error: 'server_error' }, 500)
  }
})
