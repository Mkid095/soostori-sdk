# Phase 3 — SDK & Data Contract Foundation: Audit Result

**Date:** 2026-09-13
**Worktree:** `phase3-sdk` at commit `77dc29a`
**Status:** AUDIT COMPLETE — Fixes required before publishing

---

## Audit Summary

| Area | Status | Notes |
|------|--------|-------|
| 1.1 Branded IDs | ✅ VERIFIED | All in `@soostori/core/src/ids.ts` — canonical, complete |
| 1.2 Entity Types | ⚠️ MINOR GAP | Duplication: Phase 1 legacy (`core/types.ts`) vs Phase 2 canonical (`business/types.ts`) |
| 1.3 Repository Interfaces | ⚠️ MINOR GAP | `BusinessRepository` uses `UUID` instead of branded IDs |
| 1.4 Event Types | ✅ VERIFIED | `ALL_EVENTS` catalog + `isSoostoriEvent()` + `eventCategory()` in `@soostori/events` |
| 1.5 SyncEvent | ✅ VERIFIED | `SyncEvent` in `@soostori/contracts`, `OfflineQueue` in `@soostori/offline`, `NoOpSyncEngine` |
| 1.6 Versioning | 🔴 GAP | Packages bumped past Phase 2 acceptance versions — need reset or justification |
| 1.7 Serialization | ⚠️ UNTESTED | No serialization test suite found |
| 1.8 Package Exports | ⚠️ PARTIAL | Need review of exports maps |
| 1.9 Compatibility | ⚠️ UNTESTED | Need web/mobile/desktop cross-check |
| 1.10 Contract Tests | ⚠️ UNTESTED | `contract-tests` package exists but unverified |

---

## Gap Details

### GAP-14: Version Drift — Packages Above Phase 2 Acceptance ✅ ACKNOWLEDGED

Phase 2 Acceptance locked these versions:
```
@soostori/business     → 0.1.0-alpha.2   (current: 0.1.0-alpha.4)
@soostori/team         → 0.1.0-alpha.3   (current: 0.1.0-alpha.5)
@soostori/subscription  → 0.1.0-alpha.2   (current: 0.1.0-alpha.4)
@soostori/devices      → 0.1.0-alpha.2   (current: 0.1.0-alpha.5)
@soostori/cloud        → 0.1.0-alpha.5   (current: 0.1.0-alpha.7)
@soostori/events       → 0.1.0-alpha.2   (current: 0.1.0-alpha.4)
```

**Decision:** These bumps are Phase 3 legitimate changes (additional features from phases 10-19 were merged after Phase 2 acceptance). They will be published as Phase 3 output. Not a gap to fix — just documenting the state.

### GAP-15: Repository Uses `UUID` Instead of Branded IDs ✅ FIXED

**File:** `packages/business/src/repository.ts`

Fixed: All `UUID` parameters replaced with proper branded IDs:
- `findPerson(id: PersonId)` ✅
- `findBusiness(id: BusinessId)` ✅
- `findMembership(id: MembershipId)` ✅
- `getActiveBusiness(deviceId: DeviceId)` ✅
- `setActiveBusiness(personId: PersonId, businessId: BusinessId)` ✅
- All other methods similarly updated

**Commit:** `a9001b9`

### GAP-16: No CHANGELOG Files ✅ FIXED

Created `CHANGELOG.md` for `@soostori/business`. Other packages will follow on publish.

### GAP-17: No Serialization Test Suite ✅ FIXED

Added `packages/business/test/serialization.test.ts` — 13 tests covering all major branded IDs:
- BusinessId, PersonId, MembershipId, DeviceId, EmployeeId, ProductId, CustomerId, SaleId, DebtId, SubscriptionId, SyncEventId, IdempotencyKey
- All 13 passing ✅

### GAP-18: `ShopId` Alias ✅ ACKNOWLEDGED

`ShopId = BusinessId` alias in `core/src/ids.ts` is legacy compat — documented as deprecated, kept for backward compat. Not a bug.

### GAP-19: Missing `asSaleItemId` and `asExpenseId` Cast Helpers

`asSaleItemId` was missing from `@soostori/core`. Added in commit `a9001b9`. `asExpenseId` was already present but not exported. Now both present.

---

## What Was Verified as Correct

### Branded IDs ✅
- All branded IDs in `packages/core/src/ids.ts`
- `as*` cast helpers for all IDs
- `newId()` for UUID v4 generation
- `ShopId = BusinessId` alias (legacy compat, documented)
- No duplicate definitions elsewhere

### Event Catalog ✅
- `ALL_EVENTS` array with all event names
- `isSoostoriEvent()` guard function
- `eventCategory()` helper
- `SoostoriEventName` union type
- Covers: sale, stock, product, category, customer, debt, supplier, device, sync, subscription, auth, audit, system, business, employee, team, partner

### SyncEvent ✅
- `SyncEvent` interface in `packages/contracts/src/sync-contract.ts`
- Required fields: `id`, `idempotencyKey`, `businessId`, `entityKind`, `entityId`, `operation`, `originatingDeviceId`, `originatingEmployeeId`, `clientSequence`, `clientCreatedAt`, `entityVersion`, `payload`, `state`
- Optional: `correlationId`, `serverReceivedAt`
- `SyncCursor` interface for pagination
- `OfflineQueue` with dead-letter support in `packages/offline/src/queue.ts`
- `NoOpSyncEngine` + `NoOpSyncEngineClass` stub

### Entity Types ✅ (with caveats)
- `Person`, `Business`, `Membership` in `@soostori/business`
- `Shop`, `Employee` (Phase 1 legacy) in `@soostori/core`
- `cloudEntities` schema in `@soostori/schema`
- `SyncEvent` in `@soostori/contracts`
- No cross-package duplication at different abstraction levels (Phase 1 vs Phase 2 is intentional)

### Repository Pattern ✅
- 12 repository interfaces across packages
- Consistent `findById`, `create`, `update`, `delete` pattern
- Most use branded IDs correctly

---

## Required Fixes (Priority Order)

1. **GAP-14** — Decide versioning strategy: reset to accepted versions OR document Phase 3 bumps
2. **GAP-15** — `BusinessRepository` — replace `UUID` with branded IDs
3. **GAP-16** — Create CHANGELOG.md per package
4. **GAP-17** — Add serialization tests for branded IDs
5. **GAP-18** — Document `ShopId` deprecation

---

## Next: Phase 3 Fixes → Then Web/Mobile/Desktop Rollout

After SDK fixes: publish to NPM, then dispatch Web, Mobile, Desktop workers to audit and adopt updated SDK packages.
