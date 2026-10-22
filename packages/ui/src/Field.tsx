import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

type Shared = { label: string; hint?: string; error?: string | null }
type InputProps = Shared & { multiline?: false } & InputHTMLAttributes<HTMLInputElement>
type AreaProps = Shared & { multiline: true } & TextareaHTMLAttributes<HTMLTextAreaElement>

export function Field(props: InputProps | AreaProps) {
  const { label, hint, error, multiline, id: givenId, ...rest } = props
  const autoId = useId()
  const id = givenId ?? autoId
  const note = error || hint
  const noteId = note ? `${id}-note` : undefined
  const a11y = {
    id,
    'aria-describedby': noteId,
    'aria-invalid': error ? (true as const) : undefined,
  }

  return (
    <div className="p-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} {...a11y} />
      ) : (
        <input {...(rest as InputHTMLAttributes<HTMLInputElement>)} {...a11y} />
      )}
      {note && (
        <p id={noteId} className="p-field-note" data-error={error ? '' : undefined}>
          {note}
        </p>
      )}
    </div>
  )
}
