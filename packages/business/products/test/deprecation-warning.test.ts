/**
 * Deprecation warning test for @soostori/products (P0-3a, audit 2026-10-05).
 *
 * Verifies:
 *   1. Importing `@soostori/products` fires a `console.warn` exactly once
 *      with a recognizable deprecation message.
 *   2. The legacy named exports still resolve (no breaking changes).
 *   3. The default export is the canonical `ProductService` from
 *      `@soostori/inventory` — verified by comparing constructor arity
 *      (the legacy service takes 4 positional args; inventory takes 6).
 *   4. Subsequent imports in the same process do NOT re-warn (idempotency).
 *
 * Implementation notes:
 *   - Uses `vi.resetModules()` to clear the module cache between tests so each
 *     test gets a fresh module-scoped `warned` flag. Without this, the first
 *     import's warning would bleed into subsequent tests.
 *   - Uses dynamic `await import()` (not `require`) because the package is
 *     type: "module" — Node's CommonJS `require()` cannot resolve `.js` paths
 *     in ESM source.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('@soostori/products — P0-3a deprecation', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Clear the module cache so each test sees a fresh `warned` flag
    // (the flag is module-scoped state in src/runtime.ts).
    vi.resetModules()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('fires console.warn on first import with a deprecation message', async () => {
    await import('../src/index.js')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const message = String(warnSpy.mock.calls[0][0])
    expect(message).toContain('@soostori/products')
    expect(message).toContain('DEPRECATED')
    expect(message).toContain('@soostori/contracts')
    expect(message).toContain('@soostori/inventory')
  })

  it('warns only once per process (subsequent imports are silent)', async () => {
    // First import — fires warning
    const mod1 = await import('../src/index.js')
    // Second and third imports — same cached module, warning already fired
    const mod2 = await import('../src/index.js')
    const mod3 = await import('../src/index.js')

    expect(mod1).toBe(mod2)
    expect(mod2).toBe(mod3)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('warns again after vi.resetModules() + re-import', async () => {
    // First import — fires
    await import('../src/index.js')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    // Reset module cache; subsequent import is a fresh module → fresh flag
    vi.resetModules()
    await import('../src/index.js')
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  it('legacy named exports still resolve (no breaking changes)', async () => {
    const mod: any = await import('../src/index.js')
    // NOTE: `Product`, `Category`, `ProductVariant`, `ProductRepository`,
    // `ProductFilter`, `PaginationOptions`, `GroupPrice`, `ProductUnit` are
    // all TypeScript interfaces/types and do not exist at runtime — the
    // type checker is the only line of defence for those. Runtime-resolvable
    // exports (classes + error classes + the default export) are checked here.
    expect(mod.ProductService).toBeDefined()
    expect(typeof mod.ProductService).toBe('function') // legacy class
    expect(mod.ProductNotFoundError).toBeDefined()
    expect(typeof mod.ProductNotFoundError).toBe('function')
    expect(mod.InsufficientStockError).toBeDefined()
    expect(typeof mod.InsufficientStockError).toBe('function')
    // The canonical default export from inventory
    expect(mod.default).toBeDefined()
    expect(typeof mod.default).toBe('function')
    // Verify the legacy error classes still throw meaningful errors
    const notFound = new mod.ProductNotFoundError('test-id')
    expect(notFound.message).toContain('test-id')
    expect(notFound.name).toBe('ProductNotFoundError')
    const insufficient = new mod.InsufficientStockError('pid', 5, 10)
    expect(insufficient.message).toContain('pid')
    expect(insufficient.name).toBe('InsufficientStockError')
  })

  it('default export is the canonical ProductService from @soostori/inventory', async () => {
    const mod: any = await import('../src/index.js')
    const Default = mod.default
    expect(Default).toBeDefined()
    expect(typeof Default).toBe('function')
    // The canonical @soostori/inventory ProductService constructor takes 6
    // positional args (store, ledger, syncEngine, businessId, deviceId, employeeId).
    // The legacy @soostori/products ProductService takes 4 (repo, shopId, deviceId, userId).
    // Reflecting on the function tells us which one we got.
    expect(Default.length).toBe(6)
  })

  it('legacy ProductService (named export) is a different class than default', async () => {
    const mod: any = await import('../src/index.js')
    const NamedProductService = mod.ProductService
    const DefaultProductService = mod.default
    // Named export = legacy (4 args); default export = canonical (6 args).
    expect(NamedProductService).not.toBe(DefaultProductService)
    expect(NamedProductService.length).toBe(4)
    expect(DefaultProductService.length).toBe(6)
  })

  it('warn message includes migration target URLs / next steps', async () => {
    await import('../src/index.js')
    const message = String(warnSpy.mock.calls[0][0])
    // Migration hints present
    expect(message.toLowerCase()).toContain('import')
    // Schema validation hint present
    expect(message).toContain('@soostori/schema')
    expect(message).toContain('validateEntity')
  })
})