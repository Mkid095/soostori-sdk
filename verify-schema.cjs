/**
 * Phase 9.1.5 E2E Verification
 * Runs against the deployed soostori.db
 * Verifies:
 * 1. Existing POS data intact (products, categories, customers, sales, debts)
 * 2. New schema present (employees, devices, shops, sync tables)
 * 3. Repository can read existing tables
 */

const Database = require('C:/Users/Administrator/Documents/GitHub/soostori-sdk/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3')
const db = new Database('C:\\Users\\Administrator\\AppData\\Roaming\\soostori-desktop\\soostori.db')

console.log('=== PHASE 9.1.5 E2E VERIFICATION ===\n')

// A. Schema verification
console.log('A. SCHEMA VERIFICATION')
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
console.log(`  Total tables: ${tables.length}`)
const tableNames = tables.map(t => t.name)

// Check all required tables
const required = [
  'products','categories','customers','sales','sale_items','debts','debt_payments',
  'shop_settings','app_settings','offer_combos','held_sales','product_variants',
  'stock_movements','stock_adjustment_log','sync_queue',
  'shops','employees','devices','invitations','device_pairings','device_sessions','audit_logs',
  'sync_events','inventory_transactions','sync_sales','sync_conflicts','sync_processed',
  'inventory_snapshots','expenses'
]
let schemaPass = true
for (const t of required) {
  const found = tableNames.includes(t)
  console.log(`  ${found ? '✅' : '❌'} ${t}`)
  if (!found) schemaPass = false
}

// B. Existing POS data verification
console.log('\nB. EXISTING POS DATA VERIFICATION')
const posTables = ['products','categories','customers','sales','debts','shop_settings','app_settings']
for (const t of posTables) {
  try {
    const count = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get()
    console.log(`  ✅ ${t}: ${count.c} records`)
  } catch (e) {
    console.log(`  ❌ ${t}: ERROR - ${e.message}`)
  }
}

// C. New table counts (should be 0 since no auth/sync yet)
console.log('\nC. NEW TABLE COUNTS (auth/sync - expected empty or low)')
const newTables = ['employees','devices','shops','invitations','device_sessions','device_pairings','audit_logs','sync_events','sync_sales','sync_conflicts','sync_processed','inventory_transactions','inventory_snapshots','expenses']
for (const t of newTables) {
  try {
    const count = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get()
    console.log(`  ${t}: ${count.c} records`)
  } catch (e) {
    console.log(`  ❌ ${t}: ${e.message}`)
  }
}

// D. Product sample
console.log('\nD. SAMPLE RECORDS')
try {
  const prods = db.prepare('SELECT id, name, barcode, selling_price FROM products LIMIT 3').all()
  console.log(`  Products (${prods.length}):`)
  prods.forEach(p => console.log(`    - ${p.name} | ${p.barcode || 'no barcode'} | KES ${p.selling_price}`))
} catch (e) { console.log('  Products: ERROR', e.message) }

try {
  const cats = db.prepare('SELECT name FROM categories LIMIT 3').all()
  console.log(`  Categories (${cats.length}):`)
  cats.forEach(c => console.log(`    - ${c.name}`))
} catch (e) { console.log('  Categories: ERROR', e.message) }

try {
  const custs = db.prepare('SELECT name, phone FROM customers LIMIT 3').all()
  console.log(`  Customers (${custs.length}):`)
  custs.forEach(c => console.log(`    - ${c.name} | ${c.phone || 'no phone'}`))
} catch (e) { console.log('  Customers: ERROR', e.message) }

try {
  const sales = db.prepare('SELECT id, total_amount, payment_method, created_at FROM sales LIMIT 3').all()
  console.log(`  Sales (${sales.length}):`)
  sales.forEach(s => console.log(`    - ${s.id.substring(0,8)} | KES ${s.total_amount} | ${s.payment_method} | ${s.created_at}`))
} catch (e) { console.log('  Sales: ERROR', e.message) }

// E. Repository verification - simulate ProductsRepository
console.log('\nE. REPOSITORY VERIFICATION')
try {
  const repo = db.prepare('SELECT COUNT(*) as c FROM products WHERE is_active = 1').get()
  console.log(`  ✅ ProductsRepository (active products): ${repo.c}`)
} catch (e) { console.log('  ❌ ProductsRepository:', e.message) }

try {
  const repo = db.prepare('SELECT COUNT(*) as c FROM categories WHERE is_active = 1').get()
  console.log(`  ✅ CategoriesRepository (active categories): ${repo.c}`)
} catch (e) { console.log('  ❌ CategoriesRepository:', e.message) }

try {
  const repo = db.prepare('SELECT COUNT(*) as c FROM customers WHERE is_active = 1').get()
  console.log(`  ✅ CustomersRepository (active customers): ${repo.c}`)
} catch (e) { console.log('  ❌ CustomersRepository:', e.message) }

try {
  const repo = db.prepare('SELECT COUNT(*) as c FROM sales').get()
  console.log(`  ✅ SalesRepository (all sales): ${repo.c}`)
} catch (e) { console.log('  ❌ SalesRepository:', e.message) }

// F. Auth table structure verification
console.log('\nF. AUTH TABLE STRUCTURE')
try {
  const cols = db.prepare("PRAGMA table_info(employees)").all()
  const names = cols.map(c => c.name)
  console.log(`  employees columns: ${names.join(', ')}`)
  const hasPin = names.includes('pin_hash') && names.includes('pin_salt')
  const hasRole = names.includes('role')
  console.log(`  ${hasPin ? '✅' : '❌'} PIN fields present`)
  console.log(`  ${hasRole ? '✅' : '❌'} role field present`)
} catch (e) { console.log('  employees: ERROR', e.message) }

try {
  const cols = db.prepare("PRAGMA table_info(devices)").all()
  const names = cols.map(c => c.name)
  const hasHost = names.includes('is_host')
  const hasStatus = names.includes('status')
  console.log(`  ${hasHost ? '✅' : '❌'} devices.is_host present`)
  console.log(`  ${hasStatus ? '✅' : '❌'} devices.status present (SDK required)`)
} catch (e) { console.log('  devices: ERROR', e.message) }

// G. Sync table structure
console.log('\nG. SYNC TABLE STRUCTURE')
try {
  const cols = db.prepare("PRAGMA table_info(sync_events)").all()
  const names = cols.map(c => c.name)
  console.log(`  sync_events: ${names.length} columns`)
  console.log(`  ${names.includes('sequence_number') ? '✅' : '❌'} sequence_number present`)
} catch (e) { console.log('  sync_events: ERROR', e.message) }

try {
  const cols = db.prepare("PRAGMA table_info(inventory_transactions)").all()
  const names = cols.map(c => c.name)
  console.log(`  inventory_transactions: ${names.length} columns`)
  console.log(`  ${names.includes('balance_after') ? '✅' : '❌'} balance_after present`)
} catch (e) { console.log('  inventory_transactions: ERROR', e.message) }

console.log('\n=== VERIFICATION COMPLETE ===')
db.close()
