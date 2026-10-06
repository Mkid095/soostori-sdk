// publish-critical.js — Publish only the 7 critical Soostori SDK packages at 0.2.0
//
// Why just 7: these are the packages that carry the P0 financial fixes
// (Tuma callback tenant identity, subscription state machine, contract
// reconciliation, LAN broadcast, CloudAuth defaults, primary device
// transfer, shop owner enrollment, payment_failed blocking, mobile POS
// sale-loss, mobile LAN discovery). The other 23 packages have no P0
// changes and stay at their current published alpha versions.
//
// Why this script: each app (Web, Desktop, Mobile) lives in its own
// repository. For production deploys, all apps must fetch @soostori/*
// from the npm registry — no local linking. Once these 7 publish,
// `pnpm install` in any app will pull the 0.2.0 versions of core,
// contracts, subscription, events, sync, auth, schema from npm.
//
// Usage:
//   1. Set NPM_TOKEN in C:\Users\Administrator\Documents\GitHub\soostori-sdk\.env
//   2. Run: node publish-critical.js
//
// If npm returns E401 or E404, the token does not have publish permission
// for the @soostori scope. Generate a fresh "Automation" token at
// https://www.npmjs.com/settings/tokens and re-run.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SDK_ROOT = 'C:/Users/Administrator/Documents/GitHub/soostori-sdk';

const CRITICAL = [
  // 1. No internal deps — publish first
  { name: 'core',        order: 1, internalDeps: [] },
  // 2-7. Depend on core
  { name: 'contracts',   order: 2, internalDeps: ['@soostori/core'] },
  { name: 'subscription', order: 3, internalDeps: ['@soostori/core'] },
  { name: 'auth',        order: 4, internalDeps: ['@soostori/core'] },
  { name: 'events',      order: 5, internalDeps: ['@soostori/core', '@soostori/contracts'] },
  { name: 'sync',        order: 6, internalDeps: [
    '@soostori/core', '@soostori/contracts', '@soostori/events', '@soostori/schema',
  ] },
  { name: 'schema',      order: 7, internalDeps: ['@soostori/core', '@soostori/contracts'] },
];

// ── 1. Load token ────────────────────────────────────────────────────────────
const envContent = fs.readFileSync(path.join(SDK_ROOT, '.env'), 'utf8');
let NPM_TOKEN = null;
for (const line of envContent.split(/\r?\n/)) {
  const m = line.match(/^NPM_TOKEN=(.+)$/);
  if (m) NPM_TOKEN = m[1].trim();
}
if (!NPM_TOKEN) {
  console.error('NPM_TOKEN not found in .env');
  process.exit(1);
}

fs.writeFileSync(path.join(SDK_ROOT, '.npmrc'),
  `//registry.npmjs.org/:_authToken=${NPM_TOKEN}\nregistry=https://registry.npmjs.org/\n`);

// ── 2. Verify auth ──────────────────────────────────────────────────────────
console.log('--- Verifying npm auth ---');
try {
  const whoami = execSync('npm whoami', { cwd: SDK_ROOT, encoding: 'utf8' }).trim();
  console.log(`Authenticated as: ${whoami}`);
} catch (e) {
  console.error('FAILED: npm whoami rejected the token (E401).');
  console.error('  The token in .env does not authenticate to npmjs.org.');
  console.error('  Generate a new "Automation" token at https://www.npmjs.com/settings/tokens');
  console.error('  and update NPM_TOKEN in .env. Then re-run this script.');
  process.exit(1);
}

// ── 3. Set version and publishable deps ────────────────────────────────────
console.log('\n--- Setting 0.2.0 + ^0.2.0 on the 7 critical packages ---');
for (const { name } of CRITICAL) {
  const pkgJson = path.join(SDK_ROOT, 'packages', name, 'package.json');
  if (!fs.existsSync(pkgJson)) {
    console.error(`MISSING: ${pkgJson}`);
    process.exit(1);
  }
  const p = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
  p.version = '0.2.0';
  for (const key of Object.keys(p.dependencies || {})) {
    if (key.startsWith('@soostori/')) p.dependencies[key] = '^0.2.0';
  }
  for (const key of Object.keys(p.devDependencies || {})) {
    if (key.startsWith('@soostori/')) p.devDependencies[key] = '^0.2.0';
  }
  for (const key of Object.keys(p.peerDependencies || {})) {
    if (key.startsWith('@soostori/')) p.peerDependencies[key] = '^0.2.0';
  }
  fs.writeFileSync(pkgJson, JSON.stringify(p, null, 2) + '\n');
  console.log(`  ${name}: version=0.2.0, internal deps=^0.2.0`);
}

