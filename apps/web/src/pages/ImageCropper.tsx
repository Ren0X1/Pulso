import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'
import { Button } from '@pulso/ui'
import { clampView, coverScale, cropRect, MAX_ZOOM, type CropView } from '../lib/crop.ts'
import type { Crop, ProfileImageKind } from '../lib/profile.ts'
import { Dialog } from './Dialog.tsx'

/** Tamaño del marco en pantalla: el avatar, cuadrado y redondo; el banner, 3:1. */
const FRAMES: Record<ProfileImageKind, { w: number; h: number }> = {
  avatar: { w: 280, h: 280 },
  banner: { w: 600, h: 200 },
}

/**
 * Encuadrar una imagen antes de subirla: se arrastra para moverla y se amplía con el deslizador o la rueda
 * (con las flechas del teclado también se mueve). Lo que queda dentro del marco es lo que se guarda.
 */
export function ImageCropper({
  file,
  kind,
  onCancel,
  onConfirm,
}: {
  file: File
  kind: ProfileImageKind
  onCancel: () => void
  onConfirm: (crop: Crop) => void
}) {
  // En un móvil el marco se encoge para caber, con la misma proporción.
  const [frame] = useState(() => {
    const max = FRAMES[kind]
    const w = Math.min(max.w, Math.max(200, window.innerWidth - 80))
    return { w, h: Math.round((w * max.h) / max.w) }
  })
  const [url] = useState(() => URL.createObjectURL(file))
  const [view, setView] = useState<CropView | null>(null)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)

  useEffect(() => () => URL.revokeObjectURL(url), [url])

  const update = (next: Partial<CropView>) => setView((v) => (v ? clampView({ ...v, ...next }) : v))

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId || !view) return
    drag.current = { id: d.id, x: e.clientX, y: e.clientY }
    update({ x: view.x + e.clientX - d.x, y: view.y + e.clientY - d.y })
  }
  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (view) update({ zoom: view.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) })
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!view) return
    const step = e.shiftKey ? 40 : 10
    const moves: Record<string, Partial<CropView>> = {
      ArrowLeft: { x: view.x - step },
      ArrowRight: { x: view.x + step },
      ArrowUp: { y: view.y - step },
      ArrowDown: { y: view.y + step },
      '+': { zoom: view.zoom * 1.1 },
      '-': { zoom: view.zoom / 1.1 },
    }
    if (moves[e.key]) {
      e.preventDefault()
      update(moves[e.key]!)
    }
  }

  const scale = view ? coverScale(view) * view.zoom : 1
  const title = kind === 'avatar' ? 'Encuadra tu foto de perfil' : 'Encuadra tu banner'

  return (
    <Dialog open title={title} onClose={onCancel} wide={kind === 'banner'}>
      <div className="cropper">
        <div
          className="cropper-frame"
          data-kind={kind}
          style={{ width: frame.w, height: frame.h }}
          tabIndex={0}
          role="application"
          aria-label="Arrastra la imagen para encuadrarla; flechas para moverla, + y − para ampliar"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
        >
          <img
            src={url}
            alt=""
            draggable={false}
            onLoad={(e) =>
              setView({ imgW: e.currentTarget.naturalWidth, imgH: e.currentTarget.naturalHeight, frameW: frame.w, frameH: frame.h, zoom: 1, x: 0, y: 0 })
            }
            style={
              view
                ? {
                    width: view.imgW * scale,
                    height: view.imgH * scale,
                    transform: `translate(${(frame.w - view.imgW * scale) / 2 + view.x}px, ${(frame.h - view.imgH * scale) / 2 + view.y}px)`,
                  }
                : { opacity: 0 }
            }
          />
        </div>
        <label className="cropper-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view?.zoom ?? 1}
            disabled={!view}
            onChange={(e) => update({ zoom: Number(e.target.value) })}
          />
        </label>
        <p className="muted cropper-hint">Arrastra para mover la imagen. Lo que ves dentro del marco es lo que se guarda.</p>
        <div className="row-actions">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button disabled={!view} onClick={() => view && onConfirm(cropRect(view))}>
            Guardar
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
