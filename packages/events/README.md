# @soostori/events

The canonical Soostori event spine. Single source of truth for every event name, payload shape, and envelope.

## Why this exists

Without a shared event catalog, the four downstream consumers each invent their own:

- `@soostori/sync` would invent its own sync events
- `@soostori/notifications` would invent its own notification events
- `@soostori/audit` would invent its own audit events
- Web analytics would invent its own event names

That produces four incompatible taxonomies in one platform.

`@soostori/events` is the spine they all consume.

## What's inside

| File | Purpose |
|---|---|
| `catalog.ts` | All event names — typed union + constants |
| `payloads.ts` | Payload types per event (strongly typed) |
| `envelope.ts` | Universal `SoostoriEvent<T>` envelope with `id`, `name`, `version`, `sequence`, `idempotencyKey` |
| `bus.ts` | In-process pub/sub `EventBus` for local reactions |

## Event categories

```
sale.*        stock.*       product.*     category.*
customer.*    debt.*        supplier.*     device.*
sync.*        subscription.* auth.*       audit.*
system.*
```

## Usage

```ts
import { createEvent, SALE_CONFIRMED, getEventBus, type SoostoriEvent } from '@soostori/events'

// Emit a typed event
const event = createEvent({
  name: SALE_CONFIRMED,
  shopId, deviceId,
  payload: { saleId, total: 500, authorizedBy: 'primary', stockAfter: {} },
})

// Local UI / notifications react
getEventBus().on('sale.confirmed', async (e) => {
  console.log('Sale confirmed:', e.payload.saleId)
})

// Sync engine pushes to cloud
await syncEngine.enqueue(event)
```

## Adding a new event

1. Add the event name to `catalog.ts`
2. Add the payload type to `payloads.ts`
3. Domain code emits via `createEvent({ name: ..., payload: ... })`
4. Consumers subscribe via `getEventBus().on('event.name', handler)`
