/**
 * Validation schemas — zod-based, shared across all apps.
 */

import { z } from 'zod'

// ── Shared primitives ─────────────────────────────────────────────────────────

export const uuidSchema = z.string().uuid()

export const iso8601Schema = z.string().datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/))

export const emailSchema = z.string().email().max(255)

export const moneySchema = z.number().nonnegative().finite()

export const pinSchema = z.string().regex(/^\d{4}$/, 'PIN must be 4 digits')

export const magicCodeSchema = z.string().regex(/^\d{6}$/, 'Magic code must be 6 digits')

export const inviteCodeSchema = z.string().regex(/^\d{6}$/, 'Invite code must be 6 digits')

// ── Entity schemas ───────────────────────────────────────────────────────────

export const shopSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  taxRate: z.number().min(0).max(100).default(0),
  plan: z.string().default('free'),
  subscriptionExpiry: iso8601Schema.nullable().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
}).strict()

export const employeeRoleSchema = z.enum(['owner', 'manager', 'cashier', 'attendant'])

export const employeeSchema = z.object({
  id: uuidSchema,
  shopId: uuidSchema,
  name: z.string().min(1).max(100),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  role: employeeRoleSchema,
  permissions: z.record(z.boolean()).nullable().optional(),
  cloudId: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
}).strict()

export const deviceSchema = z.object({
  id: uuidSchema,
  shopId: uuidSchema,
  deviceName: z.string().min(1).max(100),
  deviceType: z.enum(['desktop', 'mobile']),
  status: z.enum(['pending', 'authorized', 'revoked', 'offline']).default('pending'),
  isLanHost: z.boolean().default(false),
  authorizedAt: iso8601Schema.nullable().optional(),
  lastSeenAt: iso8601Schema.nullable().optional(),
  lastSyncAt: iso8601Schema.nullable().optional(),
  tokenRef: z.string().nullable().optional(),
}).strict()

export const productSchema = z.object({
  id: uuidSchema,
  shopId: uuidSchema,
  name: z.string().min(1).max(200),
  barcode: z.string().max(100).nullable().optional(),
  sku: z.string().max(100).nullable().optional(),
  categoryId: uuidSchema.nullable().optional(),
  categoryName: z.string().max(100).nullable().optional(),
  costPrice: moneySchema.default(0),
  sellingPrice: moneySchema,
  groupPrices: z.string().nullable().optional(),
  isGroup: z.boolean().default(false),
  unitsPerPackage: z.number().int().positive().default(1),
  stockQuantity: z.number().int().nonnegative().default(0),
  currentStock: z.number().int().nonnegative().default(0),
  lowStockThreshold: z.number().int().nonnegative().default(0),
  trackInventory: z.boolean().default(true),
  allowSingleUnitSale: z.boolean().default(true),
  distributorName: z.string().nullable().optional(),
  distributorPhone: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  createdAt: iso8601Schema,
  updatedAt: iso8601Schema,
}).strict()

export const categorySchema = z.object({
  id: uuidSchema,
  shopId: uuidSchema,
  name: z.string().min(1).max(100),
  color: z.string().default('#6366f1'),
  description: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  createdAt: iso8601Schema,
  updatedAt: iso8601Schema,
}).strict()

export const syncOperationSchema = z.enum(['create', 'update', 'delete'])

export const syncEventSchema = z.object({
  id: uuidSchema,
  shopId: uuidSchema,
  deviceId: uuidSchema,
  entity: z.string().min(1).max(100),
  entityId: uuidSchema,
  operation: syncOperationSchema,
  payload: z.record(z.unknown()),
  timestamp: iso8601Schema,
  version: z.number().int().nonnegative().default(0),
  idempotencyKey: uuidSchema,
  syncedAt: iso8601Schema.optional(),
}).strict()

export const planSchema = z.object({
  id: uuidSchema,
  key: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  priceMonthly: moneySchema,
  priceYearly: moneySchema,
  deviceLimit: z.number().int().positive(),
  features: z.record(z.unknown()),
}).strict()

export const subscriptionSchema = z.object({
  id: uuidSchema,
  shopId: uuidSchema,
  planId: uuidSchema,
  planKey: z.string().min(1).max(50),
  status: z.enum(['active', 'past_due', 'expired', 'cancelled', 'trialing']),
  billingCycle: z.enum(['monthly', 'yearly']),
  amountPaid: moneySchema.default(0),
  currentPeriodStart: iso8601Schema,
  currentPeriodEnd: iso8601Schema,
  deviceLimit: z.number().int().positive(),
}).strict()
