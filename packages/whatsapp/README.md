# @soostori/whatsapp

Self-hosted WhatsApp integration via Evolution API. No third-party tokens required.

## Environment variables

```bash
EVOLUTION_API_URL=https://evolution-api.example.com  # base URL of Evolution
EVOLUTION_INSTANCE=soostori                          # instance name in Evolution
EVOLUTION_API_KEY=...                                 # instance API key
```

**Never** commit secrets. Use `.env` files (gitignored).

## Architecture

```
Notification Engine
        │
        ▼
WhatsAppChannel (NotificationChannel impl)
        │
        ▼
EvolutionClient (HTTP)
        │
        ▼
Evolution API (self-hosted)
        │
        ▼
WhatsApp
```

## Usage

```ts
import { createEvolutionClient, WhatsAppChannel } from '@soostori/whatsapp'
import { NotificationChannelRegistry, NotificationEngine } from '@soostori/notifications'

const evolution = createEvolutionClient()  // reads from env

const channels = new NotificationChannelRegistry()
channels.register(new WhatsAppChannel(evolution, async (userId) => {
  // Look up phone from your user service
  return '+254712345678'
}))

const engine = new NotificationEngine({ channels, resolver: myRecipientResolver })
engine.dispatch(someEvent)  // auto-sends to WhatsApp if enabled
```
