# Soostori SDK NPM Publication Roadmap

**Companion to:** `SDK-ECOSYSTEM-INVENTORY.md`
**Goal:** Sequence from current SDK state to first NPM-published packages consumed by all three apps.

---

## Phase 0 — Verification Gate ✅ COMPLETE

- [x] Build SDK foundation (23 packages)
- [x] Zero `as any` in production source
- [x] Zero circular dependencies
- [x] Zero platform-specific leaks in shared source
- [x] Primary Device STALE authorization invariant established
- [x] Inventory-ledger invariant established
- [x] Cross-platform contract tests pass (20/20)
- [x] Unit tests pass (183/184 — LAN test needs integration env)

---

## Phase 1 — Architecture Decision (CURRENT)

- [x] Complete cross-platform inventory (this document)
- [ ] **Review and approve the 36-package target architecture**
- [ ] Decide which packages are public vs internal
- [ ] Finalize npm package names (all scoped `@soostori/*`)
- [ ] Decide versioning strategy (changesets)
- [ ] Approve Public/Internal split

**Exit criterion:** `docs/SDK-NPM-ROADMAP.md` approved with final package list.

---

## Phase 2 — Fill Critical Gaps

**Goal:** Bring SDK domain coverage to match all three apps.

- [ ] P0: `@soostori/spm` — salesperson, influencer, commission, attribution (absorb from Web)
- [ ] P0: `@soostori/desktop-adapter` — Phase 9.1 prerequisite
- [ ] P1: `@soostori/expenses`
- [ ] P1: `@soostori/suppliers`
- [ ] P1: `@soostori/reports`
- [ ] P2: `@soostori/promotions`
- [ ] P2: `@soostori/returns`
- [ ] P2: `@soostori/receipts`
- [ ] P2: `@soostori/payhero`

Each new package:
1. Inventory existing logic across Desktop, Mobile, Web
2. Define canonical contract
3. Build package against @soostori/core
4. 100% typecheck + unit tests
5. Update @soostori/contract-tests to include new entities

**Exit criterion:** All P0/P1 packages built, typecheck, tests pass.

---

## Phase 3 — Cross-Platform Validation

- [ ] Phase 9.1 Desktop auth/device migration (using `@soostori/desktop-adapter`)
- [ ] Phase 9.2 Desktop products/inventory migration
- [ ] Phase 9.3 Desktop sales/customers/debts migration
- [ ] Phase 9.4 Desktop subscriptions/notifications migration
- [ ] Phase 9.5 Mobile migration (using `@soostori/mobile-adapter`)
- [ ] Phase 9.6 Web adapter build (using existing Prisma as backing)

Each Phase 9.x:
- Desktop integration tests pass
- Real shop data preserved (SQLite migration test)
- LAN synchronization still works
- STALE/LOST/UNKNOWN handling preserved

**Exit criterion:** All three apps consume same canonical `@soostori/*` business logic.

---

## Phase 4 — API Stabilization

- [ ] Mark all public APIs as stable (vs experimental)
- [ ] Add JSDoc to all public exports
- [ ] Generate TypeDoc documentation
- [ ] Add usage examples to each public package README
- [ ] Run `tsc --noEmit --strict` against the entire SDK
- [ ] Run `vitest` against the entire SDK
- [ ] Coverage report — target >85% per package

**Exit criterion:** Every public package has stable types, examples, >85% coverage.

---

## Phase 5 — NPM Publish Preparation

- [ ] Each public package has:
  - `package.json` with proper `name`, `version`, `description`, `keywords`, `license`, `repository`, `bugs`, `homepage`, `publishConfig`
  - Exhaustive `README.md` with examples
  - `LICENSE` file (UNLICENSED initially)
  - `dist/` with `index.js`, `index.d.ts`, source maps
  - `package.json#files` limits published artifacts
  - `package.json#exports` declares ESM entry points
  - No `.env`, no secrets, no test files in published bundle
- [ ] CI workflow: `pnpm -r test` on every PR
- [ ] CI workflow: `pnpm -r build` on every PR
- [ ] CI workflow: `pnpm changeset` validation
- [ ] Local npm login using `NPM_TOKEN` (no token in repo)
- [ ] Dry-run publish: `pnpm publish --dry-run --registry https://registry.npmjs.org/`

**Exit criterion:** All public packages pass `pnpm publish --dry-run` cleanly.

---

## Phase 6 — First NPM Publication

