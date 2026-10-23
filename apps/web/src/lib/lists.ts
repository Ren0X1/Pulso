import type { PrivacyLevel } from '@pulso/core'
import type { CatalogGame } from './library.ts'
import { supabase } from './supabase.ts'

export interface GameList {
  id: string
  owner_id: string
  name: string
  description: string
  visibility: PrivacyLevel
  created_at: string
  items: { count: number }[]
}

export interface ListItem {
  game_id: number
  position: number
  game: CatalogGame
}

export interface ShareCode {
  code: string
  revoked: boolean
  created_at: string
}

export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`

export type RedeemError = 'invalid_code' | 'own_list' | 'unknown'

export const REDEEM_ERRORS: Record<RedeemError, string> = {
  invalid_code: 'Ese código no existe, ha caducado o lo han revocado.',
  own_list: 'Ese código es de una lista tuya.',
  unknown: 'No se pudo cargar el código. Inténtalo de nuevo.',
}

export function redeemErrorKey(message: string): RedeemError {
  return message.includes('invalid_code') ? 'invalid_code' : message.includes('own_list') ? 'own_list' : 'unknown'
}

const LIST = 'id, owner_id, name, description, visibility, created_at, items:game_list_items(count)'

export async function loadLists(ownerId: string): Promise<GameList[]> {
  const { data, error } = await supabase!
    .from('game_lists')
    .select(LIST)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as GameList[]
}

export async function loadList(id: string): Promise<GameList | null> {
  const { data } = await supabase!.from('game_lists').select(LIST).eq('id', id).maybeSingle()
  return (data as GameList | null) ?? null
}

export async function loadListItems(id: string): Promise<ListItem[]> {
  const { data, error } = await supabase!
    .from('game_list_items')
    .select('game_id, position, game:games!inner(id, name, slug, summary, release_date, cover_url, genres, platforms)')
    .eq('list_id', id)
    .order('position')
  if (error) throw error
  return data as unknown as ListItem[]
}

export async function createList(ownerId: string, name: string): Promise<string> {
  const { data, error } = await supabase!.from('game_lists').insert({ owner_id: ownerId, name }).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function updateList(id: string, patch: Partial<Pick<GameList, 'name' | 'description' | 'visibility'>>) {
  const { error } = await supabase!.from('game_lists').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteList(id: string) {
  const { error } = await supabase!.from('game_lists').delete().eq('id', id)
  if (error) throw error
}

export async function addToList(listId: string, gameId: number, position: number) {
  const { error } = await supabase!.from('game_list_items').insert({ list_id: listId, game_id: gameId, position })
  if (error && error.code !== '23505') throw error
}

export async function removeFromList(listId: string, gameId: number) {
  const { error } = await supabase!.from('game_list_items').delete().eq('list_id', listId).eq('game_id', gameId)
  if (error) throw error
}

export async function loadCodes(listId: string): Promise<ShareCode[]> {
  const { data } = await supabase!
    .from('list_share_codes')
    .select('code, revoked, created_at')
    .eq('list_id', listId)
    .eq('revoked', false)
    .order('created_at', { ascending: false })
  return (data as ShareCode[] | null) ?? []
}

export async function createShareCode(listId: string): Promise<string> {
  const { data, error } = await supabase!.rpc('create_share_code', { list: listId })
  if (error) throw error
  return data as string
}

export async function revokeCode(code: string) {
  const { error } = await supabase!.from('list_share_codes').update({ revoked: true }).eq('code', code)
  if (error) throw error
}

export async function redeemCode(code: string): Promise<{ id: string } | { error: RedeemError }> {
  const { data, error } = await supabase!.rpc('redeem_share_code', { code })
  if (error) return { error: redeemErrorKey(error.message) }
  return { id: data as string }
}

export type ListRole = 'viewer' | 'editor'

export const ROLE_LABELS: Record<ListRole, string> = {
  viewer: 'Puede ver',
  editor: 'Puede editar',
}

export interface ListMember {
  user_id: string
  role: ListRole
  player: { id: string; username: string; avatar_url: string | null }
}

export interface SharedList {
  role: ListRole
  list: GameList & { owner: { username: string } }
}

export async function loadMembers(listId: string): Promise<ListMember[]> {
  const { data, error } = await supabase!
    .from('game_list_members')
    .select('user_id, role, player:profiles!game_list_members_user_id_fkey(id, username, avatar_url)')
    .eq('list_id', listId)
    .order('added_at')
  if (error) throw error
  return data as unknown as ListMember[]
}

export async function addMember(listId: string, userId: string, role: ListRole) {
  const { error } = await supabase!.from('game_list_members').insert({ list_id: listId, user_id: userId, role })
  if (error) throw error
}

export async function setMemberRole(listId: string, userId: string, role: ListRole) {
  const { error } = await supabase!.from('game_list_members').update({ role }).eq('list_id', listId).eq('user_id', userId)
  if (error) throw error
}

/** Expulsar a alguien (el dueño) o salir de una lista compartida (el propio miembro). */
export async function removeMember(listId: string, userId: string) {
  const { error } = await supabase!.from('game_list_members').delete().eq('list_id', listId).eq('user_id', userId)
  if (error) throw error
}

export async function loadSharedWithMe(me: string): Promise<SharedList[]> {
  const { data, error } = await supabase!
    .from('game_list_members')
    .select(`role, list:game_lists!inner(${LIST}, owner:profiles!game_lists_owner_id_fkey(username))`)
    .eq('user_id', me)
    .order('added_at', { ascending: false })
  if (error) throw error
  return data as unknown as SharedList[]
}

export async function myRole(listId: string, me: string): Promise<ListRole | null> {
  const { data } = await supabase!.from('game_list_members').select('role').eq('list_id', listId).eq('user_id', me).maybeSingle()
  return (data as { role: ListRole } | null)?.role ?? null
}
