import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '../..')

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.ts'],
    cache: false,
  },
  resolve: {
    alias: {
      '@soostori/core': resolve(ROOT, 'packages/core/src/index.ts'),
      '@soostori/contracts': resolve(ROOT, 'packages/contracts/src/index.ts'),
    },
  },
})
