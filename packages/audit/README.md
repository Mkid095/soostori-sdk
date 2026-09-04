# @soostori/audit

Immutable audit log — security-sensitive business actions.

## Why centralize audit?

Regulatory/compliance reasons:
- Audit entries must NEVER be modified or deleted by application code
- All three apps must produce the same audit record format
- Entries must be tamper-evident

Centralizing in the SDK prevents drift and makes compliance auditing easier.

## How it works

`AuditRecorder` subscribes to `@soostori/events` for known auditable events and converts them into immutable audit entries.

```
sale.confirmed        ──►  AuditRecorder.record()
                                │
                                ▼
                           AuditEntry (immutable)
```

## Auditable events

- All `sale.*`, `product.*`, `customer.*`, `debt.*`, `auth.*`, `device.*`, `subscription.*`
- `audit.*` (manual audit events)
- Any explicit event through `record()`

## Usage

```ts
import { AuditRecorder } from '@soostori/audit'

const recorder = new AuditRecorder(myAuditStorage)
const unsubscribe = recorder.attach(() => getEventBus())

// All sale events now produce audit entries automatically.

// Manual record (for non-event actions)
await recorder.record(someEvent)
```
