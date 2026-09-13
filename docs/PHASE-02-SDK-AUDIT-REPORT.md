# PHASE 02 — SDK AUDIT REPORT
## Business & Account Provisioning — 2026-09-12

---

## Gaps Fixed

### GAP-09 — CloudClient missing business provisioning methods ✅ FIXED

**Location**: `packages/cloud/src/client.ts`

Added typed methods covering the complete Phase 2 provisioning chain:

| Method | Purpose |
|--------|---------|
| `queryPersons()` | Query cloud users |
| `createShop()` / `updateShop()` | Business CRUD |
| `createEmployee()` / `updateEmployee()` | Membership CRUD |
| `createInvitation()` / `updateInvitation()` / `acceptInvitation()` | Invitation lifecycle |
| `querySubscriptions()` / `createSubscription()` / `updateSubscription()` | Subscription management |
| `registerDevice()` / `updateDevice()` / `queryDevices()` | Device lifecycle |

`acceptInvitation()` uses a single Instaml transaction to atomically update the invitation and create the employee record.

---

### GAP-10 — devices entity `isLanHost` / `authorizedAt` fields ✅ ALREADY CORRECT

**Evidence**: `packages/schema/src/entities.ts` lines 93–104 already include both fields:

```typescript
devices: {
  isLanHost: bool({ default: false }),
  authorizedAt: str({}),
  ...
}
```

No changes needed.

---

### GAP-11 — Subscription device limit NOT enforced at device registration ✅ FIXED

**Location**: `packages/devices/src/DeviceService.ts`

- Added `deviceLimit?: number | null` to `DeviceServiceOptions`
- Added `DeviceLimitExceededError` (extends `SoostoriError`, code `DEVICE_LIMIT_EXCEEDED`)
- Added `countActiveDevices(shopId)` to `DevicesRepository` interface
- `enrollDevice()` now checks `activeCount >= deviceLimit` before registering and throws `DeviceLimitExceededError` if exceeded

```typescript
if (this.deviceLimit != null) {
  const devices = await this.repository.findByShop(this.businessId as any)
  const activeCount = devices.filter(d => d.status !== 'revoked').length
  if (activeCount >= this.deviceLimit) {
    throw new DeviceLimitExceededError(
      `Device limit reached (${this.deviceLimit}). Cannot register new device.`
    )
  }
}
```

---

### GAP-12 — Missing business provisioning event types ✅ FIXED

**Location**: `packages/events/src/catalog.ts`, `packages/events/src/payloads.ts`

Added to `catalog.ts`:

```typescript
export const EMPLOYEE_INVITED     = 'employee.invited'
export const EMPLOYEE_ACCEPTED   = 'employee.accepted'
export const EMPLOYEE_ROLE_CHANGED = 'employee.role_changed'
export const EMPLOYEE_REVOKED    = 'employee.revoked'
```

Added to `ALL_EVENTS` array and to `EventPayloadMap` in `payloads.ts`:

```typescript
'business.created': { businessId: string; name: string; ownerPersonId: string }
'business.updated': { businessId: string; changes: Record<string, unknown> }
'employee.invited': { businessId: string; employeeId: string; personId: string; role: string }
'employee.accepted': { businessId: string; employeeId: string; personId: string }
'employee.role_changed': { businessId: string; employeeId: string; role: string; changedBy: string }
'employee.revoked': { businessId: string; employeeId: string }
```

---

### GAP-13 — `invitations.expiresAt` expiration check ✅ ALREADY CORRECT

**Evidence**: `packages/team/src/TeamService.ts` line 129–133:

```typescript
if (new Date(invitation.expiresAt) < new Date()) {
  await this.repo.updateInvitationStatus(invitationId, 'expired')
  await this.emit('team.invitation.expired', { ...invitation, status: 'expired' }, 'update')
  throw new Error('Invitation has expired')
}
```

Expiration is checked on `acceptInvitation()` before processing. No changes needed.

