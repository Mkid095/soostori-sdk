# Phase 1 — Authentication & Identity Foundation: Audit Prompt

**Phase:** 1 of 27
**Platform:** SDK (semantic authority)
**Goal:** Audit the canonical auth contract in the SDK, identify gaps, fix them, publish to NPM, and report evidence.

---

## Prerequisites

Before making any changes, read these files:
- `.ai/coding-rules.md`
- `.ai/project-manifest.md`
- `.ai/review-checklist.md`
- `docs/ARCHITECTURE.md`

---

## Part 1: Audit — What Is the Current Canonical Auth Contract?

Answer these questions by reading the SDK source code (not by assuming):

### 1.1 CloudAuth / Authentication Contract

- What is the `CloudAuth` class or interface? What methods does it expose?
- What authentication methods are supported? (Google OAuth, email/password, or both?)
- How is `signIn()` structured? What does it return?
- How is `signOut()` structured?
- Is there a `currentUser` or `session` accessor? What type does it return?
- Are there `trustedDevices` or device-trust methods?
- Is there an `operational PIN` method?

### 1.2 Identity Mapping

- How is `Person` represented? What fields?
- How is `Business` represented? What fields?
- How is `Membership` represented? What fields?
- How is `Role` represented? What roles exist?
- How is `Device` represented?
- How do these entities relate to each other in the auth flow?

### 1.3 Repository Interfaces

- What repository interfaces exist for auth-related entities?
- What methods do they expose (`create`, `update`, `findBy...`, `delete`)?
- Are the repository method signatures consistent across all auth entities?

### 1.4 Session Management

- How is a session represented?
- Is there a `Session` entity or type?
- Does the SDK expose session persistence (offline session)?
- Is there a trusted-device session flow?

### 1.5 Events

- Are there auth-related event types (e.g., `SignedIn`, `SignedOut`, `SessionExpired`)?
- What is the event payload for each?

### 1.6 Google OAuth

- Is Google OAuth implemented? Where?
- Does it use Google ID Token flow or Authorization Code flow?
- Is the Google client ID configurable?
- Does the SDK handle the Google ID token and extract the `sub` / email?

### 1.7 Email/Password

- Is email/password auth implemented?
- Where is the password hashing (bcrypt, argon2, etc.)?
- Is there a `register` and `login` flow?

### 1.8 Published Package

- What is the current NPM package name?
- What version is published?
- What is the `main` / `exports` field pointing to?
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
1. Update `package.json` version (semver: patch for bug fixes, minor for new features)
2. Run `npm publish` (or the SDK's publish script)
3. Report the exact version published and the commit SHA

---

## Part 5: Evidence Report

Produce a structured report with:

```markdown
## SDK Auth Audit Report — Phase 1

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

Commit the report as `docs/PHASE-01-AUTH-AUDIT-RESULT.md` in the SDK repo.
