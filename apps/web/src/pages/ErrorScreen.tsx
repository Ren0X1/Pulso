import { Link } from 'react-router'
import { Button, Logo } from '@pulso/ui'

/** Cuando una pantalla falla: un mensaje y cómo salir, en lugar de una página en blanco. */
export function ErrorScreen() {
  return (
    <main className="login">
      <div className="login-panel" role="alert">
        <Logo size={28} />
        <h1>Algo ha fallado</h1>
        <p className="login-lead">Esta pantalla no se ha podido cargar. Recarga, y si sigue pasando vuelve al inicio.</p>
        <div className="row-actions">
          <Button onClick={() => window.location.reload()}>Recargar</Button>
          <Link className="p-button" data-variant="ghost" to="/">
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  )
}
