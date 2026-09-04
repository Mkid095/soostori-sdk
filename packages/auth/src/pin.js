/**
 * Local PIN hashing — uses Node `crypto` (Node-only).
 * For browser/React Native, platform implementations are provided separately.
 *
 * PIN is a LOCAL credential only. It unlocks an already-authorized employee.
 * It NEVER becomes the cloud identity.
 */
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import { PIN_PBKDF2_ITERATIONS, EMPLOYEE_PIN_LENGTH } from '@soostori/core';
const KEY_LENGTH = 32;
const DIGEST = 'sha256';
export function hashPin(pin, saltHex) {
    if (pin.length !== EMPLOYEE_PIN_LENGTH) {
        throw new Error(`PIN must be ${EMPLOYEE_PIN_LENGTH} digits`);
    }
    const salt = saltHex ?? randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(pin, salt, PIN_PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
    return { hash, salt };
}
export function verifyPin(pin, hashHex, saltHex) {
    if (pin.length !== EMPLOYEE_PIN_LENGTH)
        return false;
    const computed = pbkdf2Sync(pin, saltHex, PIN_PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST);
    const expected = Buffer.from(hashHex, 'hex');
    if (computed.length !== expected.length)
        return false;
    return timingSafeEqual(computed, expected);
}
//# sourceMappingURL=pin.js.map