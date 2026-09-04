# Soostori SDK

**The single source of truth for the Soostori platform.**

Used by **Web**, **Mobile**, and **Desktop** applications. Built once, consumed everywhere.

```
ONE SHOP
  ↓
ONE FIDScript CLOUD IDENTITY
  ↓
MULTIPLE AUTHORIZED DEVICES
  ↓
SHARED CLOUD DATA MODEL (@soostori/schema)
  ↓
LOCAL OFFLINE OPERATION (SQLite, per-platform)
  ↓
LAN SYNC WHEN AVAILABLE (@soostori/sync)
  ↓
CLOUD SYNC INDEPENDENTLY (@soostori/sync)
  ↓
FIDScript REALTIME CLOUD STATE (@soostori/cloud)
  ↓
WEB MANAGEMENT/CONTROL
```

## Packages

| Package | Purpose | Version |
|---|---|---|
| [`@soostori/core`](./packages/core) | Branded IDs, types, validation, errors, constants | 0.1.0 |
| [`@soostori/schema`](./packages/schema) | Canonical cloud entity definitions + migrations | 0.1.0 |
| [`@soostori/auth`](./packages/auth) | Identity chain (User → Shop → Employee → Device → Session) | 0.1.0 |
| [`@soostori/cloud`](./packages/cloud) | FIDScript REST transport (platform-agnostic) | 0.1.0 |
| [`@soostori/sync`](./packages/sync) | SyncEvent contract, push/pull, conflict, snapshot | 0.1.0 |
| [`@soostori/subscription`](./packages/subscription) | Plans, entitlements, expiration, enforcement | 0.1.0 |
| [`@soostori/tuma`](./packages/tuma) | Tuma M-Pesa payment integration | 0.1.0 |

## Installation

```bash
pnpm add @soostori/core @soostori/schema @soostori/auth @soostori/cloud @soostori/sync @soostori/subscription
```

For Tuma payments:
```bash
pnpm add @soostori/tuma
```

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `NPM_TOKEN` | For publishing packages to npm | Only for maintainers |
| `TUMA_API_KEY` | Tuma M-Pesa API key | For Tuma payments only |
| `TUMA_BUSINESS_EMAIL` | Tuma business email | For Tuma payments only |

**NEVER** commit these values. Use `.env` files (gitignored) or platform secrets.

## Development

```bash
# Install
pnpm install

# Build all packages
pnpm -r build

# Run all tests
pnpm -r test

# Type check
pnpm -r typecheck
```

## Publishing (maintainers only)

```bash
# Set NPM_TOKEN environment variable (DO NOT commit)
export NPM_TOKEN=...

# Login and publish
pnpm login
pnpm -r --filter "./packages/*" publish --access public
```

**Security checklist before publishing:**
- [ ] No secrets committed (`git grep -n "TUMA_API_KEY\|api_key" packages/`)
- [ ] No `.env` files in commits
- [ ] `.npmrc` only contains registry, not auth
- [ ] Build artifacts (`dist/`) are in `files` array of each `package.json`
- [ ] All tests pass
- [ ] All packages type-check

## Canonical Architecture

### Identity chain (auth)

```
FIDScript User ($users)
  ↓
Company (companies)
  ↓
Shop (shops)
  ↓
Employee (employees)
  ↓
Device (devices)
  ↓
Authorized Session
```

Local PIN is **not** part of this chain. PIN only unlocks an already-authorized employee.

### Sync contract (sync)

Every operational mutation produces a `SyncEvent` with:
- `shopId` (scoping)
- `deviceId` (origin)
- `idempotencyKey` (duplicate prevention)
- `version` (monotonic ordering)
- `timestamp` (ISO 8601)
- `payload` (JSON-serializable)

### Subscription authority (subscription)

- Authoritative: `subscriptions` + `plans` entities in cloud
- Derived cache: `shops.subscriptionExpiry` (denormalized)
- Offline: cached entitlement + 3-day grace period

## Adding a new entity

1. Add it to `packages/schema/src/entities.ts` with field definitions
2. Add a corresponding Zod schema in `packages/core/src/validation.ts`
3. Add a migration entry in `packages/schema/src/migrations.ts`
4. Push to FIDScript via the MCP tool
5. Run contract tests: `pnpm --filter @soostori/contract-tests test`

## Adding a new field to an existing entity

1. Add the field to the entity definition in `packages/schema/src/entities.ts`
2. Add it to the Zod schema in `packages/core/src/validation.ts`
3. Add a forward-compatible migration (no removal!)
4. All three apps automatically pick up the new field on next build

## Forensic Audit

See [`docs/FORENSIC-AUDIT.md`](./docs/FORENSIC-AUDIT.md) for the complete reconciliation report between the three apps and the canonical SDK contract.

## License

UNLICENSED — proprietary Soostori platform SDK.
