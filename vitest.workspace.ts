/**
 * Vitest workspace — lists all packages that have test files.
 */

import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

const ROOT = resolve(import.meta.dirname)

export default [
  {
    extends: resolve(ROOT, 'vitest.config.ts'),
    test: {
      include: ['packages/**/test/**/*.ts'],
    },
  },
]