- [ ] Publish `@soostori/core` first (zero deps, foundation)
- [ ] Verify package installable: `npm install @soostori/core`
- [ ] Publish `@soostori/storage` (depends only on core)
- [ ] Publish `@soostori/events`
- [ ] Publish `@soostori/errors`
- [ ] Verify each on npmjs.com
- [ ] Continue publishing domain packages in dependency order:
  - `@soostori/auth`, `@soostori/devices`, `@soostori/offline`, `@soostori/schema`
  - `@soostori/products`, `@soostori/customers`, `@soostori/inventory`, `@soostori/debts`, `@soostori/sales`, `@soostori/business`, `@soostori/subscriptions`
  - `@soostori/sync`, `@soostori/notifications`, `@soostori/audit`, `@soostori/lan`
  - `@soostori/payments`, `@soostori/tuma`, `@soostori/whatsapp`, `@soostori/cloud`
- [ ] Publish `@soostori/desktop-adapter` (last — depends on everything)

**Exit criterion:** All planned public packages live on npm under `@soostori/*` scope.

---

## Phase 7 — Application Adoption

- [ ] Desktop: replace local `@soostori/*` workspace refs with npm installs
- [ ] Mobile: same
- [ ] Web: replace Prisma-based auth/devices/sales with `@soostori/*` SDK + web-adapter
- [ ] All three apps use same Version pin
- [ ] CI matrix tests on real npm packages

**Exit criterion:** No app contains a duplicated business rule that also exists in the SDK.

---

## Phase 8 — Long-Term Maintenance

- [ ] `changesets` configured
- [ ] Automated PR title linting (e.g., `feat(@soostori/core): ...`)
- [ ] Automated changelog generation
- [ ] Dependabot or Renovate for transitive deps
- [ ] Quarterly SDK architecture review
- [ ] E2E test suite per platform on real devices

---

## Sequence Diagram

```
Current SDK                    Phase 1            Phase 2             Phase 3
  (23 pkgs)                     (Approve)          (Fill gaps)         (Cross-platform)
       │                            │                  │                    │
       ▼                            ▼                  ▼                    ▼
 ┌──────────┐                ┌──────────┐         ┌──────────┐        ┌──────────┐
 │ Audit ✓  │──review───────▶│ Approval│────────▶│ Build    │───────▶│ Migrate  │
 └──────────┘                │ 36 pkg   │         │ missing  │        │ Desktop  │
                             │ target    │         │ SDKs     │        │ Mobile   │
                             └──────────┘         └──────────┘        │ Web      │
                                                                └──────────┘
                                                                          │
                                                                          ▼
                                                          Phase 4   Phase 5-6
                                                              │       │
                                                          Stabilize │
                                                                    Publish
                                                                    to npm
                                                                      │
                                                                      ▼
                                                                  Phase 7-8
                                                                  Apps use
                                                                  published
                                                                  packages
```

---

## Risks per Phase

| Phase | Risk | Mitigation |
|-------|------|-------------|
| 1 | Inventory rejected | Have concrete dependency graph and capability matrix to defend it |
| 2 | New packages reinvent existing logic | Reference implementation must come from Web's Prisma layer first |
| 3 | Real shop data lost during migration | Make SQLite migrations explicit, reversible, tested against real DB copies |
| 3 | STALE Primary invariant broken | Regression test in @soostori/contract-tests that runs on every PR |
| 3 | Network partition causes overselling | Inventory ledger + idempotency is the design; write integration tests |
| 4 | Breaking changes to public APIs | Phase APIs as experimental until two apps use them; lock behind semver |
| 5 | Accidental secret in package | `pnpm publish --dry-run --registry` checks bundle contents; CI lint scans for tokens |
| 6 | Order of publishing causes install issues | Publish in dependency order; use changesets to coordinate |
| 7 | Apps have version drift | Pin all apps to same `@soostori/sdk` meta-package version |

---

## Exit Criteria for "SDK is ready"

The SDK ecosystem is considered production-ready when:

1. ✅ All P0 capabilities are covered by SDK packages
2. ✅ All three apps use the same canonical business logic
3. ✅ 100% test coverage on critical paths (auth, sales, inventory)
4. ✅ Every package is on npm under `@soostori/*`
5. ✅ Desktop, Mobile, Web all pin to same `@soostori/sdk` meta-version
6. ✅ No business rule is duplicated in any app layer
7. ✅ Real shop data migrates without loss
8. ✅ STALE/LOST/UNKNOWN Primary handling preserved
9. ✅ Subscription grace period enforced centrally
10. ✅ Audit log immutable and replayable

---

*End of SDK NPM Roadmap*
