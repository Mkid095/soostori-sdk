# AI Development Workflows

Defines the execution flow for all AI-assisted development in this project.

---

## Standard Workflow

Every task follows this flow:

```
Request
  ↓
Discovery (adaptive depth)
  ↓
Plan
  ↓
Implementation
  ↓
Testing
  ↓
Documentation
  ↓
Review Checklist
  ↓
Commit
```

---

## Discovery Phases

### Quick Discovery (Small Changes)

**When:** Typo fix, label change, button addition, CSS tweak, minor bug fix

**Steps:**
1. Read root `CLAUDE.md`
2. Read relevant feature `README.md`
3. Inspect 3-5 affected files
4. Proceed to implementation

**Time budget:** < 2 minutes

### Module Discovery (Feature Additions)

**When:** Adding a new feature, modifying an existing feature significantly, adding a new endpoint

**Steps:**
1. Read root `CLAUDE.md`
2. Read affected feature `README.md` files
3. Read module-level `CLAUDE.md` (if exists)
4. Inspect existing services and patterns in the affected feature
5. Identify dependencies on other modules
6. Create implementation plan
7. Proceed to implementation

**Time budget:** < 5 minutes

### Full Audit (Architecture Changes)

**When:** New module creation, major refactoring, database schema changes, cross-cutting concerns

**Steps:**
1. Read all `CLAUDE.md` files (root, module, feature)
2. Read project manifest (`.ai/project-manifest.md`)
3. Read architecture docs (`docs/architecture/`)
4. Read database schema (Prisma schema, migrations)
5. Map data flows between affected modules
6. Create detailed implementation plan
7. Present plan for approval if scope is large
8. Proceed to implementation

**Time budget:** < 15 minutes

---

## Implementation Rules

1. **Read before writing** — Always inspect existing implementation first
2. **Follow patterns** — Use existing services, hooks, components as templates
3. **One responsibility per file** — No mixing business logic with UI
4. **Max 150 lines** — Split before writing
5. **Feature-based naming** — `[domain]-[action]-[type]`
6. **Configuration-driven** — Never hardcode values
7. **Types first** — Define interfaces before implementation

---

## Testing Requirements

- Unit tests for services and utilities
- Integration tests for API endpoints
- UI tests for critical user flows
- Test coverage must not decrease

---

## Documentation Requirements

After every change:
1. Update feature README if structure changed
2. Update CHANGELOG.md with files changed
3. Update ADR if architectural decision was made
4. Update CLAUDE.md if rules changed

---

## Review Checklist

Before declaring any task complete, verify:

- [ ] Architecture followed (feature-based, not technical-category)
- [ ] File sizes ≤ 150 lines (exceptions documented)
- [ ] Naming convention followed (`[domain]-[action]-[type]`)
- [ ] No business logic in UI components
- [ ] Types/interfaces defined for all public APIs
- [ ] Feature README updated if structure changed
- [ ] CHANGELOG.md updated
- [ ] No unnecessary dependencies added
- [ ] No duplicate utilities created
- [ ] Tests added/updated
- [ ] No breaking changes without migration plan

---

## Commit Format

```
feat(domain): description
fix(domain): description
docs(domain): description
refactor(domain): description
test(domain): description
chore(domain): description
```

Examples:
```
feat(conversations): add conversation summaries
fix(contacts): resolve duplicate contact resolution
docs(automation): update workflow engine architecture
refactor(campaigns): split oversized campaign service
test(auth): add OAuth token refresh tests
```

---

## Emergency Overrides

In rare cases (critical bug, security vulnerability), the workflow can be shortened:

```
Emergency → Fix → Documentation → Retroactive Review
```

But documentation must be updated within 24 hours.
