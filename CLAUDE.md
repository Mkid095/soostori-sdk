# Project AI Rules — ANPAS

> **STRICT RULES** — These rules are non-negotiable. Violations must be fixed before commit.

## Entry Order

1. **Memory** — recall relevant project facts from `C:\Users\Administrator\.claude\projects\soostori-sdk\memory\`
2. **CLAUDE.md** — this file (ANPAS rules)
3. **AGENTS.md** — agent task lists
4. **CHANGELOG.md** — recent changes before reading any code
5. **`.ai/coding-rules.md`** — full coding rules
6. **`.ai/project-manifest.md`** — project metadata
7. **Source code** — packages being modified

---

## ANPAS Rules Table

| Priority | Rule | Notes |
|---|---|---|
| MUST | Never commit secrets, keys, tokens, or credentials to git | Use `grep -r "password\|secret\|token\|api.key" --include="*.ts"` before commit |
| MUST | Use feature-based folder organization | `features/` not `controllers/` |
| MUST | Maximum 150 lines per source file | Excludes generated, migrations, config, tests |
| MUST | Types required for all public interfaces | No `any` without justification |
| MUST | No business logic in UI components | Extract to services |
| MUST | Update `CHANGELOG.md` on every change | Date + category + description + files |
| MUST | Update `CLAUDE.md` when architecture changes | — |
| MUST | Input validate all user input | Zod schemas, frontend + backend |
| MUST | Auth/authorization on every operation | Tenant scoping required |
| MUST | No AI visual vocabulary in UI | No sparkles, purple gradients, glassmorphism, robot/brain icons |
| MUST | Reserve ✨ only for actual AI features | Not decorative — max 1-2 per screen |
| MUST | Use Lucide icons for UI | No sparkle/star/magic-wand decorative icons |
| MUST | Check memory before making schema/model changes | — |
| MUST | Run `anpas-audit.ps1` before committing | — |
| MUST | No rewrite of working code | Minimum semantic changes only |
| MUST | Audit before modifying auth flows | — |
| MUST | Distinguish SDK browser OAuth from Mobile FIDScript OAuth | Different flows — do not conflate |
| MUST | Use `instant-self` MCP to verify backend capabilities | Do not invent endpoints |
| SHOULD | Name files `[domain]-[action]-[type].ts` | — |
| SHOULD | Update feature README on changes | — |
| SHOULD | Check for duplicate utilities before creating new | `shared/` first |
| SHOULD | Descriptive variable names with domain language | `isLoading`, `hasPermission` |

---

## Project Context

### What This Project Is

`soostori-sdk` — a TypeScript SDK for the Soostori commerce platform.

### Architecture

- **Auth** (`@soostori/auth`) — PKCE browser OAuth, Mobile Google ID-token via FIDScript `signInWithIdToken`, email/password, session management
- **Business** (`@soostori/business`) — shops, products, customers, sales, debts
- **Core** (`@soostori/core`) — canonical domain types from FIDScript schema
- **Cloud** (`@soostori/cloud`) — realtime sync
- **Storage** (`@soostori/storage`) — local SQLite via FIDScript

### Authentication Model

- **Web/Desktop**: `signInWithGoogle(config)` → browser PKCE OAuth → `handleOAuthCallback`
- **Mobile**: `GoogleSignin.signIn()` → `signInWithGoogleIdToken({ idToken, clientName })` → FIDScript `db.auth.signInWithIdToken`
- **Customers**: Salesperson-provisioned → customer activates (NOT self-registration)
- **Backend**: FIDScript self-hosted at `instant.fidscript.com` — only system namespaces (`$files`, `$streams`, `$users`) exist in the base app; business entities managed by `@soostori/sync`
- **AuthApiClient**: Interface only — backend must implement. No invented HTTP endpoints.

### Key Files

- `packages/auth/src/cloud-auth.ts` — CloudAuth class, PKCE, session management
- `packages/auth/src/index.ts` — public exports
- `packages/core/src/types.ts` — canonical domain types
- `packages/auth/test/cloud-auth.test.ts` — 31 passing tests

### State

- Current version: `0.1.0-alpha.3`
- 31/31 auth tests passing
- TypeScript clean, builds clean
- No committed `CHANGELOG.md` yet

---

## Agent Task Lists

See `AGENTS.md`.
