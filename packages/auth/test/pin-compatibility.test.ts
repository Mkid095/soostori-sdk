/**
 * @soostori/auth — React Native / Node platform compatibility tests.
 *
 * Verifies that:
 * 1. The main @soostori/auth entry does NOT contain Node crypto imports.
 *    (prevents Metro from failing when React Native resolves this package)
 * 2. The main entry does NOT export hashPin/verifyPin.
 * 3. @soostori/auth/pin-node contains Node crypto and exports hashPin/verifyPin.
 * 4. Mobile consumers importing the main entry can resolve without Node crypto errors.
 * 5. Desktop consumers can import @soostori/auth/pin-node to get Node crypto PIN ops.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

const distRoot = resolve(import.meta.dirname, '../dist')

function readDistFile(name: string): string {
  return readFileSync(resolve(distRoot, name), 'utf8')
}

describe('React Native compatibility — main entry', () => {
  it('index.js does NOT re-export pin.js', () => {
    const index = readDistFile('index.js')
    expect(index).not.toContain("from './pin.js'")
    expect(index).not.toContain("from './pin-node.js'")
    expect(index).not.toContain("from './pin-rn.js'")
  })

  it('index.js does NOT contain Node crypto imports', () => {
    const index = readDistFile('index.js')
    expect(index).not.toContain("from 'crypto'")
    expect(index).not.toContain('pbkdf2Sync')
    expect(index).not.toContain('randomBytes')
    expect(index).not.toContain('timingSafeEqual')
  })

  it('index.js exports identity, session, and permissions', () => {
    const index = readDistFile('index.js')
    expect(index).toContain("from './identity.js'")
    expect(index).toContain("from './session.js'")
    expect(index).toContain("from './permissions.js'")
  })

  it('index.d.ts does not declare hashPin or verifyPin', () => {
    const indexDts = readDistFile('index.d.ts')
    expect(indexDts).not.toContain('hashPin')
    expect(indexDts).not.toContain('verifyPin')
  })

  it('pin-rn.js exists and is a stub that throws', () => {
    const rn = readDistFile('pin-rn.js')
    expect(rn).toContain('throw new Error')
    expect(rn).toContain('@soostori/auth: PIN operations require a platform-specific implementation')
    // Must NOT contain actual crypto
    expect(rn).not.toContain("from 'crypto'")
    expect(rn).not.toContain('pbkdf2Sync')
  })
})

describe('Node/Desktop — pin-node entry', () => {
  it('pin-node.js contains Node crypto imports', () => {
    const node = readDistFile('pin-node.js')
    expect(node).toContain("from 'crypto'")
    expect(node).toContain('pbkdf2Sync')
    expect(node).toContain('randomBytes')
    expect(node).toContain('timingSafeEqual')
  })

  it('pin-node.js exports hashPin and verifyPin', () => {
    const node = readDistFile('pin-node.js')
    expect(node).toContain('export function hashPin')
    expect(node).toContain('export function verifyPin')
  })

  it('pin-node.d.ts declares hashPin and verifyPin with correct signatures', () => {
    const nodeDts = readDistFile('pin-node.d.ts')
    expect(nodeDts).toContain('hashPin')
    expect(nodeDts).toContain('verifyPin')
    expect(nodeDts).toContain('saltHex?: string')
  })

  it('hashPin and verifyPin work correctly in Node environment', () => {
    // Use the actual Node implementation — this runs in Node test environment
    const { hashPin, verifyPin } = require(resolve(distRoot, 'pin-node.js'))
    const { hash, salt } = hashPin('1234')
    expect(hash).toBeTruthy()
    expect(salt).toBeTruthy()
    expect(hash).not.toBe('1234')
    expect(verifyPin('1234', hash, salt)).toBe(true)
    expect(verifyPin('9999', hash, salt)).toBe(false)
  })
})

describe('Security — PIN stub does not silently succeed', () => {
  it('pin.js (RN stub) throws when hashPin is called', () => {
    const { hashPin } = require(resolve(distRoot, 'pin.js'))
    expect(() => hashPin('1234')).toThrow('@soostori/auth: PIN operations require a platform-specific implementation')
  })

  it('pin-rn.js throws when verifyPin is called', () => {
    const { verifyPin } = require(resolve(distRoot, 'pin-rn.js'))
    expect(() => verifyPin('1234', 'hash', 'salt')).toThrow('@soostori/auth: PIN operations require a platform-specific implementation')
  })

  it('pin.js does NOT contain a working JS fallback hash', () => {
    const pinJs = readDistFile('pin.js')
    // A naive SHA-256 or MD5 fallback would contain those keywords
    expect(pinJs).not.toContain('createHash')
    expect(pinJs).not.toContain('pbkdf2')
    expect(pinJs).not.toContain('crypto.createCipher')
  })
})

describe('Cross-platform contract — SessionStorage', () => {
  it('SessionStorage is declared in index.d.ts', () => {
    const indexDts = readDistFile('index.d.ts')
    // Check that SessionStorage type is exported (appears as: export type { SessionStorage })
    expect(indexDts).toContain('SessionStorage')
    expect(indexDts).toMatch(/export\s+type\s+\{[^}]+\}\s*from/);
    // The export should be from session.js
    expect(indexDts).toMatch(/from\s+['"].*session\.js['"]/)
  })

  it('index.d.ts does not re-export pin functions', () => {
    const indexDts = readDistFile('index.d.ts')
    expect(indexDts).not.toContain('hashPin')
    expect(indexDts).not.toContain('verifyPin')
  })
})
