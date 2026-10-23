import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { ErrorScreen } from './ErrorScreen.tsx'

function Broken(): never {
  throw new Error('fallo de prueba')
}

describe('ErrorScreen', () => {
  it('si una pantalla falla, se ve un mensaje y cómo salir, no una página en blanco', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = createMemoryRouter([{ path: '/', element: <Broken />, errorElement: <ErrorScreen /> }])
    render(<RouterProvider router={router} />)
    expect(await screen.findByRole('heading', { name: 'Algo ha fallado' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
  })
})
