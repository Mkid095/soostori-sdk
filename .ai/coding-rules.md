# Coding Rules

Enforcement rules for all AI-assisted development in this project.

---

## Structural Rules

### 1. Feature-Based Organization
- Organize by **business capability**, not technical category
- BAD: `controllers/`, `services/`, `utils/`
- GOOD: `features/conversations/`, `features/contacts/`, `features/campaigns/`

### 2. File Size Limit
- Maximum **150 lines** per file
- Exceptions: generated files, migrations, config files, test files
- If approaching 150 lines → split into feature folder

### 3. One Responsibility Per File
- Component → UI only
- Service → Business logic only
- Repository → Data access only
- Schema → Validation only
- Types → Type definitions only

---

## Naming Rules

### 4. File Naming Convention
- Pattern: `[domain]-[action]-[type].[ext]`
- Examples:
  - `conversation-context.manager.ts`
  - `payment-status.mapper.ts`
  - `customer-profile.repository.ts`
- Avoid: `helpers.ts`, `common.ts`, `misc.ts`, `tools.ts`

### 5. Variable/Function Naming
- Descriptive names that communicate purpose
- Use domain language, not technical jargon
- Boolean variables: `isEnabled`, `hasPermission`, `isLoading`
- Functions: verb-first — `getUserProfile`, `sendMessage`, `validateEmail`

---

## Code Quality Rules

### 6. No Business Logic in UI
- Components must not contain API calls, validation, or business rules
- Extract to services, hooks, or utilities

### 7. Types Required
- All public interfaces must have TypeScript types
- No `any` types unless absolutely necessary (document why)
- Define types in `types/` folder, not inline

### 8. No Hardcoded Values
- URLs, API keys, labels, colors → configuration
- Roles, permissions, workflows → configuration
- Provider names → configuration

### 9. No Duplicate Utilities
- Check `shared/` before creating new utility
- If utility is feature-specific, keep it in the feature
- If utility is truly reusable, put it in `shared/`

---

## Documentation Rules

### 10. Feature README Required
- Every feature must have a `README.md`
- Must include: purpose, architecture, data flow, main files, dependencies

### 11. CHANGELOG Updated
- Every change must be logged in `CHANGELOG.md`
- Include: date, category, description, files changed

### 12. CLAUDE.md Maintained
- Update when rules change
- Update when new modules are added
- Update when architecture changes

---

## UI Rules

### 13. Professional Icons Only (No AI Visual Vocabulary)

**Strictly forbidden standalone icons (these scream "AI-generated"):**
- ✨ Sparkles (any variation — single, multiple, animated)
- 🪄 Magic Wand
- ⚡ Lightning Bolt (when used as decoration rather than action)
- ✦ Single Star / 4-point star
- ✨✨ Double / Multiple Sparkles
- 🧠 Brain
- 🤖 Robot
- 🪐 Orb / Sphere
- ❤️ Heartbeat / 〰️ Pulse (when used as "AI active" indicator)
- 🖊️✨ Sparkly Pencil
- 🔍✨ Search + Sparkle
- 🎨✨ Image + Sparkle
- 🌐 Neural / Network nodes
- ◉ Glowing core / orb
- 🔥 Flame
- 🎯 Target (used as AI-decoration)

**Forbidden visual styles (the "AI-generated website" look):**
- Purple / violet / indigo gradient backgrounds
- Blue-purple / pink-purple / cyan-purple gradients
- Glassmorphism cards (`rounded-2xl` + blur + semi-transparent)
- Pulsing glow, floating particles, shimmer effects
- Aurora backgrounds, blurred blobs
- Inter typography as the default body font

**Required approach:**
- Use **Lucide icons** or a similar professional icon library (lucide.dev)
- Reserve ✨ **only for actual AI features** — do not put it on every action
- For "AI enhances X" patterns, use the standard icon with a small inline sparkle (Red Hat pattern)
- Define a fixed icon taxonomy — see table below
- Icons must be semantically appropriate, not decorative

**Recommended icon taxonomy (Google/AWS/Red Hat pattern):**
- AI action → ✨ (only on true AI features, max 1-2 places per screen)
- Generate/Create → 🪄 or ✨ (not both — pick one)
- Execute / Run → ⚡ (only when speed is the message)
- Live / Real-time → 〰️ Activity (not "heartbeat" with sparkles)
- Agent → ◉ or simple robot icon (without sparkles)
- Deployment → 🚀 or ArrowUp
- API → `</>` or Terminal
- Database → Cylinder
- Security → Shield
- Settings → Gear
- Logs → Terminal
- Integration → Link / Plug
- Success → Check
- Error → AlertTriangle
- Processing → Loader / Spinner

**Why these rules exist:** Sparkle icons and purple gradients are the **most recognizable AI-generated UI tells**. Google research found that people strongly associate sparkles with AI, but as the icon appears everywhere its meaning becomes less specific. AWS Cloudscape and Red Hat both recommend using sparkle sparingly and reserving it for true AI features. Removing the AI visual vocabulary is one of the highest-impact changes for making UI look human-built.

### 14. Consistent Design System
- Use shared components from `shared/components/`
- Follow existing patterns for modals, forms, tables
- No inline styles — use the project's CSS/Tailwind system

---

## Security Rules

### 15. Input Validation
- All user input must be validated
- Use Zod/Joi schemas, not manual checks in components
- Validate on both frontend and backend

### 16. Authentication/Authorization
- Every endpoint must verify authentication
- Every operation must verify authorization (tenant scoping)
- No bypass of auth middleware

---

## Quick Reference

| Rule | Enforcement Method |
|------|-------------------|
| Feature-based structure | Audit checks folder names |
| Max 150 lines/file | Audit counts lines |
| Naming convention | Audit checks file names |
| No business logic in UI | Code review |
| Types for public APIs | TypeScript compiler |
| No hardcoded values | Static analysis |
| No duplicate utilities | Manual check + audit |
| Feature README exists | Audit checks for README.md |
| CHANGELOG updated | Review checklist |
| Professional icons only (no sparkle, no AI-tell icons) | Visual review + grep for `Sparkles`, `✨`, `★` |
| Input validation | Code review |
| Auth/authorization | Code review |
