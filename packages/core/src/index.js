/**
 * @soostori/core — canonical contract primitives.
 * Single source of truth for branded IDs, domain types, validation, errors, constants.
 *
 * Note: `@soostori/contracts` is the new canonical home for entity types.
 * It is NOT re-exported through `@soostori/core` yet because the legacy types
 * in `./types.js` overlap with the new contract — Sub-cycle B will reconcile.
 * Cycle 04 Sub-cycle A ships both surfaces side-by-side; downstream consumers
 * should `import { … } from '@soostori/contracts'` directly.
 */
export * from './ids.js';
export * from './types.js';
export * from './constants.js';
export * from './errors.js';
export * from './validation.js';
//# sourceMappingURL=index.js.map
