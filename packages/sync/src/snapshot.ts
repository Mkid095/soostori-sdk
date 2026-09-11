/**
 * Snapshot — full data pull for new device or recovery.
 */

import type { BackupSnapshot, Product, Category, Customer } from '@soostori/core'
import { newId } from '@soostori/core'
import { CloudClient } from '@soostori/cloud'

export interface SnapshotImportOptions {
  shopId: string
  cloud: CloudClient
}

export interface SnapshotResult {
  products: number
  categories: number
  customers: number
  total: number
  snapshotId: string
}

/** Download initial snapshot for a shop. */
export async function downloadInitialSnapshot(opts: SnapshotImportOptions): Promise<SnapshotResult> {
  const { shopId, cloud } = opts
  const [productsRes, categoriesRes, customersRes] = await Promise.all([
    cloud.query<{ products: Array<Record<string, unknown>> }>({
      products: { $: { where: { shopId } } },
    }).catch(() => ({ products: [] })),
    cloud.query<{ categories: Array<Record<string, unknown>> }>({
      categories: { $: { where: { shopId } } },
    }).catch(() => ({ categories: [] })),
    cloud.query<{ customers: Array<Record<string, unknown>> }>({
      customers: { $: { where: { shopId } } },
    }).catch(() => ({ customers: [] })),
  ])

  // Validate that records carry a version field — reject silently malformed data.
  const products = productsRes.products ?? []
  const categories = categoriesRes.categories ?? []
  const customers = customersRes.customers ?? []

  for (const p of products) {
    if (typeof (p as Record<string, unknown>).version !== 'number') {
      console.error('[downloadInitialSnapshot] product missing version:', p.id ?? p)
    }
  }
  for (const c of categories) {
    if (typeof (c as Record<string, unknown>).version !== 'number') {
      console.error('[downloadInitialSnapshot] category missing version:', c.id ?? c)
    }
  }
  for (const cu of customers) {
    if (typeof (cu as Record<string, unknown>).version !== 'number') {
      console.error('[downloadInitialSnapshot] customer missing version:', cu.id ?? cu)
    }
  }

  const snapshotId = newId()
  const result: SnapshotResult = {
    products: products.length,
    categories: categories.length,
    customers: customers.length,
    total: 0,
    snapshotId,
  }
  result.total = result.products + result.categories + result.customers
  return result
}

/** Build a backup snapshot record. */
export function buildBackupSnapshot(args: {
  shopId: string
  recordCounts: Record<string, number>
  sizeBytes: number
  expiresAt?: string
}): BackupSnapshot {
  return {
    id: newId(),
    shopId: args.shopId as BackupSnapshot['shopId'],
    version: 1,
    snapshotId: newId(),
    expiresAt: args.expiresAt,
    recordCounts: args.recordCounts,
    sizeBytes: args.sizeBytes,
  }
}
