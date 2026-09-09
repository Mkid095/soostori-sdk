# Task Communication Template

Use this structure when giving tasks to AI agents. Every task must include these sections.

---

## Context

**What part of the system are we modifying?**

[Be specific. Name the feature, module, or domain. Describe the current state.]

## Objective

**What should change?**

[One sentence stating the end state. Unambiguous.]

## Constraints

**What must remain untouched?**

[List files, modules, behaviors that must not change. List any technical constraints.]

## Implementation

**Expected approach.**

[Describe the expected method. Mention specific files to create/modify. Reference existing patterns to follow.]

## Documentation

**What needs updating?**

[List all documentation files that must be updated after implementation:]
- [ ] Feature README
- [ ] CHANGELOG.md
- [ ] Architecture docs (if applicable)
- [ ] ADR (if architectural decision made)

---

## Example

### Context

We are modifying the WhatsApp conversation module. The current implementation handles incoming messages via webhook and stores them in the database.

### Objective

Add conversation summaries that are generated automatically after each conversation reaches 10 messages.

### Constraints

Do not change existing message handling or storage. Do not modify the webhook parser. Do not add new database tables.

### Implementation

Create a summary service in `features/conversations/services/summary.service.ts`. Trigger it via an event listener after message count reaches 10. Use the existing LLM gateway — do not create a new one.

### Documentation

- [ ] `features/conversations/README.md` — add summary section
- [ ] `CHANGELOG.md` — log the addition
- [ ] `docs/architecture/` — update data flow diagram
