# @soostori/core

Canonical Soostori core primitives.

## Contents

| Module | Purpose |
|---|---|
| `ids.ts` | Branded ID types (ShopId, ProductId, etc.) and ID generators |
| `types.ts` | Canonical domain entity types — single source of truth |
| `constants.ts` | Cloud app ID, ports, sync intervals, grace periods |
| `errors.ts` | Cross-platform error hierarchy (SoostoriError, AuthError, etc.) |
| `validation.ts` | Zod schemas for runtime validation |

## Rules

1. **All IDs are branded.** Use `asShopId(string)`, `asProductId(string)`, etc.
2. **All timestamps are ISO 8601 strings.** Use `iso8601Schema` for validation.
3. **All entity types match the FIDScript cloud schema** — see `docs/FORENSIC-AUDIT.md`.
4. **No platform-specific code.** This package runs in Node, browser, and React Native.

## Usage

```ts
import { asShopId, asProductId, newId, type Shop, type Product } from '@soostori/core'

const shopId = asShopId(newId())
const product: Product = {
  id: asProductId(newId()),
  shopId,
  name: 'Coffee Beans',
  sellingPrice: 500,
  costPrice: 300,
  // ...
}
```
