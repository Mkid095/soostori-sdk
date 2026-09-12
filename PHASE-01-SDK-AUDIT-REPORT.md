# PHASE-01-SDK-AUDIT-REPORT
## SDK Agent — Phase 1 Completion Report
**Date**: 2026-09-12
**Author**: SDK Agent
**Git Commit**: `dc8c7f7`

---

## Gaps Fixed

### GAP-01 — `StoredSession.employeeId/shopId/deviceId` always empty

**Location**: `packages/auth/src/cloud-auth.ts` — `_storeSession()` (lines 776–799)

**Problem**: `_storeSession()` set `employeeId`, `shopId`, and `deviceId` to `''` for all sessions regardless of what the API returned.

**Fix**: Added `employeeId`, `shopId`, `deviceId` as required parameters to `_storeSession()`, populated from API response data. Updated all call sites in `handleOAuthCallback()`, `signInWithGoogleIdToken()`, `signInWithEmail()`, and `completePasswordReset()`.

### GAP-02 — `GoogleSignInResult` missing identity fields

**Location**: `packages/auth/src/cloud-auth.ts` — `GoogleSignInResult` interface

**Problem**: `GoogleSignInResult` had no `employeeId`, `shopId`, or `deviceId` fields.

**Fix**: Added `employeeId: EmployeeId`, `shopId: ShopId`, `deviceId: DeviceId` to the interface. `_storeSession()` and all call sites updated accordingly.

### GAP-03 — `SignInResult` and `PasswordResetCompleteResult` missing identity fields

**Location**: `packages/auth/src/cloud-auth.ts` — `SignInResult`, `PasswordResetCompleteResult` interfaces

**Problem**: Both interfaces lacked `shopId` and `deviceId` (employeeId was present in `SignInResult` but not stored).

**Fix**: Added `shopId: ShopId` and `deviceId: DeviceId` to `SignInResult`; added `employeeId`, `shopId`, `deviceId` to `PasswordResetCompleteResult`. All `_storeSession()` call sites updated.

### GAP-04 — Cross-device PIN enrollment flow discarded `enrollmentToken`

**Location**: `packages/auth/src/operational-auth.ts` — `beginEnrollment()` (lines 425–452)

**Problem**: When `beginEnrollment()` was called with `PIN_SETUP_REQUIRED` state and a valid `pinVerificationProof`, it called `cloudApi.verifyPinForEnrollment()` which returned an `enrollmentToken`, but the code discarded it and returned only `{ nextState: 'PIN_SETUP_REQUIRED' }`. The caller could not pass the token to `completeEnrollmentWithCloudVerify()`, breaking the Section 10 cross-device enrollment critical path.

**Fix**: Updated the return type of `beginEnrollment()` to include `enrollmentToken?: string` in the success result. On successful PIN verification, the token is now returned to the caller. Test updated to assert `enrollmentToken: 'tok'` is present.

---

## Gaps Already Correct (No Changes Needed)

| # | Gap | Status |
|---|-----|--------|
| GAP-05 | Web platform export sufficient | Exports map covers `import CloudAuth from '@soostori/auth'` with browser and RN entries |
| GAP-06 | `FIDScriptAuthApiClient` — all AuthApiClient methods implemented | Verified: `exchangeGoogleCode`, `signInWithIdToken`, `registerEmail`, `verifyEmail`, `requestPasswordReset`, `completePasswordReset`, `signInEmail`, `refreshSession`, `revokeSession`, `registerTrustedDevice`, `listTrustedDevices`, `removeTrustedDevice`, `getDeviceStatus`, `createDeviceEnrollment`, `verifyPinForEnrollment`, `consumeEnrollmentToken`, `changePin`, `requestPinRecovery`, `verifyPinRecoveryCode`, `resetPin`, `listEnrolledDevices`, `revokeDevice`, `getSubscriptionStatus` — all present |
| A1.3 | `OperationalAuth` 14-method completeness | All 14 methods verified: `setupPin`, `verifyPin`, `changePin`, `hasPinEnrolled`, `clearPin`, `getEnrollmentState`, `beginEnrollment`, `completeEnrollmentWithCloudVerify`, `requestPinRecovery`, `verifyPinRecoveryCode`, `resetPinWithRecovery`, `isWithinOfflineEntitlement`, `isSessionExpired`, `serializeSession`/`deserializeSession` |
| A1.5 | AuthEvent system | All 8 event types verified in `AuthEvent` type: `SIGNED_IN`, `SIGNED_OUT`, `SESSION_REFRESHED`, `SESSION_EXPIRED`, `EMAIL_VERIFIED`, `DEVICE_REGISTERED`, `DEVICE_REVOKED`, `ERROR` |

---

## New Gaps Discovered

**None identified** during implementation.

---

## Remaining Known Gaps (Not Fixed This Phase — Require Architectural Decisions)

| Gap | Description | Blocking |
|-----|-------------|----------|
| GAP-07 | Web `package.json` uses `@soostori/auth: 0.1.0-alpha.5` — needs update to `^0.1.0-alpha.7` | Web agent brief |
| GAP-08 | Web uses Prisma/cookie auth instead of `@soostori/auth` `CloudAuth` | Ken decision required — see audit doc |

---

## NPM Publish

**Package**: `@soostori/auth`
**New version**: `0.1.0-alpha.7` (tagged `alpha`)
**Status**: Published successfully (`npm publish` exit 0, `+ @soostori/auth@0.1.0-alpha.7` confirmed in output)
**Propagation**: NPM registry may take a few minutes to reflect `0.1.0-alpha.7` in `npm view @soostori/auth versions`

---

## Tests

**Command**: `npx vitest run packages/auth/test/*.test.ts`
**Result**: ✅ 144/144 tests passing

| Test file | Tests |
|-----------|-------|
| `cloud-auth.test.ts` | 31 passed |
| `capabilities.test.ts` | 38 passed |
| `pin-compatibility.test.ts` | 14 passed |
| `auth.test.ts` | 14 passed |
| `operational-auth.test.ts` | 47 passed |

---

## Platform Version Requirements

| Platform | `@soostori/auth` version | Change |
|----------|------------------------|--------|
| Desktop | `^0.1.0-alpha.6` | No change (already ahead) |
| Mobile | `^0.1.0-alpha.6` | No change (already ahead) |
| Web | `0.1.0-alpha.5` | ⚠️ MUST update to `^0.1.0-alpha.7` (GAP-07) |

---

## Summary

Phase 1 SDK fixes are complete. `@soostori/auth@0.1.0-alpha.7` is published. Three critical data-population gaps (GAP-01/02/03) and one broken cross-device enrollment flow (GAP-04) are resolved. All 144 tests pass. GAP-07 (Web version) and GAP-08 (Web architectural decision) are documented for the next agents.