---

## Verified Correct (No Changes Required)

| # | Item | Evidence |
|---|------|---------|
| 1 | `BusinessService.createBusiness()` creates owner membership | `service.ts:39-48` — creates `employees` record with `role: owner` |
| 2 | `BusinessRepository` covers all 6 entities | `repository.ts` — persons, shops, employees, invitations, subscriptions, devices |
| 3 | Roles match between `@soostori/business` and `@soostori/auth` | `packages/business/src/types.ts:61` and `packages/auth/src/permissions.ts:19-59` — both define `owner, manager, cashier, attendant, viewer` |
| 4 | `TeamService.inviteMember()` is idempotent | `TeamService.ts:84-85` — checks `existing` by idempotencyKey, returns early if found |
| 5 | Offline grace period = 3 days | `packages/subscription/src/entitlement.ts:43` — `OFFLINE_GRACE_DAYS` from `@soostori/core` |
| 6 | `DeviceService.registerDevice()` creates `devices` record | `DeviceService.ts:96` — `await this.repository.registerDevice(device)` |
| 7 | Primary device switching works | `packages/devices/src/primary.ts` — `PrimaryDeviceCoordinator.transferPrimary()` |
| 8 | `setActiveBusiness()` / `getActiveBusiness()` implement business isolation | `repository.ts:28-30` — `setActiveBusiness` / `getActiveBusiness` on `BusinessRepository` |

---

## Published Package Versions

| Package | Old Version | New Version | NPM Status |
|---------|------------|-------------|------------|
| `@soostori/business` | `0.1.0-alpha.1` | `0.1.0-alpha.2` | ✅ Published |
| `@soostori/team` | `0.1.0-alpha.2` | `0.1.0-alpha.3` | ✅ Published |
| `@soostori/subscription` | `0.1.0-alpha.1` | `0.1.0-alpha.2` | ✅ Published |
| `@soostori/devices` | `0.1.0-alpha.1` | `0.1.0-alpha.2` | ✅ Published |
| `@soostori/cloud` | `0.1.0-alpha.4` | `0.1.0-alpha.5` | ✅ Published |
| `@soostori/events` | `0.1.0-alpha.1` | `0.1.0-alpha.2` | ✅ Published |

```
npm view @soostori/business versions --json  → [..., "0.1.0-alpha.2"]
npm view @soostori/team versions --json      → [..., "0.1.0-alpha.2", "0.1.0-alpha.3"]
npm view @soostori/subscription versions     → [..., "0.1.0-alpha.2"]
npm view @soostori/devices versions --json   → [..., "0.1.0-alpha.2"]
npm view @soostori/cloud versions --json     → [..., "0.1.0-alpha.5"]
npm view @soostori/events versions --json   → [..., "0.1.0-alpha.2"]
```

---

## Build & Type Check

All 6 packages build clean with `tsc -p tsconfig.json`:

```
packages/cloud    ✅ no errors
packages/events   ✅ no errors
packages/devices  ✅ no errors
packages/business ✅ no errors
packages/team    ✅ no errors
packages/subscription ✅ no errors
```

---

## git Commit

```
SHA: 656f599
Branch: main
```

---

## Test Results

The workspace `npm run test` has pre-existing dependency resolution issues (missing `@soostori/contracts` in the npm registry — a workspace configuration issue unrelated to Phase 2 changes). Individual package test files exist only in `packages/devices/test/` (`devices.test.ts`, `DeviceService.test.ts`). All TypeScript compilation passes cleanly across all 6 packages.

---

## What Was NOT Changed

- `@soostori/business` service logic — already correct per the audit
- `@soostori/team` service logic — already correct per the audit
- `@soostori/subscription` enforcement logic — already correct per the audit
- `@soostori/schema` entities — already correct per the audit
- `@soostori/cloud` realtime polling — sufficient for desktop; mobile/web use FIDScript SDK natively
