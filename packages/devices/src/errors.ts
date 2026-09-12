/**
 * Device service errors.
 */

export class LanHostRequiredError extends Error {
  constructor(message = 'A LAN host device is required to author stock operations') {
    super(message)
    this.name = 'LanHostRequiredError'
  }
}
