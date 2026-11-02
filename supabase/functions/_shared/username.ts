// Sin dependencias: lo usan la Edge Function (Deno) y la app (vía @pulso/core).

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
// Letras (mayúsculas o minúsculas, sin acentos), números y _. Dos nombres que solo cambian en mayúsculas son el
// mismo: la base de datos los compara en minúsculas.
export const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/

function slugify(persona: string): string {
  return persona
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function fit(base: string, suffix: string): string {
  const head = base.slice(0, USERNAME_MAX - suffix.length).replace(/_$/, '')
  return head + suffix
}

/** Propone un username válido y libre a partir del nombre de Steam. */
export function suggestUsername(
  persona: string,
  steamId: string,
  isTaken: (username: string) => boolean,
): string {
  const tail = steamId.slice(-6)
  let base = slugify(persona)
  if (base === '') base = `player_${tail}`
  else if (base.length < USERNAME_MIN) base = `${base}_${tail}`

  let candidate = fit(base, '')
  for (let n = 2; isTaken(candidate); n++) candidate = fit(base, `_${n}`)
  return candidate
}
