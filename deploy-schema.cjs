/**
 * Controlled schema deployment — adds Phase 9.1 required tables to existing DB.
 * All tables use CREATE TABLE IF NOT EXISTS — idempotent, non-destructive.
 * Existing data is preserved.
 */

const path = require('path')

const dbPath = 'C:\\Users\\Administrator\\AppData\\Roaming\\soostori-desktop\\soostori.db'

// Use the pnpm store binary directly
const Database = require('C:/Users/Administrator/Documents/GitHub/soostori-sdk/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3')

const db = new Database(dbPath)
console.log('DB opened:', dbPath)

const MISSING_TABLES = [
  // Commerce auth tables
  `CREATE TABLE IF NOT EXISTS shops (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'KES',
    owner_id TEXT,
    slug TEXT,
    tax_rate REAL NOT NULL DEFAULT 0,
    plan TEXT NOT NULL DEFAULT 'free',
    subscription_expiry TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    name TEXT NOT NULL,
    pin_hash TEXT NOT NULL DEFAULT '',
    pin_salt TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'cashier',
    is_active INTEGER NOT NULL DEFAULT 1,
    cloud_id TEXT,
    email TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    permissions TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (shop_id) REFERENCES shops(id)
  )`,
  `CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    employee_id TEXT,
    device_name TEXT NOT NULL DEFAULT 'POS',
    device_type TEXT NOT NULL DEFAULT 'desktop',
    capabilities TEXT NOT NULL DEFAULT '{"sales":true,"inventory":true,"printing":true}',
    is_host INTEGER NOT NULL DEFAULT 0,
    is_online INTEGER NOT NULL DEFAULT 0,
    connection_token TEXT,
    last_seen TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'offline',
    authorized_at TEXT,
    app_version TEXT,
    hostname TEXT,
    platform TEXT,
    FOREIGN KEY (shop_id) REFERENCES shops(id)
  )`,
  `CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier',
    code TEXT NOT NULL UNIQUE,
    device_name TEXT,
    created_by TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    FOREIGN KEY (shop_id) REFERENCES shops(id)
  )`,
  `CREATE TABLE IF NOT EXISTS device_pairings (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    approved_by TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    token TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS device_sessions (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    login_at TEXT NOT NULL DEFAULT (datetime('now')),
    logout_at TEXT,
    FOREIGN KEY (device_id) REFERENCES devices(id)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    device_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // Sync tables
  `CREATE TABLE IF NOT EXISTS sync_events (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    synced_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_events_shop ON sync_events(shop_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_events_seq ON sync_events(sequence_number)`,
  `CREATE TABLE IF NOT EXISTS inventory_transactions (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    status TEXT DEFAULT 'confirmed',
    payload TEXT,
    sequence_number INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inv_tx_product ON inventory_transactions(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inv_tx_shop ON inventory_transactions(shop_id)`,
  `CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    product_count INTEGER NOT NULL,
    last_sequence INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_processed (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    event_id TEXT NOT NULL,
    processed_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_processed_key ON sync_processed(device_id, idempotency_key)`,
  `CREATE TABLE IF NOT EXISTS sync_conflicts (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    sale_id TEXT,
    device_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    resolved_by TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status ON sync_conflicts(status)`,
  `CREATE TABLE IF NOT EXISTS sync_sales (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT,
    total REAL NOT NULL DEFAULT 0,
    items_count INTEGER,
    payload TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_sales_shop ON sync_sales(shop_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_sales_status ON sync_sales(status)`,
  // Expenses
  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    note TEXT DEFAULT '',
    date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
]

let added = 0
let skipped = 0
for (const sql of MISSING_TABLES) {
  try {
    db.exec(sql)
    // Extract table name from SQL
    const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)
    if (match) {
      console.log('  ADDED:', match[1])
      added++
    } else {
      console.log('  ADDED (index):', sql.substring(0, 60))
    }
  } catch (e) {
    // Index may already exist with different name
    if (e.message.includes('already exists')) {
      console.log('  SKIPPED (exists):', sql.substring(0, 60))
      skipped++
    } else {
      console.error('  ERROR:', e.message)
    }
  }
}

console.log(`\nDeployment complete: ${added} items added, ${skipped} skipped`)

// Verify all tables now present
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
console.log(`\nTotal tables now: ${tables.length}`)
tables.forEach(t => console.log(' ', t.name))

db.close()
console.log('\nDone.')
