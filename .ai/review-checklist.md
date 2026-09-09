# Review Checklist

Verify these items before declaring any task complete.

---

## Architecture

- [ ] Feature-based organization followed (not technical-category)
- [ ] No mixing of business logic with UI
- [ ] New code follows existing patterns
- [ ] No unnecessary abstractions created
- [ ] Provider-agnostic where applicable

## File Standards

- [ ] All files ≤ 150 lines (exceptions documented)
- [ ] File naming follows `[domain]-[action]-[type]` convention
- [ ] No duplicate utilities created
- [ ] No `helpers.ts`, `common.ts`, `misc.ts`, `tools.ts` files
- [ ] Types/interfaces defined for all public APIs
- [ ] No `any` types without documentation

## Code Quality

- [ ] No hardcoded values (URLs, labels, colors, roles)
- [ ] Input validation present for all user inputs
- [ ] Authentication/authorization checked on all endpoints
- [ ] Error handling present (try/catch, error boundaries)
- [ ] No console.log/debug statements in production code
- [ ] Configuration-driven where applicable

## Documentation

- [ ] Feature README updated (if structure changed)
- [ ] CHANGELOG.md updated with:
  - [ ] Date
  - [ ] Category (Added/Changed/Fixed)
  - [ ] Description
  - [ ] Files changed
- [ ] ADR created (if architectural decision made)
- [ ] CLAUDE.md updated (if rules changed)

## Testing

- [ ] Unit tests added for services/utilities
- [ ] Integration tests added for API endpoints
- [ ] Existing tests still pass
- [ ] Test coverage not decreased

## UI (Frontend Only)

- [ ] No emojis in UI
- [ ] Professional icons used (Lucide or equivalent)
- [ ] **No AI visual vocabulary** — no sparkle (✨), magic wand (🪄), brain (🧠), robot (🤖), orb, lightning-as-decoration, neural nodes, heartbeat/pulse, flame, target as AI-decoration. No purple/violet gradient backgrounds, glassmorphism, or pulsing glow. Reserve ✨ ONLY for actual AI features.
- [ ] Consistent with existing design system
- [ ] Responsive design considered
- [ ] Loading states present
- [ ] Error states present

## Commit

- [ ] Commit message follows format: `feat(domain): description`
- [ ] Changes are logically grouped
- [ ] No unrelated changes in commit
- [ ] No debug/working code committed

---

## If Any Item Fails

Do NOT proceed. Fix the issue before completing the task.

If a rule cannot be followed (exception case):
1. Document WHY in the commit message
2. Add a comment in the code explaining the exception
3. Plan a follow-up task to address it
