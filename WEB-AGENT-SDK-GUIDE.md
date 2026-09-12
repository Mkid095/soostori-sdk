# Web Agent SDK Integration Guide
## How the Web App Should Use `@soostori/*` Packages

This guide is for the Web agent (and anyone integrating the SDK). It explains every package, what it does, how to import it, and what it connects to.

---

## Architecture Overview

```
Browser (Next.js)
   │
   ├── @soostori/auth        ← Authentication (PKCE OAuth, sessions)
   ├── @soostori/cloud       ← FIDScript REST transport
   ├── @soostori/business    ← Business + membership model
   ├── @soostori/team        ← Invitations + team management
   ├── @soostori/subscription ← Plan enforcement + offline grace
   ├── @soostori/devices     ← Device identity + primary device
   ├── @soostori/customers   ← Customer CRUD
   ├── @soostori/sales       ← Sales + receipts
   ├── @soostori/inventory   ← Products + stock ledger
   ├── @soostori/debts       ← Debt ledger
   ├── @soostori/expenses    ← Expense management
   ├── @soostori/reports     ← Derived reports (sales, inventory, debt, expense)
   ├── @soostori/notifications ← Event → channel dispatcher
   ├── @soostori/audit        ← Immutable audit log
   │
   └── Prisma (your own DB)   ← Business data YOU own (NOT FIDScript)
```

**Key principle**: The SDK packages talk to FIDScript (cloud backend). Your Next.js app's Prisma DB is a separate system you control. The SDK does NOT replace Prisma — it wraps the cloud auth/sync layer.

---

## Package-by-Package Guide

---

### `@soostori/core` — Foundation Types
**Version: `^0.1.0-alpha.9`**

The base package. Provides branded ID types (`UserId`, `ShopId`, `BusinessId`, `EmployeeId`, `DeviceId`, `ProductId`, etc.), canonical errors, and validation utilities. Every other SDK package depends on this.

**When you need it:**
- Any time you use branded IDs
- Any time you catch `SoostoriError` subclasses
- Zod validation utilities

```typescript
import { BusinessId, EmployeeId, DeviceId, SoostoriError } from '@soostori/core'
import { z } from 'zod'
```

**Web usage:** You mostly import types from here indirectly through other packages. You rarely use it directly.

---

### `@soostori/auth` — Authentication & Sessions ⭐ MOST IMPORTANT
**Version: `^0.1.0-alpha.7`**

Handles ALL authentication. Two separate flows:

#### Flow 1: Browser PKCE OAuth (Web/Desktop)
```typescript
import { CloudAuth } from '@soostori/auth'

const auth = new CloudAuth({
  appId: 'your-fidscript-app-id',   // FIDScript app name
  clientName: 'soostori-web',        // Display name for OAuth consent
})

// Step 1: Start Google OAuth — redirects to Google
await auth.signInWithGoogle()

// Step 2: Handle the callback after Google redirects back
// On your /auth/callback page:
const result = await auth.handleOAuthCallback(callbackUrl)
// result contains: userId, employeeId, shopId, deviceId, accessToken, refreshToken, email

// result.userId       → Cloud user ID (from FIDScript $users)
// result.employeeId  → This person's employee record ID in this shop
// result.shopId      → The shop they're signed into
// result.deviceId    → This browser/device
```

#### Session Management
```typescript
// Check if user has an active session (on app load)
const session = await auth.getStoredSession()
// session null = not logged in → redirect to login

// Sign out
await auth.signOut()
```

#### Capabilities / Permissions
```typescript
import { can, hasPermission } from '@soostori/auth'
import type { Capability } from '@soostori/auth'

// Check if current user can do something
const member = { role: 'manager' } // from your session
if (!can(member, 'team.invite')) {
  throw new Error('Not authorized')
}

// Or check a specific permission
const allowed = hasPermission('cashier', 'pos.sell') // true
```

