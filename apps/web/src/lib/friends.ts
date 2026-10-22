import { supabase } from './supabase.ts'

export interface FriendshipRow {
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined'
}

export type Relation = 'self' | 'none' | 'outgoing' | 'incoming' | 'friends'

/** Qué relación tengo con otro jugador según las filas de amistad que puedo ver. */
export function friendshipWith(me: string, other: string, rows: FriendshipRow[]): Relation {
  if (me === other) return 'self'
  const row = rows.find(
    (r) => (r.requester_id === me && r.addressee_id === other) || (r.requester_id === other && r.addressee_id === me),
  )
  if (!row || row.status === 'declined') return 'none'
  if (row.status === 'accepted') return 'friends'
  return row.requester_id === me ? 'outgoing' : 'incoming'
}

export interface PlayerSummary {
  id: string
  username: string
  avatar_url: string | null
}

export interface FriendshipWithPlayers extends FriendshipRow {
  created_at: string
  requester: PlayerSummary
  addressee: PlayerSummary
}

const PLAYER = 'id, username, avatar_url'

export async function loadMyFriendships(me: string): Promise<FriendshipWithPlayers[]> {
  const { data, error } = await supabase!
    .from('friendships')
    .select(
      `requester_id, addressee_id, status, created_at,
       requester:profiles!friendships_requester_id_fkey(${PLAYER}),
       addressee:profiles!friendships_addressee_id_fkey(${PLAYER})`,
    )
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`)
    .neq('status', 'declined')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as unknown as FriendshipWithPlayers[]
}

export async function searchPlayers(term: string, me: string): Promise<PlayerSummary[]> {
  const clean = term.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (clean.length < 2) return []
  const { data, error } = await supabase!
    .from('profiles')
    .select(PLAYER)
    .ilike('username', `%${clean.replace(/_/g, '\\_')}%`)
    .neq('id', me)
    .order('username')
    .limit(10)
  if (error) throw error
  return data as PlayerSummary[]
}

export async function sendRequest(me: string, other: string) {
  // Una solicitud rechazada antes ocupa el par: se borra para poder pedirla otra vez.
  await supabase!
    .from('friendships')
    .delete()
    .eq('status', 'declined')
    .or(`and(requester_id.eq.${me},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${me})`)
  const { error } = await supabase!.from('friendships').insert({ requester_id: me, addressee_id: other })
  if (error) throw error
}

export async function respond(requester: string, me: string, accept: boolean) {
  const { error } = await supabase!
    .from('friendships')
    .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
    .eq('requester_id', requester)
    .eq('addressee_id', me)
  if (error) throw error
}

/** Cancela una solicitud enviada o elimina una amistad. */
export async function removeFriendship(a: string, b: string) {
  const { error } = await supabase!
    .from('friendships')
    .delete()
    .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`)
  if (error) throw error
}

export async function countIncoming(me: string): Promise<number> {
  const { count } = await supabase!
    .from('friendships')
    .select('requester_id', { count: 'exact', head: true })
    .eq('addressee_id', me)
    .eq('status', 'pending')
  return count ?? 0
}

export async function loadRelation(me: string, other: string): Promise<FriendshipRow[]> {
  const { data } = await supabase!
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .or(`and(requester_id.eq.${me},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${me})`)
  return (data as FriendshipRow[] | null) ?? []
}
