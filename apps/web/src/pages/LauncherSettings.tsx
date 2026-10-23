import { useEffect, useState } from 'react'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { DEFAULT_LAUNCHER, loadLauncherSettings, saveLauncherSettings, setPresence, type LauncherSettings } from '../lib/desktop.ts'

function SwitchRow({
  id,
  title,
  description,
  checked,
  onChange,
}: {
  id: string
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="switch-row">
      <label htmlFor={id}>
        <span className="privacy-title">{title}</span>
        <span className="muted">{description}</span>
      </label>
      <button id={id} type="button" role="switch" aria-checked={checked} className="switch" onClick={() => onChange(!checked)}>
        <span />
      </button>
    </div>
  )
}

/** Solo en el launcher. Discord viaja con la cuenta (user_settings); el inicio automático es de este PC. */
export function LauncherSettingsPanel({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<LauncherSettings>(DEFAULT_LAUNCHER)
  const [autostart, setAutostart] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadLauncherSettings().then(setSettings)
    void isEnabled().then(setAutostart, () => setAutostart(false))
  }, [])

  async function changeDiscord(value: boolean) {
    const next = { ...settings, discordPresence: value }
    setSettings(next)
    try {
      await setPresence(value)
      await saveLauncherSettings(userId, next)
      setError(null)
    } catch {
      setError('No se pudo guardar el ajuste de Discord.')
    }
  }

  async function changeAutostart(value: boolean) {
    try {
      await (value ? enable() : disable())
      setAutostart(await isEnabled())
      setError(null)
    } catch {
      setError('Windows no dejó cambiar el inicio automático.')
    }
  }

  return (
    <div className="settings-panel">
      <SwitchRow
        id="discord-presence"
        title="Mostrar en Discord a qué juegas"
        description="Tu estado de Discord enseña el juego, su portada y el tiempo de sesión. Necesita Discord abierto."
        checked={settings.discordPresence}
        onChange={(v) => void changeDiscord(v)}
      />
      <SwitchRow
        id="autostart"
        title="Iniciar Pulso con el sistema"
        description="Arranca minimizado en la bandeja, para detectar tus partidas aunque no lo abras."
        checked={autostart}
        onChange={(v) => void changeAutostart(v)}
      />
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
  )
}