#### Flow 2: Backend AuthApiClient (for custom backend auth)
```typescript
// If your Next.js API routes need to verify auth tokens,
// implement HttpAuthApiClient on your backend and pass it to CloudAuth:
import type { HttpAuthApiClient } from '@soostori/auth'

const myBackendAuth: HttpAuthApiClient = {
  async verifyToken(token) { /* call your backend */ },
  async refreshToken(refreshToken) { /* ... */ },
  // etc.
}

const auth = new CloudAuth({ appId: '...', authApiClient: myBackendAuth })
```

**What it does NOT need:** No client secret, no API key. PKCE handles OAuth security.

---

### `@soostori/cloud` — FIDScript REST Transport
**Version: `^0.1.0-alpha.5`**

Low-level HTTP client for talking to FIDScript. Used by other SDK packages, but you may also use it directly for raw queries.

```typescript
import { CloudClient, createCloudClient } from '@soostori/cloud'

const cloud = createCloudClient({ appId: 'soostori-app' })
cloud.setToken(accessToken)

// Query cloud entities
const result = await cloud.query({
  subscriptions: { $: { where: { shopId: '...' } } }
})

// Mutate via Instaml transaction
await cloud.transact([
  ['create', 'employees', newId(), { shopId, personId, role: 'cashier', ... }],
])
```

**Web usage:** Usually you don't call this directly — other services do. But for custom cloud queries it's the interface.

---

### `@soostori/business` — Business & Person Model
**Version: `^0.1.0-alpha.2`**

The multi-business hierarchy:
```
Person (cloud user)
  └── Memberships (per-business)
        └── Business (the shop)
```

```typescript
import { BusinessService } from '@soostori/business'
import type { Business, Membership, Person } from '@soostori/business'

// After auth, you get the active business:
const membership = await businessService.getPersonMemberships(personId)
// membership.business  → current Business
// membership.role     → 'owner' | 'manager' | 'cashier' | 'attendant' | 'viewer'
```

**For creating a new business** (first-time setup):
```typescript
const business = await businessService.createBusiness({
  name: 'My Shop',
  slug: 'my-shop',
  taxRate: 0.16,
  currency: 'KES',
  ownerPersonId: personId,
})
// Automatically creates owner membership
```

---

### `@soostori/team` — Invitations & Member Management
**Version: `^0.1.0-alpha.3`**

Manages team members and invitations.

```typescript
import { TeamService } from '@soostori/team'
import type { InviteMemberInput } from '@soostori/team'

// Invite someone
const invitation = await teamService.inviteMember({
  businessId: shopId,
  email: 'newuser@example.com',
  role: 'cashier',    // 'owner' | 'manager' | 'cashier' | 'attendant' | 'viewer'
})

// List all members
const members = await teamService.listMembers()

// Update a member's role
await teamService.updateMemberRole(membershipId, { role: 'manager' })

// Remove a member
await teamService.removeMember(membershipId)
```

**Invitation acceptance flow** (invitee):
```typescript
// On the invitee's device — accept invitation
const membership = await teamService.acceptInvitation(
  invitationId,    // from invitation.email link
  personId,
  employeeId,
)
```

---

### `@soostori/subscription` — Plan & Entitlements
**Version: `^0.1.0-alpha.2`**

Handles plan limits and offline grace periods.

```typescript
import { SubscriptionCache, computeState } from '@soostori/subscription'

// Check current subscription state
const cached = await subscriptionCache.load(shopId)
const state = computeState(cached)

// state.valid            → can operate?
// state.inGracePeriod    → offline but still allowed
// state.graceDaysRemaining → 0-3 days
// state.expired          → past plan expiry

// If state.valid is false → block POS operations, show upgrade UI
if (!state.valid) {
  router.push('/upgrade')
}
```

**Offline grace period:** 3 days. After that, POS operations are blocked until re-connected.

---

### `@soostori/devices` — Device Identity & Primary Device
**Version: `^0.1.0-alpha.2`**

