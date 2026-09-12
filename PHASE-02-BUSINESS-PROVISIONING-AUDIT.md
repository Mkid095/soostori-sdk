# PHASE 2 — BUSINESS & ACCOUNT PROVISIONING
## SDK Audit Brief v1.0 — 2026-09-12

**Author**: joan (orchestrator)
**Status**: 🔵 AUDIT IN PROGRESS
**This document is**: The prompt for the SDK agent
**Acceptance artifact**: `PHASE-02-BUSINESS-ACCEPTANCE.md` (produced after all fixes verified)

---

## What this document is

The SDK agent reads this file, audits the current SDK state against the canonical vision for Phase 2, identifies gaps, fixes them, commits, and publishes to NPM.

After the SDK agent completes, Desktop/Mobile/Web agents each receive their Phase 2 brief.

---

## How Phase 2 works

```
SDK agent reads this document
         ↓
Audits @soostori/business, @soostori/team, @soostori/subscription,
       @soostori/devices, @soostori/cloud, @soostori/schema
         ↓
Identifies gaps vs. canonical vision
         ↓
Fixes gaps in SDK packages
         ↓
Commits + pushes + publishes to NPM
         ↓
Desktop/Mobile/Web agents receive Phase 2 briefs
         ↓
CROSS-SYSTEM INTEGRATION TEST
         ↓
PHASE 2 ACCEPTED
```

---

## The vision: complete business provisioning chain

```
Person authenticated (from Phase 1)
     │
     ▼
  createBusiness()  ──► Business created (shops entity)
     │
     ▼
  Owner Membership created (role: owner, status: active)
     │
     ▼
  Subscription bootstrapped (free/trial plan)
     │
     ▼
  Device registered (devices entity)
     │
     ▼
  inviteEmployee()  ──► Invitation sent (email/phone + 6-digit code)
     │
     ▼
  acceptInvitation()  ──► Membership created (status: invited → active)
     │
     ▼
  updateMemberRole()  ──► Role updated (owner/manager/cashier/attendant/viewer)
     │
     ▼
  revokeMember()  ──► Membership status: revoked
```

**Core rule**: One subscription = one business. Each Business is fully isolated.

---

## Current SDK Package Versions

| Package | Version | Status |
|---------|---------|--------|
| `@soostori/business` | `0.1.0-alpha.1` | Audit |
| `@soostori/team` | `0.1.0-alpha.2` | Audit |
| `@soostori/subscription` | `0.1.0-alpha.1` | Audit |
| `@soostori/devices` | `0.1.0-alpha.1` | Audit |
| `@soostori/cloud` | `0.1.0-alpha.4` | Audit |
| `@soostori/schema` | (schema only) | Audit |

---

## PART A — @soostori/business Audit

**Read first**: `packages/business/src/types.ts`, `packages/business/src/repository.ts`, `packages/business/src/service.ts`

### A1 — BusinessService completeness

Verify `BusinessService` implements every operation in the vision:

| Method | Purpose | Expected behavior |
|--------|---------|------------------|
| `createBusiness()` | Create business + auto owner membership | Creates `shops` record + `employees` record with role=owner |
| `inviteEmployee()` | Invite person to business | Creates `invitations` record with 6-digit code, status=pending |
| `acceptInvitation()` | Accept invitation | Updates `employees` status from invited→active, marks `invitations` accepted |
| `revokeEmployee()` | Revoke access | Sets `employees` status to revoked |
| `updateMemberRole()` | Change role | Updates `employees.role` |
| `getPersonMemberships()` | Get all businesses for a person | Returns PersonMemberships |
| `setActiveBusiness()` | Switch active business context | Sets which business is current |
| `getActiveBusiness()` | Get current active business | Returns active Business or null |

### A2 — One business per subscription rule

**CRITICAL**: `createBusiness()` must enforce one active subscription per business. Verify this is documented or enforced in the service.

### A3 — Invitation lifecycle

The invitation flow must be correct:
- 6-digit join code generated (or from InstantDB)
- `expiresAt` set (e.g., 7 days)
- Status transitions: `pending → accepted` or `pending → expired`
- Idempotency: duplicate invite for same email within same business returns existing invitation

