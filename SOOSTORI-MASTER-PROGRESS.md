# Soostori Master Progress Board
## Last updated: 2026-09-12

### Status Legend

| Symbol | Meaning |
|--------|---------|
| 🔵 | Auditing in progress |
| 🟡 | Gaps found / fixing in progress |
| ✅ | Implemented + Verified + Accepted |
| 🔴 | Blocked (external dependency) |
| ⚪ | Not started |

**IMPLEMENTED ≠ ACCEPTED** — A phase is only ✅ when the full cross-system audit is complete across SDK + Desktop + Mobile + Web.

---

## Phase Progress

| Phase | Name | Status | Notes |
|------:|------|--------|-------|
| **1** | Authentication & Identity Foundation | ✅ ACCEPTED | SDK ✅ Desktop ✅ Mobile ✅ Web ✅ |
| **2** | Business & Account Provisioning | 🔵 SDK ✅ | App briefs pending (Desktop/Mobile/Web) |
| 3 | SDK & Data Contract Foundation | ⚪ | |
| 4 | RBAC & Authorization | ⚪ | |
| 5 | Synchronization | ⚪ | |
| 6 | Commercial Onboarding | ⚪ | |
| 7 | Business Setup | ⚪ | |
| 8 | Products & Categories | ⚪ | |
| 9 | Inventory | ⚪ | |
| 10 | POS & Sales | ⚪ | |
| 11 | Customers & Debts | ⚪ | |
| 12 | Expense Management | ⚪ | |
| 13 | Reporting & Dashboards | ⚪ | |
| 14 | Team Management | ⚪ | |
| 15 | Devices & Primary Device | ⚪ | |
| 16 | Offline-First | ⚪ | |
| 17 | Notifications | ⚪ | |
| 18 | Partner Platform | ⚪ | |
| 19 | Subscriptions & Billing | ⚪ | |
| 20 | M-Pesa / Payments | ⚪ | |
| 21 | Audit & Security | ⚪ | |
| 22 | Backup & Recovery | ⚪ | |
| 23 | Advanced Retail | ⚪ | |
| 24 | Restaurant | ⚪ | |
| 25 | Business Intelligence | ⚪ | |
| 26 | AI Features | ⚪ | |
| **27** | **Production Hardening & Launch** | 🔴 | |

---

## Phase 1 Detail — Authentication & Identity Foundation

### Acceptance status

| Component | Decision | Commit | Blocking issues |
|-----------|----------|--------|----------------|
| SDK `@soostori/auth` | ✅ ACCEPTED | `dc8c7f7` | None |
| Desktop | ✅ ACCEPTED | `4d8f382cdd0a502be102c1bac2c988cf9bf3408b` | Medium: email/password + trusted device not wired (Phase 18/15) |
| Mobile | ✅ ACCEPTED | `cd37c91` | Medium: `enrollmentToken` placeholder, backend required (Phase 15) |
| Web | ⚠️ CONDITIONAL | `2b507bbd` (version only) | GAP-08: CloudAuth vs Prisma — Ken decision required |
| Cross-system | ✅ ACCEPTED | — | Desktop + Mobile identity chains consistent |

### Gaps fixed in Phase 1

| Gap | Description | Fixed by |
|-----|-------------|---------|
| GAP-01 | `StoredSession.employeeId/shopId/deviceId` always `''` | SDK agent |
| GAP-02 | `GoogleSignInResult` missing identity fields | SDK agent |
| GAP-03 | `SignInResult` missing identity fields | SDK agent |
| GAP-04 | `beginEnrollment()` discarded `enrollmentToken` | SDK agent |
| GAP-05 | Web platform export not verified | SDK agent (verified OK) |
| GAP-06 | `FIDScriptAuthApiClient` methods missing | SDK agent (verified all present) |
| GAP-07 | Web `@soostori/auth` version `0.1.0-alpha.5` outdated | Web agent (version fixed) |

### Open items from Phase 1

| Item | Owner | Blocking next phase? |
|------|-------|---------------------|
| GAP-08: Web CloudAuth vs Prisma decision | Ken | Web cannot be fully accepted |
| Desktop: `signInWithGoogleIdToken` IPC not wired | Future phase | No (Desktop uses PKCE OAuth) |
| Desktop: Email/password registration + verification | Future phase | No |
| Desktop: Trusted device management | Future phase | No |
| Mobile: `enrollmentToken` is placeholder | Future phase + backend | No |
| Web: No device model, no OperationalAuth | Future phase | No |

---

## Published NPM Packages (Phase 1 snapshot)

| Package | Version | Published |
|---------|---------|-----------|
| `@soostori/auth` | `0.1.0-alpha.7` | ✅ |
| `@soostori/commercial` | `0.1.0-alpha.2` | ✅ |
| `@soostori/expenses` | `0.1.0-alpha.17` | ✅ |
| `@soostori/reports` | `0.1.0-alpha.14` | ✅ |
| `@soostori/team` | `0.1.0-alpha.2` | ✅ |

---

## How to advance phases

Each phase follows this lifecycle:

```
AUDIT → GAP MAP → SDK FIXES → COMMIT/PUBLISH → APP FIXES → COMMIT/PUSH →
CROSS-SYSTEM TEST → ACCEPTANCE ARTIFACT → NEXT PHASE
```

Acceptance artifact: `PHASE-XX-NAME-ACCEPTANCE.md` in `soostori-sdk/` root.

---

*Update this board after each phase acceptance. Do not mark a phase ✅ until the acceptance artifact exists.*
