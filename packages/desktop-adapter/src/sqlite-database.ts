/**
 * SQLite database singleton for the desktop-adapter.
 * Reuses the existing soostori.db connection from the Electron main process.
 * This module must only be imported from the main process (Electron).
 */

import type Database from 'better-sqlite3'

let _db: Database.Database | null = null

/**
 * Set the database instance from the Electron main process.
 * Must be called once during app startup, before any adapter is used.
 */
export function setDatabase(db: Database.Database): void {
  _db = db
}

/** Get the current database instance. */
export function getDatabase(): Database.Database {
  if (!_db) throw new Error('Database not set — call setDatabase() first')
  return _db
}

/** Check if database has been initialized. */
export function isDatabaseSet(): boolean {
  return _db !== null
}
