// publish.js — Publish all 30 Soostori SDK packages to npmjs.org at version 0.2.0
//
// Why this script:
//   - All 4 apps (SDK, Web, Desktop, Mobile) live in separate repos
//   - For production deploys, each app must fetch @soostori/* from npm (remote)
//   - Local `link:` references work in dev but break in production
//   - Therefore: publish the SDK to npm, update apps to ^0.2.0
//
// This script handles:
//   - Auth via .env NPM_TOKEN
//   - Version bump to 0.2.0
//   - Internal deps to ^0.2.0 (publishable, not workspace:*)
//   - Build all packages
//   - Publish in dependency order
//   - Verify each version is live on npm
//   - Restore workspace:* deps in SDK package.json
//
// Usage:
//   1. Set NPM_TOKEN in C:\Users\Administrator\Documents\GitHub\soostori-sdk\.env
//   2. Run: node publish.js
//
// If npm publish returns 404/401, the script prints a diagnostic and continues
// so you can see which packages succeeded and which need manual attention.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SDK_ROOT = 'C:/Users/Administrator/Documents/GitHub/soostori-sdk';

// ── 1. Load token ────────────────────────────────────────────────────────────
const envContent = fs.readFileSync(path.join(SDK_ROOT, '.env'), 'utf8');
const envLines = envContent.split(/\r?\n/);
let NPM_TOKEN = null;
for (const line of envLines) {
  const m = line.match(/^NPM_TOKEN=(.+)$/);
  if (m) NPM_TOKEN = m[1].trim();
}
if (!NPM_TOKEN) {
  console.error('NPM_TOKEN not found in .env');
  process.exit(1);
}

// ── 2. Configure auth ────────────────────────────────────────────────────────
fs.writeFileSync(path.join(SDK_ROOT, '.npmrc'),
  `//registry.npmjs.org/:_authToken=${NPM_TOKEN}\nregistry=https://registry.npmjs.org/\n`);

// ── 3. Verify auth (will fail with 401 if token is bad) ────────────────────
console.log('--- Verifying npm auth ---');
try {
  const whoami = execSync('npm whoami', { cwd: SDK_ROOT, encoding: 'utf8' }).trim();
  console.log(`Authenticated as: ${whoami}`);
} catch (e) {
  console.error('FAILED: npm whoami rejected the token.');
  console.error('  Error:', e.message.split('\n').slice(0, 3).join('\n  '));
  console.error('');
  console.error('Common causes:');
  console.error('  1. Token expired or revoked — generate a new one at https://www.npmjs.com/settings/tokens');
  console.error('  2. Token is a "Read-only" or "Legacy" token — must be "Automation" or "Publish"');
  console.error('  3. Token belongs to a different npm account than the @soostori org owner');
  console.error('');
  console.error('Continuing anyway — the script will report per-package publish status.');
}

// ── 4. List all packages ────────────────────────────────────────────────────
const PACKAGES = fs.readdirSync(path.join(SDK_ROOT, 'packages'))
  .filter(name => {
    if (name === 'contract-tests') return false;
    return fs.statSync(path.join(SDK_ROOT, 'packages', name)).isDirectory();
  });
console.log(`\n--- ${PACKAGES.length} packages to publish ---\n`);

// ── 5. Bump versions ──────────────────────────────────────────────────────
for (const name of PACKAGES) {
  const pkgJson = path.join(SDK_ROOT, 'packages', name, 'package.json');
  if (!fs.existsSync(pkgJson)) continue;
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
}

// ── 6. Build ────────────────────────────────────────────────────────────────
console.log('--- Building all packages ---');
for (const name of PACKAGES) {
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

// ── 7. Publish in dependency order ─────────────────────────────────────────
const PUBLISH_ORDER = [
  // Leaves — no internal deps
  'core', 'tuma', 'whatsapp', 'updates', 'storage', 'notifications',
  'expenses', 'reports', 'commercial', 'audit', 'desktop-adapter',
  // Then packages that depend on the leaves
  'business', 'customers', 'debts', 'sales', 'products', 'inventory',
  'payments', 'team',
  // Then mid-level
  'events', 'cloud', 'devices', 'offline', 'lan',
  // Then higher
  'contracts', 'schema', 'subscription', 'sync', 'auth',
  // Top-level integrations
  'partners',
];

const seen = new Set();
const ordered = [];
for (const name of PUBLISH_ORDER) {
  if (seen.has(name)) continue;
  seen.add(name);
  ordered.push(name);
}
for (const name of PACKAGES) {
  if (seen.has(name)) continue;
  seen.add(name);
  ordered.push(name);
}

const results = [];
for (const name of ordered) {
  const pkgDir = path.join(SDK_ROOT, 'packages', name);
  process.stdout.write(`  Publishing @soostori/${name}@0.2.0... `);
  try {
    const out = execSync('npm publish --access public 2>&1',
      { cwd: pkgDir, encoding: 'utf8' });
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
    else if (out.includes('E402')) reason = 'E402 (payment required)';
    console.log(`FAIL: ${reason}`);
    results.push({ name, status: 'FAIL', detail: reason });
  }
}

// ── 8. Verify ──────────────────────────────────────────────────────────────
console.log('\n--- Verifying published versions ---');
for (const name of PACKAGES) {
  try {
    const ver = execSync(`npm view @soostori/${name} version`,
      { cwd: SDK_ROOT, encoding: 'utf8' }).trim();
    const mark = ver === '0.2.0' ? '✓' : '✗';
    console.log(`  ${mark} @soostori/${name}@${ver}`);
  } catch (e) {
    console.log(`  ✗ @soostori/${name}: not on npm`);
  }
}

// ── 9. Restore workspace:* deps ───────────────────────────────────────────
console.log('\n--- Restoring workspace:* deps in SDK package.json ---');
for (const name of PACKAGES) {
  const pkgJson = path.join(SDK_ROOT, 'packages', name, 'package.json');
  if (!fs.existsSync(pkgJson)) continue;
  const p = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
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

// ── 10. Clean up .npmrc (don't leave the token on disk) ──────────────────
try { fs.unlinkSync(path.join(SDK_ROOT, '.npmrc')); } catch {}

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n=== SUMMARY ===');
const ok = results.filter(r => r.status === 'OK').length;
const fail = results.filter(r => r.status === 'FAIL').length;
console.log(`Published: ${ok} / ${results.length}`);
if (fail > 0) {
  console.log(`Failed: ${fail}`);
  console.log('\nFailed packages:');
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`  - @soostori/${r.name}: ${r.detail}`);
  }
  console.log('\n--- Diagnostic ---');
  console.log('If all failures are E404 or E401, the npm token cannot publish to @soostori.');
  console.log('Generate a new "Automation" token at https://www.npmjs.com/settings/tokens');
  console.log('with publish permission, then re-run this script.');
  console.log('\nAlternative: publish manually via the npm web UI at https://www.npmjs.com/<package>');
  console.log('using the tarballs in:');
  console.log('  ' + path.join(SDK_ROOT, 'dist-tarballs-0.2.0'));
}
console.log('\n=== Done ===');
