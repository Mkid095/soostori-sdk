# @soostori/notifications

Event → channel dispatcher. Replaces WhatsApp/email/push scattered across modules.

## Architecture

```
                  Soostori Event
                        │
                        ▼
              Notification Engine
                        │
        ┌─────────┬──────┴──────┬─────────┐
        ▼         ▼             ▼         ▼
     in-app    push          WhatsApp    email
        │         │             │         │
        ▼         ▼             ▼         ▼
   Renderer  Native OS    Evolution    Resend
                                API
```

## Modules

| File | Purpose |
|---|---|
| `channel.ts` | `NotificationChannel` interface + registry |
| `preferences.ts` | Per-user, per-event channel preferences |
| `engine.ts` | `NotificationEngine` — consumes events, dispatches notifications |

## Adding a new channel

```ts
class WhatsAppChannel implements NotificationChannel {
  readonly channelName = 'whatsapp'
  async isEnabled() { return true }
  async send(n: Notification) { /* call Evolution API */ }
}

registry.register(new WhatsAppChannel())
```

## Adding a new event-to-notification rule

Add to `NOTIFICATION_RULES` in `engine.ts`:

```ts
'stock.low': {
  title: (e) => `Low stock: ${e.payload.productName}`,
  body: (e) => `${e.payload.currentStock} remaining`,
  priority: 'high',
}
```
