# @soostori/lan

LAN discovery + WebSocket protocol for Soostori terminals ↔ Primary Device.

Extracted from Desktop's existing sync infrastructure (`electron/sync/server.ts`, `discovery-service.ts`).

## Architecture

```
                Primary Device (runs PrimaryHost)
                         │ UDP broadcast (port 18793, every 5s)
        ┌────────────────┼────────────────┐
   Terminal 1    Terminal 2     Mobile
        │                │                │
        └────────────────┼────────────────┘
                         │ WebSocket (port 18792)
```

## Modules

| File | Purpose |
|---|---|
| `protocol.ts` | Constants (ports, magic, intervals) |
| `messages.ts` | Wire protocol — `DiscoveryAdvert`, `ClientMessage`, `ServerMessage` |
| `terminal.ts` | `TerminalClient` — runs on every non-primary device |
| `primary-host.ts` | `PrimaryHost` — runs only on the Primary Device |

## Transport injection

The SDK is platform-agnostic. Each platform provides a `LanTransport` impl:

- **Desktop**: uses Node `dgram` + `ws`
- **Mobile**: uses React Native UDP + WebSocket libraries
- **Web**: uses browser WebSocket + WebRTC for peer-to-peer

## Usage

```ts
import { PrimaryHost, TerminalClient } from '@soostori/lan'
import type { LanTransport, StockAuthorizer } from '@soostori/lan'

// On the Primary Device
const host = new PrimaryHost({
  shopId, primaryDeviceId, primaryDeviceName, shopName, appVersion: '1.0.0',
  validateToken: async (token) => tokens.get(token) ?? null,
  authorizer: myStockAuthorizer,
  transport: myLanTransport,
})
await host.start()
host.broadcast(productCreatedEvent)

// On a Terminal
const terminal = new TerminalClient({
  shopId, deviceId, deviceName, deviceType: 'desktop',
  pairingToken: '...', transport: myLanTransport, appVersion: '1.0.0',
})
await terminal.start()
```
