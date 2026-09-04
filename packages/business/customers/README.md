# @soostori/customers

Customer domain — extracted from Desktop's customers table.

Customers are **non-stock** operations, so they can run offline without Primary Device coordination. They sync via `@soostori/sync` when online.

## Contents

| File | Purpose |
|---|---|
| `types.ts` | `Customer`, `CustomerRiskFlag` |
| `repository.ts` | Storage abstraction |
| `service.ts` | Business logic with event emission |

## Events

- `customer.created`
- `customer.updated`
- `customer.flagged` (cross-shop risk warning)
