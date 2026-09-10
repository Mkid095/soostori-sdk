/**
 * TeamService — team invitation + membership management.
 *
 * Responsibilities:
 *   - inviteMember       — create a pending invitation
 *   - acceptInvitation  — convert invitation to active membership
 *   - removeMember       — revoke a membership
 *   - updateMemberRole   — change someone's role
 *   - assignPermission   — grant/revoke a specific capability
 *   - listPendingInvitations — all pending invites for the business
 *   - listMembers        — all active memberships for the business
 *
 * All mutations emit sync events via syncEngine.enqueue().
 * Invitations are append-only; only status transitions are updated.
 * Memberships are append-only; role/permission changes emit update events.
 */

import type {
  BusinessId, EmployeeId, ISO8601, PersonId, DeviceId,
} from '@soostori/core'
import { newId, asSyncEventId, asIdempotencyKey } from '@soostori/core'
import type { SyncEngine, SyncEvent, EntityKind } from '@soostori/contracts'

import type {
  TeamInvitation,
  TeamMembership,
  TeamInvitationStatus,
  InviteMemberInput,
  AcceptInvitationInput,
  UpdateMemberRoleInput,
  AssignPermissionInput,
} from './types.js'
import {
  TEAM_INVITATION_CREATED,
  TEAM_INVITATION_ACCEPTED,
  TEAM_INVITATION_EXPIRED,
  TEAM_INVITATION_REVOKED,
  TEAM_MEMBER_REMOVED,
  TEAM_MEMBER_ROLE_CHANGED,
  TEAM_MEMBER_PERMISSION_CHANGED,
} from './sync-events.js'

// ── Repository contract ───────────────────────────────────────────────────────

export interface TeamRepository {
  // Invitations
  upsertInvitation(invitation: TeamInvitation): Promise<void>
  getInvitation(id: string): Promise<TeamInvitation | null>
  listPendingInvitations(businessId: BusinessId): Promise<TeamInvitation[]>
  updateInvitationStatus(id: string, status: TeamInvitationStatus): Promise<void>

  // Memberships
  upsertMembership(membership: TeamMembership): Promise<void>
  getMembership(id: string): Promise<TeamMembership | null>
  getMembershipByEmployee(employeeId: EmployeeId): Promise<TeamMembership | null>
  listMembers(businessId: BusinessId): Promise<TeamMembership[]>
  deleteMembership(id: string): Promise<void>
}

// ── Service ───────────────────────────────────────────────────────────────────

export class TeamService {
  constructor(
    private readonly repo: TeamRepository,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: BusinessId,
    private readonly deviceId: DeviceId,
    private readonly employeeId: EmployeeId,
  ) {}

  // ── invite ───────────────────────────────────────────────────────────────────

  /**
   * Create a pending team invitation.
   *
   * Idempotent: if an identical idempotencyKey was already processed,
   * returns the existing invitation without creating a duplicate.
   */
  async inviteMember(input: InviteMemberInput): Promise<TeamInvitation> {
    if (input.businessId !== this.businessId) {
      throw new Error('Business isolation violation')
    }

    const existing = await this.repo.getInvitation(input.idempotencyKey)
    if (existing) return existing

    const now = new Date().toISOString() as ISO8601
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() as ISO8601

    const invitation: TeamInvitation = {
      id: input.idempotencyKey,
      businessId: this.businessId,
      invitedByEmployeeId: this.employeeId,
      email: input.email,
      role: input.role,
      status: 'pending',
      expiresAt,
      acceptedAt: null,
      createdAt: now,
    }

    await this.repo.upsertInvitation(invitation)
    await this.emit('team.invitation.created', invitation, 'create')

    return invitation
  }

  // ── accept ──────────────────────────────────────────────────────────────────

