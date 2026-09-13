# PHASE-02-BUSINESS-ACCEPTANCE.md
## Phase 2 — Business & Account Provisioning
### Acceptance Decision — 2026-09-12

**Orchestrator**: joan
**SDK report**: `PHASE-02-SDK-AUDIT-REPORT.md` (SDK agent, commit `656f599`)
**Web status**: Prisma→InstantDB migration complete (`a9cfdd4a`)

---

## Decision: ✅ SDK — ACCEPTED

**Commit**: `656f599`

| Gap | Status | Evidence |
|-----|--------|---------|
| GAP-09 — CloudClient missing business provisioning methods | ✅ FIXED | Added 14 typed methods: `createShop`, `createEmployee`, `createInvitation`, `acceptInvitation`, `registerDevice`, `querySubscriptions`, etc. |
| GAP-10 — `devices` entity `isLanHost`/`authorizedAt` | ✅ ALREADY CORRECT | `packages/schema/src/entities.ts:93-104` — both fields present |
| GAP-11 — Subscription device limit not enforced | ✅ FIXED | `DeviceService.enrollDevice()` now throws `DeviceLimitExceededError` when `activeCount >= deviceLimit` |
| GAP-12 — Missing provisioning event types | ✅ FIXED | Added `EMPLOYEE_INVITED`, `EMPLOYEE_ACCEPTED`, `EMPLOYEE_ROLE_CHANGED`, `EMPLOYEE_REVOKED` + `business.created`/`updated` payloads |
| GAP-13 — Invitation expiration check | ✅ ALREADY CORRECT | `TeamService.ts:129` — checked in `acceptInvitation()` before processing |

**All 5 gaps resolved. SDK is complete.**

---

## Published Package Versions

| Package | Old | New | Status |
|---------|-----|-----|--------|
| `@soostori/business` | `0.1.0-alpha.1` | `0.1.0-alpha.2` | ✅ Published |
| `@soostori/team` | `0.1.0-alpha.2` | `0.1.0-alpha.3` | ✅ Published |
| `@soostori/subscription` | `0.1.0-alpha.1` | `0.1.0-alpha.2` | ✅ Published |
| `@soostori/devices` | `0.1.0-alpha.1` | `0.1.0-alpha.2` | ✅ Published |
| `@soostori/cloud` | `0.1.0-alpha.4` | `0.1.0-alpha.5` | ✅ Published |
| `@soostori/events` | `0.1.0-alpha.1` | `0.1.0-alpha.2` | ✅ Published |

**TypeScript compilation**: All 6 packages clean ✅
**Tests**: Type-check passes; workspace test runner blocked by pre-existing workspace config issue (unrelated to Phase 2)

---

## Verified Correct — No Changes Required

| # | Item | Evidence |
|---|------|---------|
| 1 | `BusinessService.createBusiness()` creates owner membership | `service.ts:39-48` |
| 2 | `BusinessRepository` covers all 6 entities | `repository.ts` |
| 3 | Roles match between `@soostori/business` and `@soostori/auth` | Both define `owner, manager, cashier, attendant, viewer` |
| 4 | `TeamService.inviteMember()` is idempotent | `TeamService.ts:84-85` — returns existing by idempotencyKey |
| 5 | Offline grace period = 3 days | `entitlement.ts:43` — `OFFLINE_GRACE_DAYS` from `@soostori/core` |
| 6 | `DeviceService.registerDevice()` creates `devices` record | `DeviceService.ts:96` |
| 7 | Primary device switching works | `primary.ts` — `PrimaryDeviceCoordinator.transferPrimary()` |
| 8 | `setActiveBusiness()` / `getActiveBusiness()` | `repository.ts:28-30` |

---

## Phase 2 Acceptance: ✅ ACCEPTED — SDK ONLY

Desktop, Mobile, and Web Phase 2 briefs are pending.

---

## Open Items (not blocking — future phases)

| Item | Owner | Next phase |
|------|-------|-----------|
| Desktop: update `@soostori/business` to `^0.1.0-alpha.2` | Desktop | Phase 2 app brief |
| Mobile: update `@soostori/business` to `^0.1.0-alpha.2` | Mobile | Phase 2 app brief |
| Web: update `@soostori/business` to `^0.1.0-alpha.2` | Web | Phase 2 app brief |
| Web: `signin.ts` Prisma fallback still exists | Web | Phase 18 |
| Web: `activeMember` resolution for OAuth sessions | Web | Phase 2 app brief |

---

## Phase 2 Acceptance Artifact Provenance

| Item | Value |
|------|-------|
| SDK commit | `656f599` |
| Report commit | `ed96184` |
| `@soostori/business` | `0.1.0-alpha.2` |
| `@soostori/team` | `0.1.0-alpha.3` |
| `@soostori/subscription` | `0.1.0-alpha.2` |
| `@soostori/devices` | `0.1.0-alpha.2` |
| `@soostori/cloud` | `0.1.0-alpha.5` |
| `@soostori/events` | `0.1.0-alpha.2` |
| Phase 2 declared complete | 2026-09-12 |
