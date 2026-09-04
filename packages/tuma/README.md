# @soostori/tuma

Tuma M-Pesa payment integration — STK push, sales, invoices, products.

## ⚠️ SECURITY

**NEVER** hardcode Tuma credentials in source code or commit them to git.

The SDK reads credentials from environment variables:

```bash
export TUMA_API_KEY=your_api_key_here
export TUMA_BUSINESS_EMAIL=your_business_email@example.com
```

The client throws if these are not set.

## Setup

1. Get a Tuma account at https://merchant.tuma.co.ke
2. Note your business email and API key from the dashboard
3. Set the env vars (do NOT commit `.env` files):

```bash
# .env.local (gitignored)
TUMA_API_KEY=your_api_key
TUMA_BUSINESS_EMAIL=you@example.com
```

4. Use the SDK:

```ts
import { createTumaClient } from '@soostori/tuma'

const tuma = createTumaClient()  // reads from env

// STK Push
const result = await tuma.stkPush({
  amount: 1000,
  phone: '254712345678',
  callbackUrl: 'https://your-app.com/callback',
  description: 'Order #123',
})

// Sales
await tuma.createSale({
  items: [{ product_id: '...', quantity: 2 }],
  customer_name: 'John',
  customer_phone: '254712345678',
  payment_method: 'mpesa',
});

// Invoices
await tuma.createInvoice({
  customer_name: 'Jane',
  customer_email: 'jane@example.com',
  items: [{ item_name: 'Service', quantity: 1, unit_price: 5000 }],
});
```

## API surface

| Method | Purpose |
|---|---|
| `stkPush()` | Initiate M-Pesa STK push (customer confirms on phone) |
| `createSale()` | Create sale with mpesa/cash payment |
| `createInvoice()` | Generate invoice with payment URL |
| `createProduct()` | Create product in Tuma catalog |
| `listBusinesses()` | List owned businesses |
| `getBusiness(id)` | Get specific business |
| `getBanks()` | List supported banks (no auth) |

## Callback handling

Parse incoming webhooks with `parseCallback(body)` from `@soostori/tuma/callback`.

## Base URL

`https://api.tuma.co.ke`

Override for staging via `createTumaClient({ baseUrl: '...' })` — but DO NOT use this to inject secrets.
