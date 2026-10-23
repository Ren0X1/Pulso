import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { Cover, coverFallback } from './Cover.tsx'

const STEAM = 'https://cdn.cloudflare.steamstatic.com/steam/apps/42700/library_600x900.jpg'

describe('coverFallback', () => {
  it('pasa de la portada vertical de Steam a la cabecera', () => {
    expect(coverFallback(STEAM)).toBe('https://cdn.cloudflare.steamstatic.com/steam/apps/42700/header.jpg')
  })

  it('después de la cabecera no hay más opciones', () => {
    expect(coverFallback('https://cdn.cloudflare.steamstatic.com/steam/apps/42700/header.jpg')).toBeNull()
  })
})

describe('Cover', () => {
  it('si fallan las dos imágenes, muestra el nombre del juego', () => {
    const { container } = render(<Cover game={{ name: 'Call of Duty: Black Ops', cover_url: STEAM }} />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')!.getAttribute('src')).toContain('/header.jpg')
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('Call of Duty: Black Ops')
  })
})
