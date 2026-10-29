// Botón "Descargar el launcher": solo en la web desde un ordenador, con el instalador de la última release.

export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

export interface LauncherDownload {
  os: 'Windows' | 'Linux'
  files: { label: string; url: string }[]
}

const MOBILE = /Android|iPhone|iPad|iPod|Mobile/i

export function shouldOfferLauncher({ inLauncher, ua, coarsePointer }: { inLauncher: boolean; ua: string; coarsePointer: boolean }) {
  // Pantalla táctil como único puntero = móvil o tablet, aunque el navegador diga "Linux".
  return !inLauncher && !MOBILE.test(ua) && !coarsePointer
}

const RELEASES_PAGE = 'https://github.com/Ren0X1/Pulso/releases/latest'

export function launcherDownload(ua: string, assets: ReleaseAsset[]): LauncherDownload | null {
  const find = (re: RegExp) => assets.find((a) => re.test(a.name))?.browser_download_url
  // Si la API de GitHub no contesta (límite de peticiones) el botón sigue ahí, con la página de la release.
  const fallback = [{ label: 'Descargar', url: RELEASES_PAGE }]
  if (/Windows/i.test(ua)) {
    const exe = find(/-setup\.exe$/)
    return { os: 'Windows', files: exe ? [{ label: 'Descargar', url: exe }] : fallback }
  }
  if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) {
    const appImage = find(/\.AppImage$/)
    const deb = find(/\.deb$/)
    const files = [
      ...(appImage ? [{ label: 'Descargar AppImage', url: appImage }] : []),
      ...(deb ? [{ label: '.deb', url: deb }] : []),
    ]
    return { os: 'Linux', files: files.length ? files : fallback }
  }
  return null
}

const CACHE_KEY = 'pulso.latest-release'

/** Archivos de la última release de GitHub (API pública; se guarda en la sesión para no repetir la consulta). */
export async function latestReleaseAssets(): Promise<ReleaseAsset[]> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) return JSON.parse(cached) as ReleaseAsset[]
  } catch {
    // Sin sessionStorage (modo privado estricto): se consulta sin caché.
  }
  const res = await fetch('https://api.github.com/repos/Ren0X1/Pulso/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) return []
  const assets = ((await res.json()) as { assets?: ReleaseAsset[] }).assets ?? []
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(assets))
  } catch {
    // Sin caché.
  }
  return assets
}
