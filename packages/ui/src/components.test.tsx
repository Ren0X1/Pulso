import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avatar, Button, Field, Logo } from './index.ts'

describe('Button', () => {
  it('es un botón normal por defecto, no envía formularios sin querer', () => {
    render(<Button>Guardar</Button>)
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAttribute('type', 'button')
  })

  it('respeta type="submit" y la variante', () => {
    render(
      <Button type="submit" variant="ghost">
        Enviar
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Enviar' })
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toHaveAttribute('data-variant', 'ghost')
  })

  it('anuncia que está trabajando y no se puede pulsar dos veces', () => {
    render(<Button busy>Entrando</Button>)
    const button = screen.getByRole('button', { name: 'Entrando' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})

describe('Field', () => {
  it('asocia la etiqueta con el campo', () => {
    render(<Field label="Nombre de usuario" defaultValue="ren0x1" />)
    expect(screen.getByLabelText('Nombre de usuario')).toHaveValue('ren0x1')
  })

  it('anuncia el error y marca el campo como inválido', () => {
    render(<Field label="Nombre de usuario" error="Mínimo 3 caracteres" />)
    const input = screen.getByLabelText('Nombre de usuario')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Mínimo 3 caracteres')
  })

  it('muestra la ayuda cuando no hay error', () => {
    render(<Field label="Bio" hint="Hasta 280 caracteres" />)
    expect(screen.getByLabelText('Bio')).toHaveAccessibleDescription('Hasta 280 caracteres')
    expect(screen.getByLabelText('Bio')).not.toHaveAttribute('aria-invalid')
  })

  it('puede ser un área de texto', () => {
    render(<Field label="Bio" multiline />)
    expect(screen.getByLabelText('Bio').tagName).toBe('TEXTAREA')
  })
})

describe('Avatar', () => {
  it('sin imagen muestra la inicial y se nombra', () => {
    render(<Avatar name="ren0x1" />)
    const avatar = screen.getByRole('img', { name: 'ren0x1' })
    expect(avatar).toHaveTextContent('R')
  })

  it('con imagen usa el nombre como texto alternativo', () => {
    render(<Avatar name="ren0x1" src="https://avatars.steamstatic.com/x.jpg" />)
    expect(screen.getByRole('img', { name: 'ren0x1' })).toHaveAttribute('src', 'https://avatars.steamstatic.com/x.jpg')
  })
})

describe('Logo', () => {
  it('se puede leer como "Pulso"', () => {
    render(<Logo />)
    expect(screen.getByRole('img', { name: 'Pulso' })).toBeInTheDocument()
  })

  it('sin texto, el símbolo sigue teniendo nombre', () => {
    render(<Logo withWordmark={false} />)
    expect(screen.getByRole('img', { name: 'Pulso' })).toBeInTheDocument()
  })
})
