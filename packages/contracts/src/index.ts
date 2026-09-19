/**
 * @soostori/contracts — public entry point.
 *
 * Canonical Soostori data + sync contract. See `./data-contract.ts` for the
 * 22 entity types and `./sync-contract.ts` for the SyncEvent / SyncEngine
 * surface (including `NoOpSyncEngine`).
 *
 * Cycle 05 additionally exports `SyncEngineClass` (real engine), `InstantClient`
 * interface, and `NoopInstantClient` (placeholder) from `./sync-engine.ts`.
 */

export * from './data-contract.js'
export * from './sync-contract.js'
export * from './file-types.js'
export { SyncEngineClass, type InstantClient } from './sync-engine.js'
export { NoOpSyncEngineClass, NoOpSyncEngine, type QueuedSyncEvent } from './sync-stub.js'
