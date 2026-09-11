# @soostori/customers

Customer entity — create, update, archive, lookup, search with sync event emission.

## Design

```
CustomerService
    │
    ├── CustomerRepository (store contract — callers provide the impl)
    │
    └── SyncEngine (wired to defaultSyncEngine.enqueue())
```

## Operations

| Operation | Emits | Notes |
|---|---|---|
| `createCustomer(input)` | `customer.created` | Idempotent on `input.idempotencyKey` |
| `updateCustomer(id, changes)` | `customer.updated` | Last-writer-wins by version |
| `archiveCustomer(id)` | `customer.archived` | Soft-delete; idempotent if already archived |
| `getCustomer(id)` | — | Business isolation enforced |
| `getCustomerByPhone(phone)` | — | Fast POS lookup |
| `listCustomers(filter)` | — | Supports status + text query filter |
| `countCustomers(filter)` | — | Pagination count |
| `assignSaleToCustomer(saleId, customerId, saleRepo)` | `customer.sale_assigned` | Decoupled from customer creation |

## Idempotency

**Critical invariant: customer must NEVER be duplicated by replay.**

`createCustomer()` calls `store.getCustomerByIdempotencyKey(key)` **before** any write. If a
record already exists for that key, it returns the existing row — no duplicate is created,
no error is raised.

For `updateCustomer()` and `archiveCustomer()`, the idempotency key is
`asIdempotencyKey(\`${entity.id}:${eventType}\`)` — deterministic per entity + operation.

## Sync events

| Event | entityKind | operation | Idempotency key |
|---|---|---|---|
| `customer.created` | `customer` | `create` | `input.idempotencyKey` |
| `customer.updated` | `customer` | `update` | `${entity.id}:customer.updated` |
| `customer.archived` | `customer` | `update` | `${entity.id}:customer.archived` |
| `customer.sale_assigned` | `customer` | `update` | `${saleId}:${customerId}` |

All wired to `defaultSyncEngine.enqueue()`.

## Sale / Customer association

Sale and Customer are **independent entities** in the sync model. A sale can reference a
`customerId` that has not yet arrived on this device — the association is resolved when
both events are processed, regardless of ordering.

`assignSaleToCustomer()` updates the sale record locally and emits a sync event. The caller
provides a `saleRepo` with `updateSaleCustomerId()` to avoid a circular dependency between
`@soostori/customers` and `@soostori/inventory`.

## CustomerRepository interface

```ts
interface CustomerRepository {
  getCustomer(id: CustomerId): Promise<Customer | null>
  getCustomerByIdempotencyKey(key: IdempotencyKey): Promise<Customer | null>
  getCustomerByPhone(businessId: BusinessId, phone: string): Promise<Customer | null>
  listCustomers(filter: CustomerSearchFilter): Promise<Customer[]>
  countCustomers(filter: CustomerSearchFilter): Promise<number>
  upsertCustomer(customer: Customer): Promise<void>
}
```

## Usage

```ts
import { CustomerService } from '@soostori/customers'
import { defaultSyncEngine } from '@soostori/contracts'
import type { CustomerRepository } from '@soostori/customers'

// Caller provides the repository (FIDScript, SQLite, etc.)
const store: CustomerRepository = yourStoreImpl

const customerService = new CustomerService(
  store,
  defaultSyncEngine,
  businessId,
  deviceId,
  employeeId,
)

// Create
const customer = await customerService.createCustomer({
  businessId,
  name: 'Wanjiku wa Kariuki',
  phone: '+254700123456',
  idempotencyKey: 'uuid-from-pos-device',
})

// Search
const active = await customerService.listCustomers({ status: 'active', query: 'Wanjiku' })
```
