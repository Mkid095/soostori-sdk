/**
 * Canonical cloud entity definitions — matches FIDScript app `0808ca7d-...`.
 * Single source of truth for every field on every entity.
 *
 * Platform-specific schema declarations (desktop @instantdb/react,
 * mobile @fidscript/instant-react) MUST be generated from this file.
 */

import { z } from 'zod'
import { uuidSchema, iso8601Schema, emailSchema, moneySchema } from '@soostori/core'

/**
 * Field type definitions for cloud entities. Each field declares:
 *   - type: primitive type
 *   - required: whether field is mandatory
 *   - indexed: whether field is indexed for queries
 *   - unique: whether field must be unique
 *   -sensitive: whether field contains PII (for encryption/audit)
 */
export interface FieldDef {
  type: 'string' | 'number' | 'boolean' | 'json' | 'date' | 'uuid'
  required: boolean
  indexed?: boolean
  unique?: boolean
  sensitive?: boolean
  /** Optional default value. */
  default?: unknown
}

export type EntitySchema = Record<string, FieldDef>

/** Build a cloud entity definition object. */
export const field = (def: FieldDef): FieldDef => def

const str = (opts: Partial<FieldDef> = {}): FieldDef => ({ type: 'string', required: false, ...opts })
const num = (opts: Partial<FieldDef> = {}): FieldDef => ({ type: 'number', required: false, ...opts })
const bool = (opts: Partial<FieldDef> = {}): FieldDef => ({ type: 'boolean', required: false, ...opts })
const json = (opts: Partial<FieldDef> = {}): FieldDef => ({ type: 'json', required: false, ...opts })
const date = (opts: Partial<FieldDef> = {}): FieldDef => ({ type: 'date', required: false, ...opts })
const uuid = (opts: Partial<FieldDef> = {}): FieldDef => ({ type: 'uuid', required: false, ...opts })

// ── Canonical cloud entities ──────────────────────────────────────────────────
// NOTE: Field type is `date` for ISO 8601 timestamps per SDK contract.

