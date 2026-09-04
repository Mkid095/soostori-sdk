import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname)

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/desktop-orchestrator.test.ts'],
  },
  resolve: {
    alias: {
      '@soostori/core': resolve(ROOT, 'packages/core/src/index.ts'),
      '@soostori/events': resolve(ROOT, 'packages/events/src/index.ts'),
      '@soostori/schema': resolve(ROOT, 'packages/schema/src/index.ts'),
      '@soostori/auth': resolve(ROOT, 'packages/auth/src/index.ts'),
      '@soostori/storage': resolve(ROOT, 'packages/storage/src/index.ts'),
      '@soostori/devices': resolve(ROOT, 'packages/devices/src/index.ts'),
      '@soostori/offline': resolve(ROOT, 'packages/offline/src/index.ts'),
      '@soostori/audit': resolve(ROOT, 'packages/audit/src/index.ts'),
      '@soostori/notifications': resolve(ROOT, 'packages/notifications/src/index.ts'),
      '@soostori/lan': resolve(ROOT, 'packages/lan/src/index.ts'),
      '@soostori/sync': resolve(ROOT, 'packages/sync/src/index.ts'),
      '@soostori/subscription': resolve(ROOT, 'packages/subscription/src/index.ts'),
      '@soostori/payments': resolve(ROOT, 'packages/payments/src/index.ts'),
      '@soostori/tuma': resolve(ROOT, 'packages/tuma/src/index.ts'),
      '@soostori/whatsapp': resolve(ROOT, 'packages/whatsapp/src/index.ts'),
      '@soostori/cloud': resolve(ROOT, 'packages/cloud/src/index.ts'),
      '@soostori/inventory': resolve(ROOT, 'packages/inventory/src/index.ts'),
      '@soostori/products': resolve(ROOT, 'packages/business/products/src/index.ts'),
      '@soostori/sales': resolve(ROOT, 'packages/business/sales/src/index.ts'),
      '@soostori/customers': resolve(ROOT, 'packages/business/customers/src/index.ts'),
      '@soostori/debts': resolve(ROOT, 'packages/business/debts/src/index.ts'),
      '@soostori/business': resolve(ROOT, 'packages/business/src/index.ts'),
    },
  },
})
