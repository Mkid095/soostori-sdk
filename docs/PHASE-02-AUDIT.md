# Phase 2 — Business & Account Provisioning: SDK Audit Prompt

**Phase:** 2 of 27
**Platform:** SDK (semantic authority)
**Goal:** Audit the business/account provisioning contract in the SDK, identify gaps, fix them, publish to NPM, and report evidence.

---

## Prerequisites

Before making any changes, read these files:
- `.claude/CLAUDE.md`
- `.ai/coding-rules.md`
- `.ai/project-manifest.md`
- `.ai/review-checklist.md`
- `docs/ARCHITECTURE.md`
- `docs/PHASE-01-COMPLETE.md` (Phase 1 acceptance — context)

---

## Context: What Phase 1 Established

Phase 1 established the auth foundation:
- `@soostori/auth@0.1.0-alpha.9` published
- Identity fields: `userId`, `email`, `employeeId`, `shopId`, `deviceId`
- CloudAuth + OperationalAuth fully implemented

Phase 2 builds on that: the Person → Business → Membership → Role → Device → Subscription flow.

---

## Part 1: Audit — What Is the Current Business/Account Contract?

Answer these questions by reading the SDK source code:

### 1.1 Business Entity

- What is the `Business` type? What fields does it have?
- Is there a `Shop` entity or is it the same as Business?
- How are `ShopId` and `BusinessId` branded IDs defined?
- What repository interfaces exist for business/shop?

### 1.2 Person Entity

- What is the `Person` type? What fields?
- How does Person relate to User/Identity?
- What repository interfaces exist for Person?

### 1.3 Membership Entity

- What is the `Membership` or `ShopMember` type?
- What fields? (personId, businessId, role, status, etc.)
- How does Membership link Person to Business?
- What repository interfaces exist?

### 1.4 Role System

- What roles exist? (Owner, Manager, Cashier, Attendant, Viewer?)
- Are platform roles defined separately? (Admin, Admin Team, Salesperson, Influencer?)
- How are roles enforced in the SDK vs in each app?

### 1.5 Device Entity

- What is the `Device` type?
- How does Device link to Business and Membership?
- What repository interfaces exist?

### 1.6 Subscription Entity

- What is the `Subscription` type?
- What fields? (businessId, plan, status, startDate, endDate, etc.)
- How does it link to Business?
- What repository interfaces exist?

### 1.7 Business Provisioning Flow

- How does a salesperson create a business?
- How is the owner account created/provisioned?
- Is there a `createBusiness()` or `provisionBusiness()` SDK method?
- What is the bootstrap flow? (new business → create shop → create owner membership)

### 1.8 Invitations

- Is there an invitation system?
- How are invitations sent and accepted?
- How does `acceptInvitation()` work in the SDK?

### 1.9 Business Switching

- Can a person have multiple businesses?
- Is there a `switchBusiness()` or `setActiveBusiness()` SDK method?
- How is the active business tracked?

### 1.10 Membership Isolation

- Are SDK methods scoped to the active business?
- Can data from one business leak into another?
- Are all SDK queries filtering by `shopId` / `businessId`?

### 1.11 Published Package

- What is the `@soostori/business` package version?
- What does it export?
- Does the published package export everything documented above?

---

## Part 2: Gap Analysis

For each of the areas above, identify:

1. **Missing** — feature is absent and needs to be implemented
2. **Inconsistent** — feature exists but differs from what consuming apps expect
3. **Incorrect** — feature exists but has a bug
4. **Verified** — feature exists and looks correct

List every gap with file path and line number.

---

## Part 3: Fix

Fix all gaps identified in Part 2. Rules:
- Follow ANPAS: 150-line cap, feature folders, CHANGELOG per commit
- No `helpers/`, `common/`, or `utils/` directories in SDK
- Business logic stays in SDK, not in UI
- Commit after each logical fix with a CHANGELOG entry

---

## Part 4: Publish

After all fixes are committed:
1. Update `packages/business/package.json` version (semver)
2. Run `pnpm publish:packages` or the SDK's publish script
3. Report the exact version published and the commit SHA

---

## Part 5: Evidence Report

Produce `docs/PHASE-02-AUDIT-RESULT.md` with:

```markdown
## SDK Business & Account Audit Report — Phase 2

### Canonical Contract (as published to NPM)
[Document the actual types, methods, and interfaces found]

### Gaps Found
| Area | Status | File | Line | Issue |
|------|--------|------|------|-------|
| ... | ... | ... | ... | ... |

### Fixes Applied
| Fix | Commit SHA | Version |
|-----|-----------|---------|
| ... | ... | ... |

### NPM Package
- Name: ...
- Version Published: ...
- Commit SHA: ...

### Verified Features
[What is confirmed working]

### Known Limitations
[What is not yet verified / what gaps remain]

### Next Steps
[What Desktop, Mobile, Web agents must verify next]
```

---

## Output

Commit the result report as `docs/PHASE-02-AUDIT-RESULT.md` in the SDK repo.
