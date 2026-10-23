import { useEffect, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { Button } from '@pulso/ui'

/** Solo en el launcher: avisa si hay una versión nueva en GitHub Releases (firmada) y la instala. */
export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // Sin conexión o sin releases todavía: simplemente no hay aviso.
    void check().then(setUpdate, () => setUpdate(null))
  }, [])

  if (!update) return null

  async function install() {
    let total = 0
    let done = 0
    setFailed(false)
    setProgress(0)
    try {
      await update!.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0
        if (event.event === 'Progress') {
          done += event.data.chunkLength
          setProgress(total ? Math.round((done / total) * 100) : null)
        }
      })
      await relaunch()
    } catch {
      setFailed(true)
      setProgress(null)
    }
  }

  return (
    <div className="update-banner" role="status">
      <span>
        Hay una versión nueva de Pulso (<span className="num">{update.version}</span>).
        {failed && ' No se pudo instalar; inténtalo de nuevo.'}
      </span>
      <Button busy={progress !== null} onClick={() => void install()}>
        {progress !== null ? `Descargando… ${progress} %` : 'Actualizar y reiniciar'}
      </Button>
    </div>
  )
}
