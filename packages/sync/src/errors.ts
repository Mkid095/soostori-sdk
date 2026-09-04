/**
 * Errors thrown by the sync engine.
 */

import { SoostoriError } from '@soostori/core'

/**
 * Stock authorization blocked — Primary Device is not in a state that
 * can authorize stock mutations.
 *
 * Thrown when a stock-sensitive operation is attempted while:
 *   - Primary is STALE (heartbeat older than freshness window)
 *   - Primary is LOST (heartbeat older than lost grace)
 *   - No Primary has been elected
 *   - Primary has been revoked
 *
 * Caller SHOULD:
 *   - Display a banner explaining the sync state
 *   - Option to queue the operation for retry when Primary returns
 */
export class StockAuthorizationError extends SoostoriError {
  constructor(message: string) {
    super('STOCK_AUTHORIZATION_BLOCKED', message)
    this.name = 'StockAuthorizationError'
  }
}
