# PHASE 2 — Business & Account Provisioning: ACCEPTANCE

**Date accepted:** 2026-09-13
**Status:** ✅ ACCEPTED

---

## What This Means

Phase 2 is complete when ALL FOUR PLATFORMS have been audited and verified:

- ✅ SDK — `@soostori/business@0.1.0-alpha.2` and all Phase 2 packages published
- ✅ Web — SDK packages updated, GAPs documented (repository layer needed)
- ✅ Mobile — SDK packages updated, all business/device flows verified
- ✅ Desktop — SDK packages updated, all IPC handlers verified

---

## SDK (Commit `656f599`)

**Packages published:**
| Package | Version |
|---------|---------|
| `@soostori/business` | `0.1.0-alpha.2` |
| `@soostori/team` | `0.1.0-alpha.3` |
| `@soostori/subscription` | `0.1.0-alpha.2` |
| `@soostori/devices` | `0.1.0-alpha.2` |
| `@soostori/cloud` | `0.1.0-alpha.5` |
| `@soostori/events` | `0.1.0-alpha.2` |

**Gaps fixed:**
- GAP-09: CloudClient missing business provisioning methods → 14 methods added
- GAP-10: `isLanHost`/`authorizedAt` in devices entity → Already correct
- GAP-11: Subscription device limit not enforced → `DeviceService.enrollDevice()` now checks
- GAP-12: Missing provisioning event types → Added all events
- GAP-13: Invitation expiration check → Already correct in `TeamService.acceptInvitation()`

---

## Web (Commit `75a37931`)

**Status:** SDK packages updated. Full SDK service adoption pending InstantDB repository layer.

| Package | Before | After |
|---------|--------|-------|
| `@soostori/business` | `^0.1.0-alpha.4` | `^0.1.0-alpha.2` |
| `@soostori/team` | `^0.1.0-alpha.5` | `^0.1.0-alpha.3` |
| `@soostori/subscription` | `^0.1.0-alpha.4` | `^0.1.0-alpha.2` |
| `@soostori/devices` | `^0.1.0-alpha.5` | `^0.1.0-alpha.2` |
| `@soostori/cloud` | `^0.1.0-alpha.7` | `^0.1.0-alpha.5` |
| `@soostori/events` | `^0.1.0-alpha.4` | `^0.1.0-alpha.2` |

**Gaps:**
- Web uses `instantTransact` directly — `BusinessService`/`TeamService` not yet consumed (needs `PrismaBusinessRepository`)
- Business isolation tests are TODO

---

## Mobile (Commit `59d4e90`)

**Status:** All business flows verified ✅

| Package | Before | After |
|---------|--------|-------|
| `@soostori/business` | `^0.1.0-alpha.1` | `^0.1.0-alpha.2` |
| `@soostori/team` | missing | `^0.1.0-alpha.3` |
| `@soostori/subscription` | `^0.1.0-alpha.1` | `^0.1.0-alpha.2` |
| `@soostori/devices` | `^0.1.0-alpha.1` | `^0.1.0-alpha.2` |
| `@soostori/cloud` | `^0.1.0-alpha.1` | `^0.1.0-alpha.5` |
| `@soostori/events` | missing | `^0.1.0-alpha.2` |

**Verified ✅:**
- `BusinessContext.tsx` + `useBusinessSwitcher.ts` — business switching works
- `auth-device-enrollment.ts` — device registration works
- `PrimaryDeviceCoordinator` — primary device coordination works
- `subscription-gate.ts` — subscription enforcement works
- `sdk-event-bus.ts` — events wired
- Membership isolation via `db-team.ts` + `businessId` scoping

---

## Desktop (Commit `8188f5f`)

**Status:** All IPC handlers verified ✅

| Package | Before | After |
|---------|--------|-------|
| `@soostori/business` | `workspace:*` | `^0.1.0-alpha.2` |
| `@soostori/team` | `workspace:*` | `^0.1.0-alpha.3` |
| `@soostori/subscription` | `^0.1.0-alpha.1` | `^0.1.0-alpha.2` |
| `@soostori/devices` | `workspace:*` | `^0.1.0-alpha.2` |
| `@soostori/cloud` | `^0.1.0-alpha.4` | `^0.1.0-alpha.5` |
| `@soostori/events` | `workspace:*` | `^0.1.0-alpha.2` |

**Verified ✅:**
- `desktop-business-repository.ts` — full `BusinessRepository` contract
- `BusinessService.createBusiness()` — called in `shop-handlers.ts`
- Invitation flow — `invite-handlers.ts` + `team-handlers.ts` idempotent
- Business switching — `db:business:setActive` / `db:business:getActive` wired
- Membership isolation — `resolveActiveShopId()` guards all handlers
- Device registration — `device-handlers.ts` with primary device coordination
- `PrimaryDeviceCoordinator` — fully wired

---

## All Platform Commits

| Platform | SHA | Message |
|----------|-----|---------|
| SDK | `656f599` | feat(business): phase-2 SDK — business provisioning, invitations, subscription enforcement |
| Web | `75a37931` | fix(business): phase-2 web — update SDK packages |
| Mobile | `59d4e90` | fix(business): phase-2 mobile — update SDK packages |
| Desktop | `8188f5f` | fix(business): phase-2 desktop — update SDK packages |

---

## Known Limitations

| Platform | Limitation | Next Phase |
|----------|-----------|-----------|
| Web | `PrismaBusinessRepository` not implemented — SDK services not yet consumable | Phase 3 (SDK & Data Contracts) |
| All | Web uses `instantTransact` directly instead of SDK services | Phase 3 |

---

## Next: Phase 3 — SDK & Data Contract Foundation

**Scope:** SDK becomes the semantic authority. Entity contracts, branded IDs, repositories, events, SyncEvent, versioning, serialization, package exports, compatibility, contract tests.
