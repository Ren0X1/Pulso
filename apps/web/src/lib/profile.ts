import { supabase } from './supabase.ts'

// ───────── Enlaces externos ─────────

export const LINK_KINDS = {
  steam: 'Steam',
  twitch: 'Twitch',
  youtube: 'YouTube',
  x: 'X',
  kick: 'Kick',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  website: 'Web',
} as const
export type LinkKind = keyof typeof LINK_KINDS

export interface ProfileLink {
  kind: LinkKind
  url: string
}

export const MAX_LINKS = 6
export const MAX_FAVORITES = 6

/** Una dirección web válida en https, o null. La base de datos rechaza cualquier otra cosa. */
export function normalizeLinkUrl(input: string): string | null {
  let text = input.trim()
  if (!text) return null
  if (/^http:\/\//i.test(text)) text = `https://${text.slice(7)}`
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`
  if (!/^https:\/\//i.test(text) || /\s/.test(text) || text.length > 200) return null
  try {
    const url = new URL(text)
    return url.hostname.includes('.') ? text : null
  } catch {
    return null
  }
}

const DOMAINS: [RegExp, LinkKind][] = [
  [/(^|\.)steamcommunity\.com$|(^|\.)steampowered\.com$/, 'steam'],
  [/(^|\.)twitch\.tv$/, 'twitch'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'youtube'],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, 'x'],
  [/(^|\.)kick\.com$/, 'kick'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
]

export function linkKindFor(url: string): LinkKind {
  const host = new URL(url).hostname.toLowerCase()
  return DOMAINS.find(([re]) => re.test(host))?.[1] ?? 'website'
}

// ───────── Imágenes: avatar cuadrado y banner 3:1 ─────────

/** Recorte centrado que llena la proporción pedida (como object-fit: cover). */
export function coverCrop(width: number, height: number, ratioW: number, ratioH: number) {
  const target = ratioW / ratioH
  if (width / height > target) {
    const sw = Math.round(height * target)
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height }
  }
  const sh = Math.round(width / target)
  return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh }
}

const SIZES = { avatar: { w: 256, h: 256 }, banner: { w: 1500, h: 500 } } as const
export type ProfileImageKind = keyof typeof SIZES

/** Recorta y reduce la imagen en el navegador y la guarda como WebP (pocos KB, cabe de sobra en el plan gratis). */
async function toWebp(file: File, kind: ProfileImageKind): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const { w, h } = SIZES[kind]
  const crop = coverCrop(bitmap.width, bitmap.height, w, h)
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(w, crop.sw)
  canvas.height = Math.round(canvas.width * (h / w))
  canvas.getContext('2d')!.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('webp'))), 'image/webp', 0.85),
  )
}

const BUCKET = 'profile-media'

/** Sube el avatar o el banner a la carpeta del usuario y lo guarda en su perfil. Borra el anterior. */
export async function uploadProfileImage(userId: string, kind: ProfileImageKind, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not_image')
  const blob = await toWebp(file, kind)
  const path = `${userId}/${kind}-${Date.now()}.webp`
  const { error } = await supabase!.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp' })
  if (error) throw error
  const url = supabase!.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  await setProfileImage(userId, kind, url)
  return url
}

/** Cambia o quita (null) el avatar o el banner, y borra del almacenamiento las versiones anteriores. */
export async function setProfileImage(userId: string, kind: ProfileImageKind, url: string | null) {
  const column = kind === 'avatar' ? 'avatar_url' : 'banner_url'
  const { error } = await supabase!.from('profiles').update({ [column]: url }).eq('id', userId)
  if (error) throw error
  const { data: files } = await supabase!.storage.from(BUCKET).list(userId)
  const keep = url?.split('/').pop()
  const old = (files ?? []).filter((f) => f.name.startsWith(`${kind}-`) && f.name !== keep).map((f) => `${userId}/${f.name}`)
  if (old.length) await supabase!.storage.from(BUCKET).remove(old)
}

export async function saveLinks(userId: string, links: ProfileLink[]) {
  const { error } = await supabase!.from('profiles').update({ links }).eq('id', userId)
  if (error) throw error
}

export async function saveFavorites(userId: string, gameIds: number[]) {
  const { error } = await supabase!.from('profiles').update({ favorite_game_ids: gameIds }).eq('id', userId)
  if (error) throw error
}
