import { describe, expect, it } from 'vitest'
import { exactUsername, friendshipWith, type FriendshipRow } from './friends.ts'

const ME = 'me'
const OTHER = 'other'
const row = (requester_id: string, addressee_id: string, status: FriendshipRow['status']): FriendshipRow => ({
  requester_id,
  addressee_id,
  status,
})

describe('friendshipWith', () => {
  it('sin relación', () => {
    expect(friendshipWith(ME, OTHER, [])).toBe('none')
    expect(friendshipWith(ME, OTHER, [row('x', 'y', 'accepted')])).toBe('none')
  })

  it('solicitud enviada por mí', () => {
    expect(friendshipWith(ME, OTHER, [row(ME, OTHER, 'pending')])).toBe('outgoing')
  })

  it('solicitud recibida', () => {
    expect(friendshipWith(ME, OTHER, [row(OTHER, ME, 'pending')])).toBe('incoming')
  })

  it('amigos, la haya pedido quien la haya pedido', () => {
    expect(friendshipWith(ME, OTHER, [row(ME, OTHER, 'accepted')])).toBe('friends')
    expect(friendshipWith(ME, OTHER, [row(OTHER, ME, 'accepted')])).toBe('friends')
  })

  it('una solicitud rechazada cuenta como sin relación', () => {
    expect(friendshipWith(ME, OTHER, [row(ME, OTHER, 'declined')])).toBe('none')
  })

  it('conmigo mismo no hay relación posible', () => {
    expect(friendshipWith(ME, ME, [])).toBe('self')
  })
})

describe('exactUsername', () => {
  it('busca ese nombre exacto sin distinguir mayúsculas: el _ deja de ser comodín', () => {
    expect(exactUsername('Ren0X1')).toBe('Ren0X1')
    expect(exactUsername('ren_0x1')).toBe('ren\\_0x1')
  })
})
