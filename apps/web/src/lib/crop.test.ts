import { describe, expect, it } from 'vitest'
import { clampView, cropRect, type CropView } from './crop.ts'

// Una foto de 2000 × 1000 en un marco cuadrado de 300 px (el avatar).
const square: CropView = { imgW: 2000, imgH: 1000, frameW: 300, frameH: 300, zoom: 1, x: 0, y: 0 }

describe('cropRect', () => {
  it('sin tocar nada, el recorte es el centro que cubre el marco', () => {
    expect(cropRect(square)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 })
  })

  it('arrastrar la imagen a la derecha enseña su parte izquierda', () => {
    const r = cropRect({ ...square, x: 150 })
    expect(r.sx).toBe(0)
    expect(r.sw).toBe(1000)
  })

  it('con zoom x2 se ve la mitad, centrada', () => {
    expect(cropRect({ ...square, zoom: 2 })).toEqual({ sx: 750, sy: 250, sw: 500, sh: 500 })
  })

  it('el banner 3:1 recorta una franja horizontal', () => {
    const banner: CropView = { imgW: 1200, imgH: 1200, frameW: 600, frameH: 200, zoom: 1, x: 0, y: -100 }
    expect(cropRect(banner)).toEqual({ sx: 0, sy: 600, sw: 1200, sh: 400 })
  })
})

describe('clampView', () => {
  it('no deja arrastrar más allá del borde de la imagen ni salirse del zoom', () => {
    expect(clampView({ ...square, x: 9999, y: 50 })).toMatchObject({ x: 150, y: 0 })
    expect(clampView({ ...square, zoom: 10 }).zoom).toBe(4)
    expect(clampView({ ...square, zoom: 0.2 }).zoom).toBe(1)
  })
})
