# @soostori/business

Multi-business owner model — Person → Business → Membership.

## Why this exists

Replaces the simple `User → Shop` model with proper multi-business support. One Person (owner) can own multiple Businesses, each with isolated:
- Subscription
- Employees
- Devices
- Inventory
- Sales
- Customers

## Architecture

```
Person (cloud user)
   │
   ├── Business A (subscription A, employees A, devices A)
   ├── Business B (subscription B, employees B, devices B)
   └── Business C (subscription C, employees C, devices C)
```

Each Business has exactly one owner Person. Multiple Persons can have Memberships in one Business.

## Modules

| File | Purpose |
|---|---|
| `types.ts` | `Person`, `Business`, `Membership`, `Shop` alias |
| `repository.ts` | Storage contract |
| `service.ts` | `BusinessService` — orchestrates create/invite/revoke |

## Usage

```ts
import { BusinessService } from '@soostori/business'

const service = new BusinessService(repo, deviceId)

// Owner creates a new business
const business = await service.createBusiness({
  name: 'My Shop',
  slug: 'my-shop',
  taxRate: 16,
  currency: 'KES',
  ownerPersonId: person.id,
})

// Invite employee
const membership = await service.inviteEmployee({
  businessId: business.id,
  personId: employee.id,
  role: 'cashier',
  invitedByPersonId: person.id,
})

// Revoke
await service.revokeEmployee(membership.id)
```
