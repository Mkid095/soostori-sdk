import { describe, it, expect } from 'vitest'
import { UNAUTHORIZED_LOGIN_CONTACT_PHONE } from '../src/constants'
import * as Core from '@soostori/core'

describe('UNAUTHORIZED_LOGIN_CONTACT_PHONE', () => {
  it('equals the §29 contact phone string', () => {
    expect(UNAUTHORIZED_LOGIN_CONTACT_PHONE).toBe('+254 732 203 353')
  })

  it('is a string with the expected E.164-ish shape', () => {
    expect(typeof UNAUTHORIZED_LOGIN_CONTACT_PHONE).toBe('string')
    expect(UNAUTHORIZED_LOGIN_CONTACT_PHONE.startsWith('+')).toBe(true)
    expect(UNAUTHORIZED_LOGIN_CONTACT_PHONE).toContain('254')
    expect(UNAUTHORIZED_LOGIN_CONTACT_PHONE).toContain('732 203 353')
  })

  it('is re-exported from @soostori/core', () => {
    expect(Core.UNAUTHORIZED_LOGIN_CONTACT_PHONE).toBe('+254 732 203 353')
  })
})
