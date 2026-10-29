import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { latestReleaseAssets, launcherDownload, shouldOfferLauncher, type LauncherDownload } from '../lib/download.ts'
import { isDesktop } from '../lib/platform.ts'

/** Al pie de la barra lateral, solo en la web desde un ordenador: el instalador para su sistema. */
export function DownloadLauncher() {
  const [download, setDownload] = useState<LauncherDownload | null>(null)

  useEffect(() => {
    const offer = shouldOfferLauncher({
      inLauncher: isDesktop(),
      ua: navigator.userAgent,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    })
    if (!offer) return
    void latestReleaseAssets()
      .catch(() => [])
      .then((assets) => setDownload(launcherDownload(navigator.userAgent, assets)))
  }, [])

  if (!download) return null
  const [primary, ...rest] = download.files
  return (
    <div className="download-launcher">
      <p className="download-title">Pulso para {download.os}</p>
      <p className="muted download-text">Juega desde Pulso, detecta tus partidas y muéstralas en Discord.</p>
      <a className="p-button download-button" data-variant="primary" href={primary!.url}>
        <Download size={14} strokeWidth={2} aria-hidden="true" />
        {primary!.label}
      </a>
      {rest.map((f) => (
        <a key={f.url} className="download-alt" href={f.url}>
          o {f.label}
        </a>
      ))}
    </div>
  )
}
