# @soostori/commercial

Commercial — Package enrollment and commission aggregation for the Soostori platform.

## Overview

The `@soostori/commercial` package provides:

- **CommissionService** — aggregates commission data per salesperson from active Package enrollments
- **PackageRepository** — data access contract for platform-specific FIDScript persistence

## Commission Model

Commission splits are computed via `calculateCommission()` from `@soostori/contracts`:

| Recipient | Formula |
|---|---|
| Company | 500 + 25% × max(0, amount − 600) |
| Salesperson | 100 + 75% × max(0, amount − 600) |
| Influencer | 50 flat (paid by company) |

## Modules

| File | Purpose |
|---|---|
| `types.ts` | `CommissionSummary`, `EnrolledBusiness` |
| `PackageRepository.ts` | Repository interface for Package CRUD |
| `CommissionService.ts` | `getCommissionSummary()` — aggregates enrolled businesses + commission shares |

## Usage

```ts
import { CommissionService } from '@soostori/commercial'
import type { PackageRepository } from '@soostori/commercial'

// Platform provides a FIDScript-backed implementation
const repo: PackageRepository = platform.createPackageRepository()
const svc = new CommissionService(repo)

const summary = await svc.getCommissionSummary(salespersonCloudId)
console.log(`Total commission: ${summary.totalSalespersonCommission} KES`)
```
