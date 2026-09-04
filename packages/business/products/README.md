# @soostori/products

Product/catalog domain — extracted from Desktop's `products` schema.

## Contents

| File | Purpose |
|---|---|
| `types.ts` | `Product`, `Category`, `ProductVariant` — matches Desktop's SQLite fields exactly |
| `repository.ts` | Storage abstraction — platform implementations provide concrete repos |
| `service.ts` | Business logic with event emission (PRODUCT_CREATED, PRODUCT_UPDATED, PRICE_CHANGED) |

## Pattern

```
@soostori/products
    ├── types (canonical domain)
    ├── ProductRepository (interface — platform implements)
    └── ProductService (business logic + event emission)
```

Each platform (Desktop, Mobile) provides a SQLite-backed `ProductRepository` implementation. The service emits events via `@soostori/events` for sync, notifications, and audit.

## Usage

```ts
import { ProductService } from '@soostori/products'
import type { ProductRepository } from '@soostori/products'

// Platform implementation
const repo: ProductRepository = new SqliteProductRepository(db)
const service = new ProductService(repo, shopId, deviceId, userId)

// Business logic
const product = await service.create({ name: 'Coffee', sellingPrice: 500, ... })
await service.update(product.id, { sellingPrice: 550 })  // emits PRICE_CHANGED
```

Stock mutations **must** go through the Primary Device architecture — see `@soostori/lan`.