  /**
   * Accept a pending invitation and create an active membership.
   *
   * Idempotent: if the invitation is already accepted, returns without error.
   * Throws if invitation does not exist or belongs to a different business.
   */
  async acceptInvitation(
    invitationId: string,
    personId: PersonId,
    employeeId: EmployeeId,
  ): Promise<TeamMembership> {
    const invitation = await this.repo.getInvitation(invitationId)
    if (!invitation) throw new Error(`Invitation ${invitationId} not found`)
    if (invitation.businessId !== this.businessId) {
      throw new Error('Business isolation violation')
    }
    if (invitation.status !== 'pending') {
      throw new Error(`Invitation is ${invitation.status}, cannot accept`)
    }
    if (new Date(invitation.expiresAt) < new Date()) {
      await this.repo.updateInvitationStatus(invitationId, 'expired')
      await this.emit('team.invitation.expired', { ...invitation, status: 'expired' }, 'update')
      throw new Error('Invitation has expired')
    }

    const now = new Date().toISOString() as ISO8601

    await this.repo.updateInvitationStatus(invitationId, 'accepted')

    const membership: TeamMembership = {
      id: newId(),
      businessId: this.businessId,
      personId,
      employeeId,
      role: invitation.role,
      permissions: null,
      joinedAt: now,
    }

    await this.repo.upsertMembership(membership)
    await this.emit('team.invitation.accepted', { ...invitation, acceptedAt: now }, 'update')
    await this.emit('team.member.role_changed', membership, 'create')

    return membership
  }

  // ── remove ───────────────────────────────────────────────────────────────────

  /**
   * Remove a team member (hard delete of the membership row).
   *
   * Idempotent: returns without error if membership does not exist.
   */
  async removeMember(membershipId: string): Promise<void> {
    const membership = await this.repo.getMembership(membershipId)
    if (!membership) return
    if (membership.businessId !== this.businessId) {
      throw new Error('Business isolation violation')
    }

    await this.repo.deleteMembership(membershipId)
    await this.emit('team.member.removed', membership, 'delete')
  }

  // ── update role ─────────────────────────────────────────────────────────────

  /**
   * Update a member's role.
   *
   * Throws if membership does not exist or belongs to a different business.
   */
  async updateMemberRole(
    membershipId: string,
    changes: UpdateMemberRoleInput,
  ): Promise<TeamMembership> {
    const existing = await this.repo.getMembership(membershipId)
    if (!existing) throw new Error(`Membership ${membershipId} not found`)
    if (existing.businessId !== this.businessId) {
      throw new Error('Business isolation violation')
    }

    const updated: TeamMembership = { ...existing, role: changes.role }

    await this.repo.upsertMembership(updated)
    await this.emit('team.member.role_changed', updated, 'update')

    return updated
  }

  // ── assign permission ────────────────────────────────────────────────────────

  /**
   * Grant or revoke a specific capability override for a member.
   *
   * When `granted=true`: adds the capability to the member's override list.
   * When `granted=false`: removes the capability from the override list.
   * A null permissions array means "use role defaults" — this method
   * will initialise it to an empty array on first use.
   */
  async assignPermission(
    membershipId: string,
    input: AssignPermissionInput,
  ): Promise<TeamMembership> {
    const existing = await this.repo.getMembership(membershipId)
    if (!existing) throw new Error(`Membership ${membershipId} not found`)
    if (existing.businessId !== this.businessId) {
      throw new Error('Business isolation violation')
    }

    const current = existing.permissions ?? []
    const permissions = input.granted
      ? [...new Set([...current, input.capability])]
      : current.filter(c => c !== input.capability)

    const updated: TeamMembership = {
      ...existing,
      permissions: permissions.length > 0 ? permissions : null,
    }

    await this.repo.upsertMembership(updated)
    await this.emit('team.member.permission_changed', updated, 'update')

    return updated
  }

  // ── list ─────────────────────────────────────────────────────────────────────

  async listPendingInvitations(): Promise<TeamInvitation[]> {
    return this.repo.listPendingInvitations(this.businessId)
  }

  async listMembers(): Promise<TeamMembership[]> {
    return this.repo.listMembers(this.businessId)
  }

  // ── emit ─────────────────────────────────────────────────────────────────────

  private async emit(
    eventType: string,
    entity: TeamInvitation | TeamMembership,
    syncOp: SyncEvent['operation'],
  ): Promise<void> {
    const entityId = 'employeeId' in entity ? entity.employeeId : (entity as TeamInvitation).id
    const entityKind: EntityKind = 'email' in entity ? 'teamInvitation' : 'teamMembership'

    const event: SyncEvent = {
      id: asSyncEventId(newId()),
      idempotencyKey: asIdempotencyKey(`${entityId}:${eventType}`),
      businessId: this.businessId,
      entityKind,
      entityId: entity.id,
      operation: syncOp,
      originatingDeviceId: this.deviceId,
      originatingEmployeeId: this.employeeId,
      clientSequence: Date.now(),
      clientCreatedAt: new Date().toISOString(),
      entityVersion: 1,
      payload: entity as unknown as Record<string, unknown>,
      state: 'pending',
    }

    await this.syncEngine.enqueue(event)
  }
}
