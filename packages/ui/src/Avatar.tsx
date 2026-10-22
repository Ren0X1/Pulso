export interface AvatarProps {
  name: string
  src?: string | null
  size?: number
}

export function Avatar({ name, src, size = 32 }: AvatarProps) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }
  if (src) return <img className="p-avatar" src={src} alt={name} width={size} height={size} style={style} />
  return (
    <span className="p-avatar" role="img" aria-label={name} style={style}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
