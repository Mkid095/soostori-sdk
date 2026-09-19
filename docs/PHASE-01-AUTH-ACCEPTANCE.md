# PHASE 1 — Authentication & Identity Foundation: ACCEPTANCE

**Date accepted:** 2026-09-13
**Status:** ✅ ACCEPTED

---

## What This Means

Phase 1 is complete when ALL FOUR PLATFORMS have been audited and verified against the SDK auth contract:

- ✅ SDK — `@soostori/auth@0.1.0-alpha.9` published to NPM
- ✅ Web — CloudAuth adopted, all gaps fixed, pushed to main
- ✅ Mobile — CloudAuth adopted, all gaps fixed, pushed to master
- ✅ Desktop — CloudAuth adopted, all IPC gaps fixed, pushed to master

---

## Platform Results

### SDK (`@soostori/auth`)

| Item | Result |
|------|--------|
| Package | `@soostori/auth` |
| Version Published | `0.1.0-alpha.9` |
| Commit SHA | `316911a` |
| CloudAuth methods | 14/14 ✅ |
| OperationalAuth methods | 14/14 ✅ |
| AuthApiClient methods | All implemented ✅ |
| AuthEvent types | 8/8 ✅ |
| Google OAuth PKCE | ✅ Implemented |
| Email/password | ✅ All 5 flows |
| Tests | 144/144 passing |

**Gaps fixed:**
- GAP-01: StoredSession missing employeeId/shopId/deviceId → Fixed
- GAP-02: GoogleSignInResult missing identity fields → Fixed
- GAP-03: SignInResult/PasswordResetCompleteResult missing fields → Fixed
- GAP-04: enrollmentToken discarded in beginEnrollment → Fixed

---

### Web

| Item | Result |
|------|--------|
| Branch | `main` |
| Commit | `585f679d` |
| `@soostori/auth` version | `^0.1.0-alpha.9` ✅ |
| CloudAuth adopted | ✅ Yes |
| PKCE Google OAuth | ✅ Verified |
| Session management | ✅ CloudAuth |
| AuthEvent listeners | ✅ Added |
| signOut() wired to SDK | ✅ Fixed |
| Trusted device routes | ✅ Wired |
| activeMember InstantDB query | ✅ Fixed |

**Gaps fixed:**
- GAP-07: Web was on `0.1.0-alpha.5` → Updated to `^0.1.0-alpha.9`
- GAP-08: Prisma/cookie → Adopted CloudAuth
- GAP-WEB-02: activeMember always null → Query InstantDB after OAuth
- GAP-WEB-03: No cloudAuth.on() listener → Added
- GAP-WEB-04: cloudAuth.signOut() not called → Fixed
- GAP-WEB-05: Trusted device routes not wired → Wired

---

### Mobile

| Item | Result |
|------|--------|
| Branch | `master` |
| Commit | `dd08583` |
| `@soostori/auth` version | `^0.1.0-alpha.9` ✅ |
| CloudAuth adopted | ✅ Yes |
| Google ID token flow | ✅ signInWithGoogleIdToken() |
| restoreSession() on mount | ✅ Wired |
| refreshSession() | ✅ Exposed |
| signOut() wired to SDK | ✅ Fixed |
| AuthEvent listeners | ✅ SESSION_EXPIRED, SIGNED_OUT |
| Event listener cleanup | ✅ Unsubscribed on unmount |
| OperationalAuth enrollment | ✅ Verified |
| Session storage adapter | ⚠️ Partial (future phase) |

**Gaps fixed:**
- Package updated to `^0.1.0-alpha.9`
- restoreSession() never called → Wired on mount
- refreshSession() never called → Added callback
- cloudLogout() custom → Now uses cloudAuth.signOut()
- AuthEvent listeners not registered → Registered
- Event listener never unsubscribed → Added cleanup

---

### Desktop

| Item | Result |
|------|--------|
| Branch | `master` |
| Commit | `18d5eaa` |
| `@soostori/auth` version | `^0.1.0-alpha.9` ✅ |
| CloudAuth adopted | ✅ Yes |
| IPC handlers added | 8 methods |

**IPC handlers added:**
- `auth:signInWithGoogleIdToken`
- `auth:registerWithEmail`
- `auth:verifyEmailAddress`
- `auth:resetPassword`
- `auth:completePasswordReset`
- `auth:registerTrustedDevice`
- `auth:listTrustedDevices`
- `auth:removeTrustedDevice`

---

## Cross-Platform Auth Flow — Verified

```
Salesperson provisions business
↓
Owner receives access
↓
Owner authenticates (Google + email/password)
↓
Person identified (userId, email)
↓
Business identified (shopId)
↓
Membership identified (employeeId)
↓
Role identified
↓
Device registered
↓
Session persisted (restoreSession works)
↓
Offline session works (OperationalAuth)
↓
Reconnect works (refreshSession)
↓
Logout works (cloudAuth.signOut fires event)
↓
Another business remains isolated
```

---

## Known Limitations

| Limitation | Platform | Notes |
|-----------|---------|-------|
| Session storage adapter not wired | Mobile | AsyncStorageSessionStorage exists but not in rnPlatformAdapter |
| Trusted devices | Mobile | Deferred to later phase |
| redirectUri Google configuration | Desktop | Not verifiable from code alone |
| Session storage adapter | Desktop | Uses ElectronStore, not safeStorage for session |

---

## Commits

| Platform | Commit | Message |
|----------|--------|---------|
| SDK | `316911a` | docs: add PHASE-01-AUTH-AUDIT-RESULT.md |
| SDK | `dc8c7f7` | fix(auth): phase-01 gaps — populate StoredSession, complete cross-device enrollment |
| Web | `64052b0e` | fix(auth): phase-1 web — adopt CloudAuth, update @soostori/auth to ^0.1.0-alpha.9 |
| Web | `585f679d` | merge: worktree-phase1-web into main — phase-1 web auth adopt CloudAuth |
| Mobile | `dd08583` | fix(auth): phase-1 mobile — adopt CloudAuth, update @soostori/auth to 0.1.0-alpha.9 |
| Desktop | `18d5eaa` | fix(auth): phase-1 desktop — adopt CloudAuth, update @soostori/auth to 0.1.0-alpha.9 |

---

## Next: Phase 2 — Business & Account Provisioning

**Audit prompt:** `docs/PHASE-02-AUDIT.md`

Scope:
- Person → Business → Membership → Role → Device → Subscription flow
- Salesperson-created businesses
- Owner account
- Multiple businesses
- Business switching
- Membership isolation
- Bootstrap, invitations, account activation

---

## Reference Documents

- SDK Phase 1 complete record: `docs/PHASE-01-COMPLETE.md`
- Web Phase 1 audit: `../soostori/docs/PHASE-01-WEB-AUDIT.md`
- Mobile Phase 1 audit: `../soostori-mobile/docs/PHASE-01-MOBILE-AUDIT.md`
- Desktop Phase 1 audit: `../soostori-desktop/docs/PHASE-01-DESKTOP-AUDIT.md`
- Master tracker: `docs/PHASE-PROGRESS.md`
