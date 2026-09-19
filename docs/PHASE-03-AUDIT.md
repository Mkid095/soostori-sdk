# Phase 3 — SDK & Data Contract Foundation: Audit Prompt

**Phase:** 3 of 27
**Platform:** SDK (semantic authority)
**Goal:** Audit the SDK's data contracts, entity types, branded IDs, repositories, events, SyncEvent, versioning, serialization, package exports, and compatibility. Fix gaps, publish to NPM.

---

## Prerequisites

Before making any changes, read:
- `.claude/CLAUDE.md`
- `.ai/coding-rules.md`
- `.ai/project-manifest.md`
- `.ai/review-checklist.md`
- `docs/ARCHITECTURE.md`
- `docs/PHASE-01-COMPLETE.md`
- `docs/PHASE-02-BUSINESS-ACCEPTANCE.md`

---

## Context: What Phase 1 & 2 Established

- Phase 1: Auth contract — `@soostori/auth@0.1.0-alpha.9` — 14 CloudAuth + 14 OperationalAuth + 8 events
- Phase 2: Business contract — `@soostori/business@0.1.0-alpha.2` + team, devices, subscription, cloud, events packages

Phase 3 is about making the SDK the **authoritative semantic contract** — the single source of truth for all entity types, IDs, repository interfaces, event shapes, and serialization formats. No app should have its own definitions of these.

---

## Part 1: Audit — What Is the SDK Data Contract?

### 1.1 Branded IDs

Audit every branded ID type across all packages:
- `UserId`, `PersonId`, `EmployeeId`, `ShopId`, `BusinessId`, `DeviceId`, `MembershipId`, `RoleId`
- How are they defined? (nominal typing via branded strings?)
- Are they consistent across all packages?
- Do consuming apps use the same branded ID types?

List every branded ID definition with file and line.

### 1.2 Entity Types

Audit all entity types across packages:
- `Person`, `Business`, `Membership`, `Role`, `Device`, `Subscription`, `Session`
- `Product`, `Category`, `Sale`, `SaleItem`, `Payment`, `Customer`, `Debt`
- Are these defined in one canonical package (`@soostori/core` or `@soostori/schema`)?
- Do other packages re-export or duplicate entity definitions?
- Are all entity fields typed correctly (no `any`)?

### 1.3 Repository Interfaces

Audit all repository interfaces:
- `BusinessRepository`, `PersonRepository`, `MembershipRepository`, `DeviceRepository`, `SubscriptionRepository`
- `ProductRepository`, `CategoryRepository`, `SaleRepository`, `CustomerRepository`
- Do all repository interfaces have consistent method signatures?
- Are `create`, `update`, `delete`, `findById`, `findAll` methods consistent?
- Are branded IDs used correctly in repository method signatures?

### 1.4 Event Types

Audit all event types across packages:
- Auth events: `SIGNED_IN`, `SIGNED_OUT`, `SESSION_REFRESHED`, `SESSION_EXPIRED`, `EMAIL_VERIFIED`, `DEVICE_REGISTERED`, `DEVICE_REVOKED`, `ERROR`
- Business events: `EMPLOYEE_INVITED`, `EMPLOYEE_ACCEPTED`, `EMPLOYEE_ROLE_CHANGED`, `EMPLOYEE_REVOKED`, `business.created`, `business.updated`
- Sync events: `SyncEvent` shape — does it exist?
- Are event payloads typed correctly?
- Is there a central event catalog (`ALL_EVENTS` array)?

### 1.5 SyncEvent

- Does a `SyncEvent` type exist?
- What is its shape?
- How are sync events serialized?
- Is there an outbox/inbox pattern?
- Does the SDK define sync events or does each app invent its own?

### 1.6 Versioning

- Does each package have a clear version?
- Are there breaking change protections?
- Is the `exports` field in `package.json` configured correctly for all packages?
- Do consuming apps declare compatible version ranges?

### 1.7 Serialization

- How are entities serialized? (JSON? Binary?)
- Are branded IDs serialized as strings and deserialized back to branded type?
- Is there a serialization test suite?
- Do consuming apps serialize the same way?

### 1.8 Package Exports

Audit every `@soostori/*` package:
- What does each package export?
- Is the `exports` map correct in each `package.json`?
- Are there barrel files (`index.ts`) that re-export correctly?
- Is the TypeScript `types` field pointing to the right `.d.ts` file?

### 1.9 Compatibility Matrix

- Check the consuming apps' package.json for what they import from each SDK package
- Are the imports compatible with what the SDK actually exports?
- Are there imports of internal packages (starting with `_` or in `src/`)?

### 1.10 Contract Tests

- Are there contract tests that verify SDK behavior against a specification?
- Do the `@soostori/contracts` tests verify entity shapes?
- Do the contracts tests verify branded ID behavior?

---

## Part 2: Gap Analysis

For each area:
1. **Missing** — absent and needs to be implemented
2. **Inconsistent** — exists but differs across packages/apps
3. **Incorrect** — exists but has a bug
4. **Verified** — exists and looks correct

List every gap with file path and line number.

---

## Part 3: Fix

Fix all gaps. Rules:
- Follow ANPAS: 150-line cap, feature folders, CHANGELOG per commit
- No `helpers/`, `common/`, or `utils/` directories in SDK
- Branded IDs must be in `@soostori/core` or `@soostori/schema`
- Entity types must be canonical — no duplicates across packages
- Event types must be in `@soostori/events`
- Commit after each fix with a CHANGELOG entry

---

## Part 4: Publish

After all fixes:
1. Update `package.json` versions for affected packages (semver)
2. Run `pnpm publish:packages`
3. Report exact versions and commit SHAs

---

## Part 5: Evidence Report

Produce `docs/PHASE-03-AUDIT-RESULT.md` with the full findings.

---

## Output

Commit the result report.