Audit `packages/team/src/TeamService.ts` for the invitation flow.

### A4 — Repository interface completeness

`BusinessRepository` must cover all entities:
- `persons` — Person records
- `shops` — Business/Shop records
- `employees` — Membership records (person + shop + role)
- `invitations` — Invite records
- `subscriptions` — Subscription records
- `devices` — Device records

Verify that `repository.ts` has all required methods. If a repository method is missing, add it.

### A5 — Brand ID types

Every `find`/`create`/`update` method must use branded ID types (`BusinessId`, `PersonId`, `EmployeeId`, `DeviceId`) from `@soostori/core` — not raw `string`.

Audit `repository.ts` and `service.ts` for any raw `string` ID parameters.

---

## PART B — @soostori/team Audit

**Read first**: `packages/team/src/types.ts`, `packages/team/src/TeamService.ts`

### B1 — TeamInvitation lifecycle

Verify this exact lifecycle:
```
PENDING → (acceptInvitation) → ACCEPTED
PENDING → (expiresAt passes) → EXPIRED
PENDING → (owner revokes) → REVOKED
```

The status must be an enum: `'pending' | 'accepted' | 'expired'`

### B2 — TeamService operations

| Method | Purpose |
|--------|---------|
| `inviteMember()` | Send invitation |
| `acceptInvitation()` | Accept invitation |
| `resendInvitation()` | Resend with new code |
| `revokeInvitation()` | Cancel pending invitation |
| `updateMemberRole()` | Change role |
| `removeMember()` | Remove from business |
| `listMembers()` | List all members of a business |
| `getMemberPermissions()` | Get capabilities for a member |

Audit that all these are implemented and correct.

### B3 — Role consistency with @soostori/auth

The roles defined in `@soostori/business` (`owner`, `manager`, `cashier`, `attendant`, `viewer`) must match the roles in `@soostori/auth`'s `permissions.ts`.

Audit `packages/auth/src/permissions.ts` and verify roles match exactly.

### B4 — Idempotency

`inviteMember()` must be idempotent. Same email + business + role = returns existing invitation, does not create duplicate.

---

## PART C — @soostori/subscription Audit

**Read first**: `packages/subscription/src/entitlement.ts`, `packages/subscription/src/enforcement.ts`, `packages/subscription/src/cache.ts`

### C1 — Subscription entitlement model

The subscription entitlement must be computed from `subscriptions` entity:

```
Shop (business)
  └── Subscription (plan, status, currentPeriodEnd, deviceLimit)
        └── Plan (key, name, deviceLimit, features)
```

Verify the `SubscriptionEntitlement` type in `@soostori/core` covers: `shopId`, `status`, `plan`, `expiresAt`, `deviceLimit`, `verifiedAt`, `serverTime`, `nextVerificationDeadline`.

### C2 — Offline grace period

Verify: when offline, the cached entitlement is used with a 3-day grace period (from `@soostori/core`: `OFFLINE_GRACE_DAYS`).

After grace period expires, POS operations must be blocked.

Audit `enforcement.ts` — what happens when entitlement is expired? What operations are blocked?

### C3 — Subscription state machine

```
FREE/TRIAL → (payment) → ACTIVE → (expiry) → EXPIRED → (grace) → BLOCKED
ACTIVE → (payment failed) → PAST_DUE → (retry) → ACTIVE
ACTIVE → (cancellation) → CANCELLED
```

Verify `subscription/enforcement.ts` implements this state machine.

### C4 — Cache invalidation

When does the subscription cache get invalidated?
- On reconnect after offline
- On subscription change webhook from payment provider
- On business switch

Audit `cache.ts` and `enforcement-sync.ts`.

---

## PART D — @soostori/devices Audit

**Read first**: `packages/devices/src/DeviceService.ts`, `packages/devices/src/primary.ts`, `packages/devices/src/types.ts`

### D1 — Device registration