// ── 4. Build all 7 ────────────────────────────────────────────────────────
console.log('\n--- Building the 7 packages ---');
for (const { name } of CRITICAL) {
  const pkgDir = path.join(SDK_ROOT, 'packages', name);
  process.stdout.write(`  ${name}... `);
  try {
    execSync('npx tsc', { cwd: pkgDir, stdio: 'pipe' });
    console.log('ok');
  } catch (e) {
    console.log('FAILED');
    process.exit(1);
  }
}

// ── 5. Publish in order ─────────────────────────────────────────────────
console.log('\n--- Publishing in dependency order ---');
const results = [];
// CRITICAL is already in dependency order
for (const { name } of CRITICAL) {
  const pkgDir = path.join(SDK_ROOT, 'packages', name);
  process.stdout.write(`  Publishing @soostori/${name}@0.2.0... `);
  try {
    const out = execSync('npm publish --access public', { cwd: pkgDir, encoding: 'utf8' });
    if (out.includes('+ @soostori/')) {
      console.log('OK');
      results.push({ name, status: 'OK' });
    } else {
      console.log('UNKNOWN');
      results.push({ name, status: 'UNKNOWN', detail: out.slice(-200) });
    }
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    let reason = 'unknown';
    if (out.includes('E404')) reason = 'E404 (not found / no permission)';
    else if (out.includes('E409')) reason = 'E409 (version conflict)';
    else if (out.includes('E401')) reason = 'E401 (unauthorized)';
    console.log(`FAIL: ${reason}`);
    results.push({ name, status: 'FAIL', detail: reason });
  }
}

// ── 6. Verify ──────────────────────────────────────────────────────────────
console.log('\n--- Verifying published versions ---');
for (const { name } of CRITICAL) {
  try {
    const ver = execSync(`npm view @soostori/${name} version`,
      { cwd: SDK_ROOT, encoding: 'utf8' }).trim();
    const mark = ver === '0.2.0' ? 'OK' : 'X';
    console.log(`  [${mark}] @soostori/${name}@${ver}`);
  } catch (e) {
    console.log(`  [X] @soostori/${name}: not on npm`);
  }
}

// ── 7. Restore workspace:* in SDK package.json (so local dev still works) ─
console.log('\n--- Restoring workspace:* deps in SDK ---');
for (const { name } of CRITICAL) {
  const pkgJson = path.join(SDK_ROOT, 'packages', name, 'package.json');
  const p = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
  // KEEP version=0.2.0 (so the package.json still records the published state)
  // RESTORE internal deps to workspace:* for local monorepo dev
  for (const key of Object.keys(p.dependencies || {})) {
    if (key.startsWith('@soostori/')) p.dependencies[key] = 'workspace:*';
  }
  for (const key of Object.keys(p.devDependencies || {})) {
    if (key.startsWith('@soostori/')) p.devDependencies[key] = 'workspace:*';
  }
  for (const key of Object.keys(p.peerDependencies || {})) {
    if (key.startsWith('@soostori/')) p.peerDependencies[key] = 'workspace:*';
  }
  fs.writeFileSync(pkgJson, JSON.stringify(p, null, 2) + '\n');
}

// ── 8. Clean up ──────────────────────────────────────────────────────────
try { fs.unlinkSync(path.join(SDK_ROOT, '.npmrc')); } catch {}

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n=== SUMMARY ===');
const ok = results.filter(r => r.status === 'OK').length;
const fail = results.filter(r => r.status === 'FAIL').length;
console.log(`Published: ${ok} / ${results.length}`);
if (fail > 0) {
  console.log(`Failed: ${fail}`);
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`  - @soostori/${r.name}: ${r.detail}`);
  }
}
if (ok === results.length) {
  console.log('\n✓ All 7 critical packages are now on npm at 0.2.0.');
  console.log('  Run `pnpm install` in Web, Desktop, and Mobile to pick up the new versions.');
}
console.log('\n=== Done ===');
