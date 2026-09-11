/**
 * CustomerRepository — local store contract for Customer entities.
 *
 * Design notes:
 *   - `upsertCustomer` is the single write path; updates use version compare.
 *   - `getCustomerByIdempotencyKey` is the idempotency lookup — must be checked
 *     before every write so that replay NEVER creates a duplicate customer.
 *   - `getCustomerByPhone` enables POS quick-lookup by phone without a full scan.
 *   - Archive is a soft-delete (status → 'inactive'); no hard delete.
 */

import type { Customer } from '@soostori/contracts'
import type { BusinessId, CustomerId, IdempotencyKey, ISO8601 } from '@soostori/core'

export interface CustomerSearchFilter {
  businessId: BusinessId
  status?: Customer['status'] | 'all'
  query?: string   // matches name or phone substring
  limit?: number
  offset?: number
}

export interface CustomerRepository {
  /** Fetch a customer by its primary key. Returns null if not found. */
  getCustomer(id: CustomerId): Promise<Customer | null>

  /**
   * Idempotency lookup — returns the existing customer with this idempotency key,
   * or null if this is a brand-new create.
   *
   * Critical: callers MUST check this before writing. Same idempotency key on replay
   * must return the existing row, never create a duplicate.
   */
  getCustomerByIdempotencyKey(key: IdempotencyKey): Promise<Customer | null>

  /**
   * Phone lookup — enables fast POS search by phone number.
   * Returns null if no customer has this phone number.
   */
  getCustomerByPhone(businessId: BusinessId, phone: string): Promise<Customer | null>

  /** List customers for a business, optionally filtered. */
  listCustomers(filter: CustomerSearchFilter): Promise<Customer[]>

  /** Count customers matching a filter (for pagination). */
  countCustomers(filter: CustomerSearchFilter): Promise<number>

  /**
   * Upsert a customer.
   *
   * - Create: when `id` is new and no idempotency-key match exists.
   * - Update: when `id` is known and incoming version > stored version.
   *
   * The repository is responsible for enforcing idempotency via
   * `getCustomerByIdempotencyKey` (caller checks) and version compare here.
   *
   * Archive: callers pass `status: 'inactive'` — no hard delete.
   */
  upsertCustomer(customer: Customer): Promise<void>
}