Verify the device registration flow:
1. On first cloud sign-in, device record created in `devices` entity
2. `deviceId` generated, stored locally, associated with this device
3. `devices` entity has: `id`, `shopId`, `deviceName`, `deviceType`, `status`, `isLanHost`, `authorizedAt`, `lastSeenAt`

Audit `packages/schema/src/entities.ts` — `devices` entity fields must match what `DeviceService` expects.

### D2 — Primary device model

The Primary Device is the LAN authority for stock mutations. Verify:
- `primary.ts` — `PrimaryDeviceManager` or equivalent
- Only Primary Device can approve stock mutations on LAN
- `isLanHost: true` marks the Primary Device
- `getPrimaryDevice(shopId)` — returns the current Primary Device or null

### D3 — Device limit enforcement

The subscription's `deviceLimit` must be enforced at device registration time:
- If `currentDeviceCount >= deviceLimit`, new device registration is rejected
- The count is: number of `devices` rows with `shopId` and `status: active`

Audit `enforcement.ts` in subscription package — does it check device count?

---

## PART E — @soostori/cloud Audit

**Read first**: `packages/cloud/src/client.ts`

### E1 — FIDScript REST API coverage

The `CloudClient` must expose methods for all business provisioning operations:

| Operation | Expected CloudClient method |
|-----------|---------------------------|
| Query persons | `queryPersons()` |
| Create shop | `createShop()` |
| Update shop | `updateShop()` |
| Create employee | `createEmployee()` |
| Update employee | `updateEmployee()` |
| Create invitation | `createInvitation()` |
| Accept invitation | `acceptInvitation()` |
| Query subscriptions | `querySubscriptions()` |
| Register device | `registerDevice()` |
| Query devices | `queryDevices()` |

Audit `packages/cloud/src/client.ts` for ALL these methods. If any are missing, add them.

### E2 — Real-time subscriptions (reconnect on change)

Cloud operations that affect business provisioning (new employee, role change, invitation accepted) should trigger sync events. Verify `packages/cloud/src/realtime.ts` has handlers for these entity changes.

---

## PART F — @soostori/schema Audit

**Read first**: `packages/schema/src/entities.ts`

### F1 — Complete entity audit

Verify ALL these entities exist with the correct fields:

**Identity & People**:
```
$users      — cloud user (email, type)
persons     — Person records (cloudUserId, email, displayName, phone)
```

**Business & Membership**:
```
shops       — Business (name, slug, taxRate, plan, subscriptionExpiry, status, currency, ownerPersonId)
employees   — Membership (shopId, personId, name, email, role, status, invitedBy)
invitations — Invitation (shopId, email, employeeRole, code, status, expiresAt, createdAt)
```

**Subscription**:
```
subscriptions — Subscription (shopId, planId, planKey, status, billingCycle, currentPeriodEnd, deviceLimit)
plans         — Plan (key, name, priceMonthly, priceYearly, deviceLimit, features)
```

**Device**:
```
devices — Device (shopId, deviceName, deviceType, status, isLanHost, authorizedAt, lastSeenAt)
```

**Sync**:
```
syncEvents   — SyncEvent (shopId, deviceId, entity, entityId, operation, payload, syncedAt)
syncStatus   — SyncStatus (shopId, lastSyncAt, pendingEvents, deviceCount)
```

### F2 — Required vs optional fields

Every required field must be marked `required: true`. Audit all entities in `cloudEntities` for missing `required: true` declarations.

### F3 — Sync events

Every business provisioning operation must emit a `SyncEvent`:
- `business.created`
- `employee.invited`
- `employee.accepted`
- `employee.role_changed`
- `employee.revoked`
- `subscription.activated`
- `subscription.expired`
- `device.registered`
- `device.primary_changed`

Verify `packages/events/src/` has all these event types defined.

---

## PART G — Cross-System Flow Audit

### G1 — Complete provisioning flow (end-to-end)

After Phase 1 auth, verify this flow works:

