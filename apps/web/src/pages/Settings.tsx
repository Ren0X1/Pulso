import { useEffect, useState, type FormEvent } from 'react'
import { BIO_MAX, PRIVACY_LABELS, PRIVACY_SECTIONS, profileUpdateSchema, type PrivacyLevel, type PrivacySection } from '@pulso/core'
import { Button, Field } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import { supabase } from '../lib/supabase.ts'
import { isDesktop } from '../lib/platform.ts'
import { LauncherSettingsPanel } from './LauncherSettings.tsx'

const desktop = isDesktop()

const SECTION_LABELS: Record<PrivacySection, { title: string; description: string }> = {
  library: { title: 'Biblioteca', description: 'Tus juegos, su estado y tus horas.' },
  achievements: { title: 'Logros', description: 'Los logros que has desbloqueado.' },
  activity: { title: 'Actividad', description: 'A qué juegas y cuándo.' },
  friends: { title: 'Amigos', description: 'Tu lista de amigos.' },
}

type Privacy = Record<PrivacySection, PrivacyLevel>

function ProfileForm() {
  const { state, refreshProfile } = useAuth()
  const profile = state.status === 'signed-in' ? state.profile : null
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [errors, setErrors] = useState<{ username?: string; bio?: string; form?: string }>({})
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaved(false)
    const parsed = profileUpdateSchema.safeParse({ username: username.trim(), bio })
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors
      return setErrors({ username: flat.username?.[0], bio: flat.bio?.[0] })
    }
    if (!supabase || !profile) return
    setBusy(true)
    const { error } = await supabase.from('profiles').update(parsed.data).eq('id', profile.id)
    setBusy(false)
    if (error) {
      return setErrors(
        error.code === '23505' ? { username: 'Ese nombre ya lo tiene otro jugador' } : { form: 'No se pudo guardar. Inténtalo de nuevo.' },
      )
    }
    setErrors({})
    setSaved(true)
    await refreshProfile()
  }

  return (
    <form className="settings-panel" onSubmit={(e) => void submit(e)} noValidate>
      <Field
        label="Nombre de usuario"
        value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase())}
        hint="3–20 caracteres: minúsculas, números y _. Tu perfil está en /u/tu-nombre."
        error={errors.username}
        autoComplete="username"
      />
      <Field
        label="Bio"
        multiline
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        hint={`${bio.length} / ${BIO_MAX}`}
        error={errors.bio}
      />
      {errors.form && <p className="notice" role="alert">{errors.form}</p>}
      <div className="form-actions">
        <Button type="submit" busy={busy}>
          Guardar
        </Button>
        {saved && <span className="muted" role="status">Guardado</span>}
      </div>
    </form>
  )
}

function PrivacyForm() {
  const [privacy, setPrivacy] = useState<Privacy | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void supabase
      ?.from('privacy_settings')
      .select('library, achievements, activity, friends')
      .maybeSingle()
      .then(({ data }) => setPrivacy(data as Privacy | null))
  }, [])

  async function change(section: PrivacySection, level: PrivacyLevel) {
    if (!supabase || !privacy) return
    const previous = privacy
    setPrivacy({ ...privacy, [section]: level })
    const { data } = await supabase.auth.getUser()
    const { error } = await supabase.from('privacy_settings').update({ [section]: level }).eq('user_id', data.user?.id ?? '')
    if (error) {
      setPrivacy(previous)
      setError('No se pudo cambiar la privacidad. Inténtalo de nuevo.')
    } else setError(null)
  }

  if (!privacy) return <div className="settings-panel muted">Cargando…</div>
  return (
    <div className="settings-panel">
      {PRIVACY_SECTIONS.map((section) => (
        <div key={section} className="privacy-row">
          <label htmlFor={`privacy-${section}`}>
            <span className="privacy-title">{SECTION_LABELS[section].title}</span>
            <span className="muted">{SECTION_LABELS[section].description}</span>
          </label>
          <select
            id={`privacy-${section}`}
            value={privacy[section]}
            onChange={(e) => void change(section, e.target.value as PrivacyLevel)}
          >
            {(Object.keys(PRIVACY_LABELS) as PrivacyLevel[]).map((level) => (
              <option key={level} value={level}>
                {PRIVACY_LABELS[level]}
              </option>
            ))}
          </select>
        </div>
      ))}
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
  )
}

export function SettingsPage() {
  const { signOut, state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : null
  return (
    <div className="settings">
      <section className="settings-section">
        <div className="settings-label">
          <h2>Perfil</h2>
          <p className="muted">Cómo te ven los demás jugadores.</p>
        </div>
        <ProfileForm />
      </section>
      <section className="settings-section">
        <div className="settings-label">
          <h2>Privacidad</h2>
          <p className="muted">Quién puede ver cada apartado de tu perfil. Se aplica en el servidor, no solo en pantalla.</p>
        </div>
        <PrivacyForm />
      </section>
      {desktop && me && (
        <section className="settings-section">
          <div className="settings-label">
            <h2>Launcher</h2>
            <p className="muted">Solo en la app de escritorio. Lo de Discord se guarda en tu cuenta y te sigue a cualquier PC.</p>
          </div>
          <LauncherSettingsPanel userId={me} />
        </section>
      )}
      <section className="settings-section">
        <div className="settings-label">
          <h2>Sesión</h2>
          <p className="muted">Entras con Steam; cerrar sesión no desvincula tu cuenta.</p>
        </div>
        <div className="settings-panel">
          <Button variant="ghost" onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
        </div>
      </section>
    </div>
  )
}
