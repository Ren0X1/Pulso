export interface LogoProps {
  size?: number
  withWordmark?: boolean
}

/** El símbolo es un latido: una línea plana que da un pico y vuelve. Legible a 16 px. */
export function PulseMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 13h4.5l2.2-5.5 3.6 11 3-8.5 1.7 3H22"
        stroke="var(--accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logo({ size = 24, withWordmark = true }: LogoProps) {
  return (
    <span className="p-logo" role="img" aria-label="Pulso" style={{ fontSize: Math.round(size * 0.75) }}>
      <PulseMark size={size} />
      {withWordmark && <span aria-hidden="true">Pulso</span>}
    </span>
  )
}
