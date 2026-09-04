/**
 * Schema version history and migrations.
 *
 * Each migration is idempotent and backwards-compatible.
 * When pushing to FIDScript, only NEW fields are added.
 * NEVER remove a field in a migration — deprecate first.
 */

import { SDK_VERSION } from '@soostori/core'

export interface SchemaMigration {
  version: number
  description: string
  /** Entities to add to cloud (e.g., operational entities). */
  addEntities?: string[]
  /** Fields to add to existing entities. */
  addFields?: Record<string, Record<string, 'string' | 'number' | 'boolean' | 'json' | 'date'>>
  /** Fields marked as deprecated. Read-only on cloud. */
  deprecateFields?: Record<string, string[]>
}

export const SCHEMA_VERSION = 7  // Current cloud schema version (from push-perms response + planned operations entities)

export const migrations: SchemaMigration[] = [
  {
    version: 1,
    description: 'Initial cloud schema — companies, shops, employees, devices, plans, subscriptions',
  },
  {
    version: 2,
    description: 'Add invitations, syncEvents, backupSnapshots, subscriptionEvents',
  },
  {
    version: 3,
    description: 'Add payment processing — payments entity',
  },
  {
    version: 4,
    description: 'Add tokenRef to devices, deviceAuthorizations entity',
  },
  {
    version: 5,
    description: 'Add syncStatus entity',
  },
  {
    version: 6,
    description: 'Unified permissions pushed — full CRUD on shops/devices/employees/invitations',
    addFields: {
      devices: { lastSyncAt: 'string' },
      subscriptions: { planId: 'string' },
    },
  },
  {
    version: 7,
    description: 'PLANNED — add operational entities: products, categories, customers, sales, expenses',
    addEntities: ['products', 'categories', 'customers', 'sales', 'expenses'],
    addFields: {
      shops: { subscriptionExpiry: 'string' },  // canonical: ISO 8601
      devices: { authorizedAt: 'string', lastSeenAt: 'string', lastSyncAt: 'string' },
      invitations: { expiresAt: 'string', createdAt: 'string' },
      syncEvents: { syncedAt: 'string' },
      payments: { paidAt: 'string' },
      backupSnapshots: { expiresAt: 'string' },
    },
  },
]

/** Get migrations that haven't been applied yet. */
export function pendingMigrations(currentVersion: number): SchemaMigration[] {
  return migrations.filter(m => m.version > currentVersion)
}

/** Apply a single migration — returns next version. */
export function applyMigration(migration: SchemaMigration): number {
  return migration.version
}

/** Check schema compatibility. */
export function isCompatible(version: number): boolean {
  return version <= SCHEMA_VERSION
}
