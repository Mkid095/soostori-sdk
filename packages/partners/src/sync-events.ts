/**
 * Partner sync event names — canonical, single source of truth.
 *
 * Emitted by PartnerService + CommissionService so all platforms can sync.
 */

export const PARTNER_APPLICATION_SUBMITTED = 'partner.application_submitted'
export const PARTNER_APPROVED              = 'partner.approved'
export const PARTNER_REJECTED              = 'partner.rejected'
export const PARTNER_ENROLLED              = 'partner.enrolled'
export const CONVERSION_QUALIFIED          = 'conversion.qualified'
export const COMMISSION_CREATED            = 'commission.created'

export const ALL_PARTNER_EVENTS = [
  PARTNER_APPLICATION_SUBMITTED,
  PARTNER_APPROVED,
  PARTNER_REJECTED,
  PARTNER_ENROLLED,
  CONVERSION_QUALIFIED,
  COMMISSION_CREATED,
] as const

export type PartnerEventName = typeof ALL_PARTNER_EVENTS[number]
