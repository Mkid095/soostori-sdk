/**
 * @soostori/contracts — canonical Soostori data contract surface.
 *
 * Single source of truth for Web, Desktop, Mobile, and Cloud. Defines the 22
 * canonical entities and the SyncEvent / SyncEngine contract.
 *
 * Files:
 *   data-contract-1-identity.ts    Person / Business / Membership / Employee
 *   data-contract-2-operational.ts Device / Invitation / Product / Category / StockMovement
 *   data-contract-3-commerce.ts    Sale / SaleLineItem / Customer / Debt / DebtPayment / Expense
 *   data-contract-4a-platform.ts   Subscription / SalespersonApplication / SalespersonProfile / InfluencerProfile
 *   data-contract-4b-platform.ts   CommissionRule / CommissionLedger / AuthAuditEvent
 *   sync-contract.ts               SyncEvent / SyncEngine / NoOpSyncEngine
 */

export * from './data-contract-1-identity.js'
export * from './data-contract-2-operational.js'
export * from './data-contract-3-commerce.js'
export * from './data-contract-4a-platform.js'
export * from './data-contract-4b-platform.js'
export * from './sync-contract.js'
