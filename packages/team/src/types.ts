/**
 * Team package — canonical types for team invitations and memberships.
 *
 * Phase 14: TeamService + TeamInvitation + TeamMembership.
 */

import type { BusinessId, EmployeeId, EmployeeRole, ISO8601, PersonId } from '@soostori/core'
import type { Capability } from '@soostori/auth'

// ── Invitation status ─────────────────────────────────────────────────────────

export type TeamInvitationStatus = 'pending' | 'accepted' | 'expired'

// ── TeamInvitation ────────────────────────────────────────────────────────────

/**
 * An invitation to join a business as a specific role.
 *
 * Lifecycle:
 *   pending → accepted  (when invitee accepts)
 *   pending → expired   (when expiresAt passes without acceptance)
 *   pending → revoked  (owner cancels before acceptance)
 */
export interface TeamInvitation {
  id: string
  businessId: BusinessId
  invitedByEmployeeId: EmployeeId
  email: string
  role: EmployeeRole
  status: TeamInvitationStatus
  expiresAt: ISO8601
  acceptedAt: ISO8601 | null
  createdAt: ISO8601
}

// ── TeamMembership ────────────────────────────────────────────────────────────

/**
 * An active member of a business.
 *
 * The join row between Person (cloud identity) and Business (tenant),
 * enriched with the employee's role within that business and optional
 * per-capability overrides.
 */
export interface TeamMembership {
  id: string
  businessId: BusinessId
  personId: PersonId
  employeeId: EmployeeId
  role: EmployeeRole
  /** Explicit capability overrides — null means use role defaults. */
  permissions: Capability[] | null
  joinedAt: ISO8601
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface InviteMemberInput {
  businessId: BusinessId
  email: string
  role: EmployeeRole
  /** Idempotency key — UUID per invite request. */
  idempotencyKey: string
}

export interface AcceptInvitationInput {
  invitationId: string
  personId: PersonId
  employeeId: EmployeeId
}

export interface UpdateMemberRoleInput {
  role: EmployeeRole
}

export interface AssignPermissionInput {
  /** Capability to grant or revoke. */
  capability: Capability
  /** true = grant, false = revoke. */
  granted: boolean
}

export interface RemoveMemberInput {
  membershipId: string
}