export const cloudEntities: Record<string, EntitySchema> = {
  // Identity ────────────────────────────────────────────────────────────
  $users: {
    email: str({ required: true, indexed: true, unique: true }),
    imageURL: str({ sensitive: true }),
    type: str({ default: 'owner' }),
  },

  // Management ─────────────────────────────────────────────────────────
  companies: {
    id: uuid({ required: true, unique: true }),
    name: str({ required: true }),
    slug: str({ indexed: true }),
    taxRate: num({ default: 0 }),
  },

  shops: {
    id: uuid({ required: true, unique: true }),
    name: str({ required: true }),
    slug: str({ indexed: true }),
    taxRate: num({ default: 0 }),
    plan: str({ default: 'free' }),
    /** Derived from active subscription. ISO 8601 timestamp. */
    subscriptionExpiry: date({}),
    status: str({ default: 'active' }),
  },

  employees: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ required: true, indexed: true }),
    name: str({ required: true }),
    email: str({ sensitive: true, indexed: true }),
    phone: str({ sensitive: true }),
    role: str({ default: 'attendant' }),
    permissions: json({}),
    status: str({ default: 'active' }),
    createdBy: str({}),
    invitedBy: str({}),
  },

  invitations: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ required: true, indexed: true }),
    email: str({ sensitive: true }),
    phone: str({ sensitive: true }),
    employeeRole: str({ default: 'attendant' }),
    /** 6-digit join code. */
    code: str({ required: true, unique: true }),
    status: str({ default: 'pending', indexed: true }),
    expiresAt: str({ required: true, indexed: true }),
    createdAt: str({ required: true }),
    createdBy: str({}),
    usedAt: str({}),
  },

  devices: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ required: true, indexed: true }),
    deviceName: str({ required: true }),
    deviceType: str({ required: true }),
    status: str({ default: 'pending', indexed: true }),
    isLanHost: bool({ default: false }),
    authorizedAt: str({}),
    lastSeenAt: str({}),
    lastSyncAt: str({}),
    tokenRef: str({ sensitive: true }),
  },

  deviceAuthorizations: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ indexed: true }),
    deviceId: uuid({ indexed: true }),
    authorizedBy: str({ required: true }),
    tokenHash: str({ required: true, sensitive: true }),
    issuedAt: str({ required: true }),
    expiresAt: str({}),
  },

  // Subscriptions ──────────────────────────────────────────────────────
  subscriptions: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ required: true, indexed: true }),
    planId: uuid({ required: true }),
    planKey: str({ required: true, indexed: true }),
    status: str({ required: true, indexed: true }),
    billingCycle: str({ default: 'monthly' }),
    amountPaid: num({}),
    currentPeriodStart: str({ required: true }),
    currentPeriodEnd: str({ required: true, indexed: true }),
    deviceLimit: num({}),
  },

  plans: {
    id: uuid({ required: true, unique: true }),
    key: str({ required: true, unique: true }),
    name: str({ required: true }),
    priceMonthly: num({}),
    priceYearly: num({}),
    deviceLimit: num({ required: true }),
    features: json({}),
  },

  payments: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ indexed: true }),
    amount: num({}),
    currency: str({ default: 'KES' }),
    method: str({}),
    reference: str({}),
    status: str({ default: 'pending', indexed: true }),
    paidAt: str({}),
  },

  subscriptionEvents: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ indexed: true }),
    type: str({ required: true }),
    details: json({}),
  },

  // Sync ──────────────────────────────────────────────────────────────
  syncEvents: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ required: true, indexed: true }),
    deviceId: uuid({ required: true, indexed: true }),
    entity: str({ required: true, indexed: true }),
    entityId: uuid({ indexed: true }),
    operation: str({ required: true }),
    payload: json({}),
    syncedAt: str({ indexed: true }),
  },

  syncStatus: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ indexed: true }),
    lastSyncAt: str({}),
    pendingEvents: num({ default: 0 }),
    deviceCount: num({ default: 0 }),
    activeDeviceCount: num({ default: 0 }),
  },

  backupSnapshots: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ indexed: true }),
    snapshotId: str({ required: true }),
    version: num({ default: 1 }),
    expiresAt: str({}),
    recordCounts: json({}),
    sizeBytes: num({}),
  },

  // Operational (planned for future migration) ───────────────────────
  products: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ required: true, indexed: true }),
    name: str({ required: true }),
    barcode: str({ indexed: true }),
    sku: str({ indexed: true }),
    categoryId: uuid({ indexed: true }),
    categoryName: str({}),
    costPrice: num({}),
    sellingPrice: num({}),
    groupPrices: str({}),
    isGroup: bool({ default: false }),
    unitsPerPackage: num({ default: 1 }),
    stockQuantity: num({ default: 0 }),
    currentStock: num({ default: 0 }),
    lowStockThreshold: num({ default: 0 }),
    trackInventory: bool({ default: true }),
    allowSingleUnitSale: bool({ default: true }),
    distributorName: str({}),
    distributorPhone: str({}),
    image: str({}),
    isActive: bool({ default: true, indexed: true }),
    createdAt: str({ required: true }),
    updatedAt: str({ required: true }),
  },

  categories: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ required: true, indexed: true }),
    name: str({ required: true }),
    color: str({ default: '#6366f1' }),
    description: str({}),
    isActive: bool({ default: true, indexed: true }),
    createdAt: str({ required: true }),
    updatedAt: str({ required: true }),
  },

  customers: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ required: true, indexed: true }),
    name: str({ required: true }),
    phone: str({ sensitive: true }),
    email: str({ sensitive: true }),
    idNumber: str({ sensitive: true }),
    address: str({}),
    notes: str({}),
    isActive: bool({ default: true, indexed: true }),
    createdAt: str({ required: true }),
    updatedAt: str({ required: true }),
  },

  sales: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ required: true, indexed: true }),
    userId: uuid({ indexed: true }),
    deviceId: uuid({ indexed: true }),
    type: str({ default: 'retail' }),
    status: str({ default: 'completed', indexed: true }),
    subtotal: num({}),
    discountAmount: num({}),
    taxAmount: num({}),
    totalAmount: num({}),
    paidAmount: num({}),
    paymentMethod: str({ indexed: true }),
    note: str({}),
    customerId: uuid({}),
    customerName: str({}),
    customerPhone: str({}),
    itemsSummary: str({}),
    createdAt: str({ required: true, indexed: true }),
    updatedAt: str({ required: true }),
  },

  expenses: {
    id: uuid({ required: true, unique: true }),
    shopId: uuid({ required: true, indexed: true }),
    categoryId: uuid({}),
    categoryName: str({}),
    amount: num({}),
    description: str({}),
    reference: str({}),
    date: str({ required: true, indexed: true }),
    createdAt: str({ required: true }),
    updatedAt: str({ required: true }),
  },
}

// ── Zod validation per entity (auto-generated from definitions) ────────────

const zodFieldCache = new Map<string, z.ZodTypeAny>()
function getZodType(type: FieldDef['type']): z.ZodTypeAny {
  const key = type
  const cached = zodFieldCache.get(key)
  if (cached) return cached
  let zodType: z.ZodTypeAny
  switch (type) {
    case 'string': zodType = z.string(); break
    case 'number': zodType = z.number(); break
    case 'boolean': zodType = z.boolean(); break
    case 'json': zodType = z.unknown(); break
    case 'date': zodType = iso8601Schema; break
    case 'uuid': zodType = uuidSchema; break
    default: zodType = z.unknown()
  }
  zodFieldCache.set(key, zodType)
  return zodType
}

function buildZodSchema(entityName: string): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const def = cloudEntities[entityName]
  if (!def) throw new Error(`Unknown entity: ${entityName}`)
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [name, f] of Object.entries(def)) {
    let zt = getZodType(f.type)
    if (!f.required) zt = zt.optional().nullable()
    shape[name] = zt
  }
  return z.object(shape).strict() as unknown as z.ZodObject<Record<string, z.ZodTypeAny>>
}

const zodSchemaCache = new Map<string, z.ZodObject<Record<string, z.ZodTypeAny>>>()
export function getEntitySchema(entityName: string) {
  const cached = zodSchemaCache.get(entityName)
  if (cached) return cached
  const schema = buildZodSchema(entityName)
  zodSchemaCache.set(entityName, schema)
  return schema
}

export function validateEntity(entityName: string, data: unknown) {
  return getEntitySchema(entityName).parse(data)
}
