// Recorte manual del avatar y el banner: la imagen se ve dentro de un marco con la proporción final; se arrastra
// para encuadrar y se amplía con el zoom. Aquí solo las cuentas (sin DOM), con tests.

export interface CropView {
  /** Tamaño de la imagen original, en píxeles. */
  imgW: number
  imgH: number
  /** Tamaño del marco en pantalla. */
  frameW: number
  frameH: number
  /** 1 = la imagen justo cubre el marco; hasta MAX_ZOOM. */
  zoom: number
  /** Desplazamiento del centro de la imagen respecto al centro del marco, en px de pantalla. */
  x: number
  y: number
}

export const MAX_ZOOM = 4

/** Escala a la que la imagen cubre el marco entero (como object-fit: cover). */
export function coverScale(v: Pick<CropView, 'imgW' | 'imgH' | 'frameW' | 'frameH'>): number {
  return Math.max(v.frameW / v.imgW, v.frameH / v.imgH)
}

/** Ajusta el desplazamiento para que nunca quede un hueco vacío dentro del marco. */
export function clampView(v: CropView): CropView {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom))
  const scale = coverScale(v) * zoom
  const maxX = Math.max(0, (v.imgW * scale - v.frameW) / 2)
  const maxY = Math.max(0, (v.imgH * scale - v.frameH) / 2)
  const clamp = (n: number, max: number) => Math.min(max, Math.max(-max, n))
  return { ...v, zoom, x: clamp(v.x, maxX), y: clamp(v.y, maxY) }
}

/** La parte de la imagen original que se ve en el marco: lo que se guarda. */
export function cropRect(view: CropView): { sx: number; sy: number; sw: number; sh: number } {
  const v = clampView(view)
  const scale = coverScale(v) * v.zoom
  const sw = v.frameW / scale
  const sh = v.frameH / scale
  const sx = v.imgW / 2 - sw / 2 - v.x / scale
  const sy = v.imgH / 2 - sh / 2 - v.y / scale
  return { sx: Math.round(sx), sy: Math.round(sy), sw: Math.round(sw), sh: Math.round(sh) }
}