For managing devices in a shop. On Web, most of this is less relevant (browsers aren't "devices" in the POS sense), but device identity is still tracked.

```typescript
import { DeviceService } from '@soostori/devices'

// Device limit enforcement (when registering a new device)
const deviceService = new DeviceService({
  businessId: shopId,
  deviceId: deviceId,
  repository: devicesRepo,
  syncEngine: syncEngine,
  deviceLimit: subscriptionDeviceLimit, // from subscription
})

try {
  await deviceService.enrollDevice({ deviceName: 'Chrome MacBook', deviceType: 'desktop' })
} catch (e) {
  if (e instanceof DeviceLimitExceededError) {
    // Show: "Your plan allows N devices. Upgrade to add more."
  }
}
```

---

### `@soostori/customers` — Customer Management
**Version: `^0.1.0-alpha.1`**

```typescript
import { CustomerService } from '@soostori/customers'
import type { CreateCustomerInput } from '@soostori/customers'

const customerService = new CustomerService({ repository, syncEngine })

await customerService.createCustomer({
  name: 'John Doe',
  phone: '+254712345678',
  email: 'john@example.com',
})

const customers = await customerService.searchCustomers({ query: 'john' })
```

---

### `@soostori/inventory` — Products & Stock
**Version: `^0.1.0-alpha.1`**

Event-sourced stock ledger. Products and stock movements (not just quantities).

```typescript
import { ProductService, InventoryService } from '@soostori/inventory'
import type { CreateProductInput } from '@soostori/inventory'

const productService = new ProductService({ repository, syncEngine })

await productService.createProduct({
  name: 'Coca Cola 500ml',
  barcode: '123456789',
  sellingPrice: { amount: 50, currency: 'KES' },
  costPrice: { amount: 35, currency: 'KES' },
  trackInventory: true,
  stockQuantity: 100,
})

// Stock movements (immutable ledger)
await inventoryService.receiveStock({
  productId,
  quantity: 50,
  reference: 'GRN-001',
  deviceId,
})
```

---

### `@soostori/sales` — Sales & Receipts
**Version: `^0.1.0-alpha.14`**

```typescript
import { SaleService } from '@soostori/sales'
import type { CreateSaleInput } from '@soostori/sales'

const saleService = new SaleService({ repository, syncEngine })

const sale = await saleService.createSale({
  items: [
    { productId, quantity: 2, unitPrice: { amount: 50, currency: 'KES' } },
  ],
  paymentMethod: 'cash',
  customerId: optionalCustomerId,
})

// Void, refund
await saleService.voidSale(sale.id)
await saleService.refundSale(sale.id, { reason: 'Defective' })
```

---

### `@soostori/debts` — Debt Ledger
**Version: `^0.1.0-alpha.1`**

Event-sourced: balance = initial amount − sum(confirmed payments).

```typescript
import { DebtService } from '@soostori/debts'

const debtService = new DebtService({ repository, syncEngine })

const debt = await debtService.createDebt({
  customerId,
  amount: { amount: 1000, currency: 'KES' },
  description: 'Grocery credit',
})

await debtService.recordPayment(debt.id, {
  amount: { amount: 300, currency: 'KES' },
})

const status = debtService.deriveDebtStatus(debt)
// status.balance → remaining
// status.isSettled → boolean
```

---

### `@soostori/expenses` — Expense Management
**Version: `^0.1.0-alpha.17`**

```typescript
import { ExpenseService } from '@soostori/expenses'
import type { CreateExpenseInput } from '@soostori/expenses'

const expenseService = new ExpenseService({ repository, syncEngine })

await expenseService.createExpense({
  categoryName: 'Rent',
  amount: { amount: 50000, currency: 'KES' },
  description: 'September rent',
  date: '2024-09-01',
})

// Recurring expense
await expenseService.createRecurringExpense({
  categoryName: 'Internet',
  amount: { amount: 5000, currency: 'KES' },
  frequency: 'monthly',
  description: 'Monthly internet',
})
```

---

### `@soostori/reports` — Derived Reports
**Version: `^0.1.0-alpha.14`**

Reports are **derived** from transactional data — not a separate source of truth. The SDK enforces reconciliation invariants.

```typescript
import { ReportsService, ReportService } from '@soostori/reports'

const reportsService = new ReportsService({ repository })

// Verify reconciliation invariants (run after sync)
const report = await reportsService.verifyReconciliation({
  shopId,
  period: { start: '2024-09-01', end: '2024-09-30' },
})
// report.salesTotal       → SUM of completed sales
// report.inventoryStock    → SUM of stock ledger movements
// report.debtBalance      → SUM of debt balances
// report.expenseTotal      → SUM of approved expenses

// Check if numbers match — if not, sync conflict
if (!report.invariantsSatisfied) {
  // Trigger full re-sync
}
```

---

### `@soostori/notifications` — Event Routing
**Version: `^0.1.0-alpha.1`**

Dispatches events to channels (WhatsApp, email, in-app). You configure the channels.

```typescript
import { NotificationEngine } from '@soostori/notifications'

const engine = new NotificationEngine({
  channels: {
    inApp: true,
    email: emailTransport,
    whatsapp: whatsappChannel,
  },
})

// When a sale happens:
await engine.dispatch({
  event: 'sale.confirmed',
  payload: { saleId, customerName, total },
  recipients: [employeeDeviceIds],
})
```

---

### `@soostori/audit` — Immutable Audit Log
**Version: `^0.1.0-alpha.1`**

Records sensitive actions immutably.

```typescript
import { AuditRecorder } from '@soostori/audit'

const recorder = new AuditRecorder({ repository })

await recorder.record({
  action: 'sale.refund',
  userId,
  entityType: 'sale',
  entityId: saleId,
  metadata: { reason, amount },
})
```

---

### `@soostori/events` — Event Catalog
**Version: `^0.1.0-alpha.2`**

Event name constants. Subscribe to these to react to things happening.

```typescript
import { getEventBus } from '@soostori/events'
import { SALE_CONFIRMED, DEVICE_REGISTERED } from '@soostori/events'

const bus = getEventBus()

bus.subscribe(SALE_CONFIRMED, (event) => {
  // New sale confirmed — update UI, send notifications, etc.
})

bus.subscribe(DEVICE_REGISTERED, (event) => {
  // New device joined the shop
})
```

---

### `@soostori/sync` — Cloud Sync Engine
**Version: `^0.1.0-alpha.1`**

Handles push/pull, conflict resolution, idempotency. Usually initialized once at app startup.

```typescript
import { SyncEngine } from '@soostori/sync'

const syncEngine = new SyncEngine({
  cloud: cloudClient,
  deviceId,
  shopId,
  repositories: {
    products: productsRepo,
    sales: salesRepo,
    // ...all entity repositories
  },
})

// On reconnect:
await syncEngine.push()   // push local queue to cloud
await syncEngine.pull()    // pull cloud changes

// Ongoing — sync engine runs on a timer or on-demand
```

---

### `@soostori/offline` — Online/Offline State
**Version: `^0.1.0-alpha.1`**

Tracks online/offline state and enforces the 3-day grace period.

```typescript
import { OfflinePolicy } from '@soostori/offline'

const policy = new OfflinePolicy()

// Before any write operation:
if (!policy.canMutate()) {
  // Check if within grace period
  const grace = policy.getGraceRemaining()
  if (grace.days <= 0) {
    throw new Error('Offline limit exceeded. Reconnect to continue.')
  }
  // Show warning banner: "Offline mode. X days remaining."
}
```

---

### `@soostori/schema` — Cloud Entity Definitions
**Version: `^0.1.0-alpha.2`**

Canonical cloud entity schemas. Use this to validate data before sending to FIDScript.

```typescript
import { validateEntity } from '@soostori/schema'

// Validate before a cloud transact
validateEntity('shops', { id: shopId, name: 'My Shop', ... })
validateEntity('employees', { id, shopId, role: 'cashier', ... })
```

---

## Dependency Resolution (Correct Versions)

Your `package.json` should use these exact versions:

```json
{
  "dependencies": {
    "@soostori/auth": "^0.1.0-alpha.7",
    "@soostori/business": "^0.1.0-alpha.2",
    "@soostori/team": "^0.1.0-alpha.3",
    "@soostori/subscription": "^0.1.0-alpha.2",
    "@soostori/devices": "^0.1.0-alpha.2",
    "@soostori/cloud": "^0.1.0-alpha.5",
    "@soostori/events": "^0.1.0-alpha.2",
    "@soostori/customers": "^0.1.0-alpha.1",
    "@soostori/sales": "^0.1.0-alpha.14",
    "@soostori/inventory": "^0.1.0-alpha.1",
    "@soostori/debts": "^0.1.0-alpha.1",
    "@soostori/expenses": "^0.1.0-alpha.17",
    "@soostori/reports": "^0.1.0-alpha.14",
    "@soostori/notifications": "^0.1.0-alpha.1",
    "@soostori/audit": "^0.1.0-alpha.1",
    "@soostori/sync": "^0.1.0-alpha.1",
    "@soostori/offline": "^0.1.0-alpha.1",
    "@soostori/schema": "^0.1.0-alpha.2",
    "@soostori/core": "^0.1.0-alpha.9",
    "@soostori/contracts": "^0.1.0-alpha.2",
    "@soostori/partners": "^0.1.0-alpha.1",
    "@soostori/commercial": "^0.1.0-alpha.2",
    "@soostori/payments": "^0.1.0-alpha.1",
    "@soostori/tuma": "^0.1.0-alpha.1",
    "@soostori/whatsapp": "^0.1.0-alpha.1",
    "@soostori/lan": "^0.1.0-alpha.1",
    "@soostori/updates": "^0.1.0-alpha.1"
  }
}
```

**Note on `@soostori/contracts`:** The Web repo currently overrides this to a local path (`./src/lib/vendor/contracts`). This should be removed and replaced with the NPM version (`^0.1.0-alpha.2`) since the local override is blocking proper dependency resolution.

---

## App Startup Sequence (Correct Order)

```typescript
// 1. Initialize FIDScript (only needed if using FIDScript's React SDK directly)
// import '@soostori/fidscript-init'

// 2. Initialize auth
import { CloudAuth } from '@soostori/auth'
const auth = new CloudAuth({ appId: 'soostori-app', clientName: 'soostori-web' })

// 3. Check for existing session
const session = await auth.getStoredSession()
if (session) {
  // User is logged in — restore state
  cloudClient.setToken(session.accessToken)
  // Initialize other services with session data
} else {
  // Show login page
}

// 4. On login success, CloudAuth returns:
const { userId, employeeId, shopId, deviceId, accessToken, refreshToken, email } = result

// 5. Initialize business context
import { BusinessService } from '@soostori/business'
const businessService = new BusinessService({ repository: businessRepo, deviceId })
const { business, membership } = await businessService.getPersonMemberships(userId)

// 6. Initialize domain services
const teamService = new TeamService({ repo: teamRepo, syncEngine, businessId: shopId, deviceId, employeeId })
const subscriptionCache = new SubscriptionCache(localStorage)
const subscriptionState = await subscriptionCache.getState(shopId)

// 7. Start sync engine
await syncEngine.start()
```

---

## Common Mistakes to Avoid

### ❌ Don't use `workspace:*` dependencies
```json
// WRONG — pnpm workspace protocol, not resolvable by npm
"@soostori/core": "workspace:*"

// CORRECT — use NPM semver
"@soostori/core": "^0.1.0-alpha.9"
```

### ❌ Don't mix Prisma and FIDScript data
Your Prisma schema is for YOUR business data. FIDScript (via SDK) is for cloud sync + auth. Don't put FIDScript entity data in Prisma or vice versa.

### ❌ Don't skip subscription enforcement
```typescript
// WRONG — bypasses plan limits
await createSale({ ... })

// CORRECT — check subscription first
const state = await subscriptionCache.getState(shopId)
if (!state.valid) throw new SubscriptionExpiredError()
await createSale({ ... })
```

### ❌ Don't use raw strings for IDs
```typescript
// WRONG — loses type safety
const id: string = getShopId()

// CORRECT — use branded IDs from @soostori/core
import { asShopId } from '@soostori/core'
const shopId = asShopId(rawString)
```

---

## File Organization Recommendation

For the Web app, organize services by domain:

```
src/lib/soostori/
  auth/          ← CloudAuth setup, session management
  business/      ← BusinessService, team
  sync/           ← SyncEngine, offline policy
  domain/
    sales/
    inventory/
    customers/
    debts/
    expenses/
    reports/
```

Each service is initialized once (singleton pattern) and imported where needed.
