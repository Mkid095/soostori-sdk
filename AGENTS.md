# Agent Task Lists

## Never Do These

- Do NOT invent HTTP endpoints for the auth backend
- Do NOT create a new backend agent for AuthApiClient implementation
- Do NOT add `activateAccount()` before verifying FIDScript lifecycle support
- Do NOT add platform roles (ADMIN, SALESPERSON) until separate authorization task
- Do NOT put business bootstrap inside `@soostori/auth`
- Do NOT rewrite working code — minimum semantic changes only
- Do NOT use AI visual vocabulary (sparkles, purple gradients, glassmorphism, robot/brain icons)
- Do NOT use `✨` for decoration — only actual AI features
- Do NOT commit with `--no-verify` or bypass signing
- Do NOT overwrite existing `.ai/` files
- Do NOT push without explicit user approval
- Do NOT use `instantdb` skill — use `instant-self` for FIDScript self-hosted
- Do NOT add business logic to UI components
- Do NOT hardcode URLs, keys, or credentials
- Do NOT use `any` without documented justification

## Always Do These

- Run `anpas-audit.ps1` before commit
- Run `git status` before staging
- Check memory before schema/model changes
- Use `instant-self` MCP to verify backend capabilities before implementing
- Distinguish SDK browser OAuth from Mobile FIDScript `signInWithIdToken`
- Audit alpha.3 before modifying auth flows
- Update `CHANGELOG.md` on every change
- Use feature-based folder organization
- Keep source files under 150 lines
- Validate all user input with Zod
- Verify tenant scoping on every auth operation
