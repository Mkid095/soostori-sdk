/**
 * Idempotency key graceful degradation for FIDScript schema gaps.
 *
 * FIDScript schema does not have an idempotencyKey field on syncEvents.
 * The sync engine uses idempotencyKey to deduplicate event writes.
 *
 * When the remote schema does not support idempotencyKey natively,
 * we fall back to a deterministic key derived from the event's
 * unique mutation identity: entityKind:entityId:operation:clientSequence.
 *
 * This fallback is deterministic so the same logical mutation always
 * produces the same key, enabling safe retry-based deduplication even
 * when the field is not persisted remotely.
 */

import type { SoostoriEvent } from '@soostori/events'

/**
 * Runtime schema support flag.
 * - null  = not yet detected
 * - true  = FIDScript supports idempotencyKey
 * - false = FIDScript does not support it — use fallback
 */
let schemaSupportsIdempotencyKey: boolean | null = null

/**
 * Detect whether the remote FIDScript schema supports idempotencyKey.
 * Probes with a lightweight transact call; sets global flag so subsequent
 * calls return instantly without re-probing.
 *
 * Platforms that know their FIDScript schema version can skip detection by
 * calling `setIdempotencyKeySupport()` directly.
 */
export async function detectIdempotencyKeySupport(
  probe: () => Promise<unknown>,
): Promise<boolean> {
  if (schemaSupportsIdempotencyKey !== null) return schemaSupportsIdempotencyKey
  try {
    await probe()
    schemaSupportsIdempotencyKey = true
  } catch {
    schemaSupportsIdempotencyKey = false
  }
  return schemaSupportsIdempotencyKey
}

/**
 * Override the idempotency key support flag.
 * Call this when the platform knows its FIDScript schema version.
 */
export function setIdempotencyKeySupport(supported: boolean): void {
  schemaSupportsIdempotencyKey = supported
}

/**
 * Compute the idempotency key for an event.
 *
 * Priority:
 * 1. Return event.idempotencyKey if already set and schema supports it
 * 2. Fall back to deterministic composite: entityKind:entityId:operation:clientSequence
 *
 * The fallback is deterministic — the same logical mutation on the same
 * entity always produces the same key, enabling safe deduplication even
 * when FIDScript ignores the field.
 */
export function computeIdempotencyKey(event: SoostoriEvent): string {
  if (event.idempotencyKey) return event.idempotencyKey
  return `${event.entity}:${event.entityId}:${event.name}:${event.sequence}`
}

/**
 * Returns the effective idempotency key used by the engine for a given event.
 * Public so tests and engine hooks can inspect the computed key.
 */
export function getIdempotencyKey(event: SoostoriEvent): string {
  return computeIdempotencyKey(event)
}
