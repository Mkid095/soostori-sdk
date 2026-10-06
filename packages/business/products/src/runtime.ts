/**
 * Internal runtime state for the @soostori/products deprecation warning.
 *
 * P0-3a (audit 2026-10-05): the legacy @soostori/products package is being
 * retired in favour of `@soostori/contracts` (types) and `@soostori/inventory`
 * (services). To make the deprecation observable in dev/test runs without
 * spamming production with logs, the warning fires exactly once per process.
 *
 * The guard is a module-scoped boolean — it survives only for the lifetime of
 * the JS process, which is what we want. A fresh process (test run, dev
 * reload) gets a fresh warning.
 *
 * Exposed as a small object so tests can deterministically reset the flag
 * between assertions without importing private state.
 */

let warned = false

/**
 * Emit the one-time deprecation warning for @soostori/products.
 * Idempotent within a single process — first call warns, subsequent calls
 * are silent. Tests reset `_resetDeprecationWarningForTests()` between runs.
 */
export function warnDeprecatedOnce(): void {
  if (warned) return
  warned = true
  // Use console.warn (not console.error) so it's visible in dev/test but does
  // not trip CI error-gates that watch for console.error.
  // eslint-disable-next-line no-console
  console.warn(
    '[@soostori/products] DEPRECATED since 2026-10-05 (audit P0-3a).\n' +
      '  - Canonical Product type: import from "@soostori/contracts" (data-contract-2-operational).\n' +
      '  - ProductService:          import from "@soostori/inventory".\n' +
      '  - Runtime Zod validation:  "validateEntity(\'products\', ...)" from "@soostori/schema".\n' +
      '  See https://github.com/Mkid095/soostori-sdk/blob/main/CHANGELOG.md for the migration rationale.',
  )
}

/**
 * Test-only escape hatch — resets the warned flag so the next call warns again.
 * Used by `deprecation-warning.test.ts` to assert the warning fires multiple
 * times across independent imports / module reloads in the same process.
 *
 * Not exported from the package barrel — kept here as an internal helper.
 */
export function _resetDeprecationWarningForTests(): void {
  warned = false
}