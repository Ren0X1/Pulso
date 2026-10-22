import { describe, expect, it } from 'vitest'
import { formatCode, REDEEM_ERRORS, redeemErrorKey } from './lists.ts'

describe('formatCode', () => {
  it('agrupa el código como XXXX-XXXX-XX', () => {
    expect(formatCode('ABCDEFGH23')).toBe('ABCD-EFGH-23')
  })
})

describe('redeemErrorKey', () => {
  it('reconoce los errores de la base de datos', () => {
    expect(redeemErrorKey('invalid_code')).toBe('invalid_code')
    expect(redeemErrorKey('own_list')).toBe('own_list')
    expect(redeemErrorKey('algo raro')).toBe('unknown')
  })

  it('cada error tiene su mensaje', () => {
    for (const key of ['invalid_code', 'own_list', 'unknown'] as const) expect(REDEEM_ERRORS[key]).toBeTruthy()
  })
})
