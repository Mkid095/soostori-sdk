/**
 * Auth adapter — wires Desktop PIN auth to @soostori/auth.
 *
 * PIN hashing is already aligned:
 *   Desktop:  pbkdf2Sync(pin, salt, 100_000, 32, 'sha256')
 *   SDK:     pbkdf2Sync(pin, salt, PIN_PBKDF2_ITERATIONS=100_000, 32, 'sha256')
 *
 * Session persistence (electron-store) lives in soostori-desktop/electron/auth/electron-store-session.ts,
 * not here — this file is platform-agnostic.
 */

import { hashPin, verifyPin } from '@soostori/auth/pin-node'
import { ROLE_PERMISSIONS, hasPermission } from '@soostori/auth'
import type { SessionStorage } from '@soostori/auth'

export { hashPin, verifyPin, ROLE_PERMISSIONS, hasPermission }
export type { SessionStorage }
