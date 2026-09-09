/**
 * Phase 11A P0 Build Remediation
 *
 * Fixes two P0 defects:
 *  1. Cross-package dist pollution
 *  2. Invalid native ESM relative imports
 *
 * Strategy:
 *  - Set rootDir to "./src" in every package's tsconfig
 *  - Switch module/moduleResolution to NodeNext
 *  - The tsconfig.base.json paths aliases pointing to source become BLOCKED
 *    because they violate rootDir. We use project references instead.
 *  - Use NodeNext so that `export * from './ids.js'` resolves correctly at runtime.
 */

const fs = require('fs')
const path = require('path')

const SDK_ROOT = path.resolve(__dirname, '..', 'soostori-sdk')
const PKG_ROOT = path.join(SDK_ROOT, 'packages')

function findAllPackages(dir) {
  const out = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory() && !['node_modules', 'dist', 'test', '.git'].includes(e.name)) {
      const pj = path.join(full, 'package.json')
      if (fs.existsSync(pj)) out.push(full)
      out.push(...findAllPackages(full))
    }
  }
  return out
}

const packages = findAllPackages(PKG_ROOT)
let modified = 0

for (const dir of packages) {
  const tsconfigPath = path.join(dir, 'tsconfig.json')
  if (!fs.existsSync(tsconfigPath)) continue

  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'))
  let changed = false

  // Force rootDir to ./src
  if (tsconfig.compilerOptions?.rootDir !== './src') {
    tsconfig.compilerOptions = tsconfig.compilerOptions || {}
    tsconfig.compilerOptions.rootDir = './src'
    changed = true
  }

  // Switch to NodeNext for native ESM compatibility
  if (tsconfig.compilerOptions?.module !== 'NodeNext') {
    tsconfig.compilerOptions.module = 'NodeNext'
    changed = true
  }
  if (tsconfig.compilerOptions?.moduleResolution !== 'NodeNext') {
    tsconfig.compilerOptions.moduleResolution = 'NodeNext'
    changed = true
  }

  if (changed) {
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n')
    modified++
    console.log(`[fixed] ${path.basename(dir)}/tsconfig.json`)
  }
}

console.log(`\nModified ${modified} tsconfig.json files`)
