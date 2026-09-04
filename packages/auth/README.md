# @soostori/auth

Canonical identity model and session management.

## Identity chain

```
User → Company → Shop → Employee → Device → Session
```

Every authenticated request resolves this entire chain. Local PIN is **not** part of the chain — it only authorizes a known employee to unlock a known device.

## Modules

| File | Purpose |
|---|---|
| `identity.ts` | `IdentityContext`, chain validation, identity reducer |
| `session.ts` | Serialization, expiry, cross-platform storage interface |
| `pin.ts` | PBKDF2 PIN hashing (Node `crypto`) |
| `permissions.ts` | Role-based + fine-grained permission checks |

## Permissions

| Role | Default permissions |
|---|---|
| `owner` | full + billing/subscription |
| `manager` | inventory + reports + team |
| `cashier` | POS + basic inventory + customers |
| `attendant` | POS only |

## Usage

```ts
import { hasPermission, checkPermission, verifyPin } from '@soostori/auth'

// Check permission
if (!hasPermission(employee.role, 'inventory.create')) {
  throw new Error('Permission denied')
}

// Verify local PIN
const ok = verifyPin('1234', employee.localPinHash!, employee.localPinSalt!)
```