```
1. cloudAuth.signInWithGoogle() → Person identified (userId from $users)
2. BusinessService.createBusiness({ name, slug, ownerPersonId })
   → shops record created
   → employees record created (role: owner)
   → subscription bootstrapped (status: trialing)
   → syncEvent: business.created
3. DeviceService.registerDevice({ shopId, deviceName, deviceType })
   → devices record created
   → syncEvent: device.registered
4. BusinessService.inviteEmployee({ businessId, email, role })
   → invitations record created (6-digit code, expiresAt)
   → syncEvent: employee.invited
5. (Invite accepted — invitee flow)
6. TeamService.updateMemberRole({ membershipId, role })
   → employees.role updated
   → syncEvent: employee.role_changed
7. TeamService.removeMember({ membershipId })
   → employees.status = revoked
   → syncEvent: employee.revoked
```

Audit that every step in this flow is covered by SDK methods.

### G2 — Business switching

A person with multiple businesses must be able to switch between them:

```typescript
await BusinessService.setActiveBusiness(personId, businessId)
// All subsequent operations use the active business context
```

Verify `setActiveBusiness()` and `getActiveBusiness()` work correctly and are isolated per session.

### G3 — Membership isolation

Data from Business A must NEVER leak into Business B sessions. This is enforced by:
- Every query includes `shopId` filter
- Local InstantDB is scoped by `shopId`
- CloudClient calls include `shopId` in request path

Audit: verify `BusinessRepository` implementations include `shopId` in every query.

---

## PART H — FIX MANDATE

### MUST FIX (block Phase 2 acceptance)

| Gap | Description | Location |
|-----|-------------|----------|
| GAP-09 | Missing CloudClient methods for business provisioning operations | `packages/cloud/src/client.ts` |
| GAP-10 | `devices` entity missing `isLanHost` or `authorizedAt` fields | `packages/schema/src/entities.ts` |
| GAP-11 | Subscription device limit not enforced at device registration | `packages/subscription/src/enforcement.ts` |
| GAP-12 | Missing SyncEvent types for all provisioning operations | `packages/events/src/` |
| GAP-13 | `invitations.expiresAt` field exists but expiration check missing | `packages/team/src/TeamService.ts` |

### MUST VERIFY (already implemented, confirm still works)

| # | Item | Evidence |
|---|------|---------|
| 1 | `BusinessService.createBusiness()` creates owner membership | `service.ts:25-60` |
| 2 | `BusinessRepository` covers all 6 entities | `repository.ts` |
| 3 | Roles match between `@soostori/business` and `@soostori/auth` | `packages/auth/src/permissions.ts` vs `packages/business/src/types.ts` |
| 4 | `TeamService.inviteMember()` is idempotent | `TeamService.ts` |
| 5 | Offline grace period = 3 days | `packages/subscription/src/entitlement.ts` |
| 6 | `DeviceService.registerDevice()` creates `devices` record | `packages/devices/src/DeviceService.ts` |
| 7 | Primary device switching works | `packages/devices/src/primary.ts` |
| 8 | `setActiveBusiness()` / `getActiveBusiness()` implement business isolation | `service.ts` |

---

## PART I — COMMIT AND PUBLISH

After all fixes are verified:

```bash
# 1. Update CHANGELOG.md

# 2. Bump versions in each changed package:
#    @soostori/business    → 0.1.0-alpha.2
#    @soostori/team         → 0.1.0-alpha.3
#    @soostori/subscription → 0.1.0-alpha.2
#    @soostori/devices      → 0.1.0-alpha.2
#    @soostori/cloud        → 0.1.0-alpha.5

# 3. Commit
git add .
git commit -m "feat(business): phase-2 SDK — business provisioning, invitations,
         subscription enforcement, device registration, sync events"

# 4. Push
git push origin main

# 5. Publish all changed packages to NPM
#    (verify each with npm view @soostori/<pkg>/version after publish)
```

---

## OUTPUT

After completing this work, produce `PHASE-02-SDK-AUDIT-REPORT.md` in the SDK root containing:
- Which gaps were fixed (GAP-09 through GAP-13)
- Which were already correct
- Final published package versions
- npm view output confirming each new version
- git commit SHA
- Test results (run: `cd packages/business && npm test && cd ../team && npm test && cd ../subscription && npm test && cd ../devices && npm test && cd ../cloud && npm test`)
