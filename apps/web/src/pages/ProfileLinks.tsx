import { Globe, Link2 } from 'lucide-react'
import { LINK_KINDS, type LinkKind, type ProfileLink } from '../lib/profile.ts'

/** Un icono neutro por tipo de enlace: las marcas se nombran en texto, no con sus logos. */
export function LinkIcon({ kind }: { kind: LinkKind }) {
  const Icon = kind === 'website' ? Globe : Link2
  return <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
}

/** Enlaces externos del perfil, abiertos en otra pestaña sin pasar datos de Pulso. */
export function ProfileLinks({ links }: { links: ProfileLink[] }) {
  if (!links?.length) return null
  return (
    <ul className="profile-links" aria-label="Enlaces">
      {links.map((link) => (
        <li key={link.url}>
          <a href={link.url} target="_blank" rel="noreferrer noopener" className="link-chip">
            <LinkIcon kind={link.kind} />
            {LINK_KINDS[link.kind] ?? 'Web'}
          </a>
        </li>
      ))}
    </ul>
  )
}
