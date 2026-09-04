# @soostori/cloud

FIDScript REST transport — platform-agnostic.

## Modules

| File | Purpose |
|---|---|
| `client.ts` | `CloudClient` — magic code auth, query, transact, upsert |
| `realtime.ts` | `subscribePolling` — desktop-friendly realtime fallback |

## Rules

1. **No platform-specific imports.** No `electron`, no `react-native`, no browser-only APIs.
2. **Uses global `fetch`.** Override via `options.fetch` for testing.
3. **Timeouts default to 30s.** Override via `options.timeoutMs`.
4. **All errors throw typed SDK errors** (`CloudError`, `NetworkError`, `ValidationError`).

## Usage

```ts
import { createCloudClient } from '@soostori/cloud'

const client = createCloudClient({ appId: '...' })

// Magic code login
await client.sendMagicCode('owner@shop.com')
const { user } = await client.verifyMagicCode('owner@shop.com', '123456')

// Set token for subsequent requests
client.setToken('session-token-here')

// Query shops
const result = await client.query({ shops: { $: { where: { status: 'active' } } } })

// Update an entity
await client.upsert('shops', shopId, { name: 'New Name', taxRate: 16 })
```
