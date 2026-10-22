import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { LOGIN_ERRORS } from '../lib/auth-callback.ts'
import { useAuth } from '../lib/auth.tsx'

export function AuthCallback() {
  const { completeLogin } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    const hash = window.location.hash
    // Los tokens no deben quedarse en la barra de direcciones ni en el historial.
    history.replaceState(null, '', window.location.pathname)
    void completeLogin(hash).then((result) => {
      if (result.ok) navigate('/', { replace: true })
      else setError(LOGIN_ERRORS[result.error === 'login_failed' ? result.code : result.error] ?? LOGIN_ERRORS.server_error!)
    })
  }, [completeLogin, navigate])

  return (
    <main className="login">
      <div className="login-panel" aria-live="polite">
        {error ? (
          <>
            <h1>No se pudo entrar</h1>
            <p className="login-lead">{error}</p>
            <Link className="p-button" data-variant="primary" to="/login">
              Volver a intentarlo
            </Link>
          </>
        ) : (
          <h1>Entrando…</h1>
        )}
      </div>
    </main>
  )
}
