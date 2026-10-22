import type { ButtonHTMLAttributes } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: invertido (blanco con texto negro), uno por pantalla. */
  variant?: 'primary' | 'ghost' | 'danger'
  busy?: boolean
}

export function Button({ variant = 'primary', busy = false, type = 'button', disabled, className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      data-variant={variant}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={className ? `p-button ${className}` : 'p-button'}
    />
  )
}
