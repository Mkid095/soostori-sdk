/**
 * Local PIN hashing — uses Node `crypto` (Node-only).
 * For browser/React Native, platform implementations are provided separately.
 *
 * PIN is a LOCAL credential only. It unlocks an already-authorized employee.
 * It NEVER becomes the cloud identity.
 */
export declare function hashPin(pin: string, saltHex?: string): {
    hash: string;
    salt: string;
};
export declare function verifyPin(pin: string, hashHex: string, saltHex: string): boolean;
//# sourceMappingURL=pin.d.ts.map