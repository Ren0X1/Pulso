import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** <dialog> nativo: foco atrapado, Esc para cerrar y fondo inerte sin código propio. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // React enfoca autoFocus antes de que el diálogo esté abierto, y ese foco se pierde.
      // Solo los campos marcados con data-autofocus; si no hay, el foco va al propio diálogo.
      ;(dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog).focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog dialog-wide' : 'dialog'}
      aria-label={title}
      tabIndex={-1}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="dialog-body">
          <header className="dialog-head">
            <h2>{title}</h2>
            <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}>
              <X size={16} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}
