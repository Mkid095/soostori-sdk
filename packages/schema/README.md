# @soostori/schema

Canonical Soostori cloud entity definitions. This package is the source of truth for the FIDScript cloud schema (app `0808ca7d-...`).

## Contents

| File | Purpose |
|---|---|
| `entities.ts` | Field-by-field definitions for every cloud entity, plus auto-generated Zod validators |
| `migrations.ts` | Versioned schema migration history and pending-migration helpers |

## Adding an entity

1. Add it to `cloudEntities` in `entities.ts` with field-level definitions
2. Add a corresponding Zod schema in `@soostori/core/validation.ts`
3. Add a migration entry in `migrations.ts`
4. Push to FIDScript via the MCP tool

## Rules

1. **All field types are canonical**: `string`, `number`, `boolean`, `json`, `date` (ISO 8601), `uuid`.
2. **No platform-specific fields.** Anything that varies by platform belongs in the local SQLite schema, not here.
3. **Add-only migrations.** Never remove a field — deprecate first.
4. **Timestamps are ISO 8601 strings**, never Unix timestamps or numbers.

## Usage

```ts
import { validateEntity, cloudEntities, SCHEMA_VERSION } from '@soostori/schema'

// Validate a cloud record
const shop = validateEntity('shops', {
  id: '...',
  name: 'My Shop',
  slug: 'my-shop',
  taxRate: 16,
  plan: 'free',
  status: 'active',
})

// Inspect schema
console.log(SCHEMA_VERSION, cloudEntities.products)
```
