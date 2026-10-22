import { useState } from 'react'
import { Navigate } from 'react-router'
import { Button, Logo } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'

export function Login() {
  const { state, startLogin } = useAuth()
  const [busy, setBusy] = useState(false)

  if (state.status === 'signed-in') return <Navigate to="/" replace />

  return (
    <main className="login">
      <div className="login-panel">
        <Logo size={32} />
        <h1>Todo tu mundo gaming, en un solo lugar</h1>
        <p className="login-lead">
          Tu biblioteca de Steam, tus logros y tus horas, con tus amigos y tus listas de pendientes. Entras con tu cuenta
          de Steam: Pulso nunca ve tu contraseña.
        </p>
        {state.status === 'unconfigured' ? (
          <p className="notice" role="alert">
            Falta configurar Supabase: copia <code>apps/web/.env.example</code> a <code>apps/web/.env</code> con la URL y
            la clave pública de tu proyecto.
          </p>
        ) : (
          <Button
            busy={busy || state.status === 'loading'}
            onClick={() => {
              setBusy(true)
              void startLogin().finally(() => setBusy(false))
            }}
          >
            Entrar con Steam
          </Button>
        )}
      </div>
    </main>
  )
}
