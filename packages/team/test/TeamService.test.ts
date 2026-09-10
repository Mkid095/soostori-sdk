/**
 * TeamService tests — all service methods covered.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TeamRepository } from '../src/TeamService.js'
import type { SyncEngine } from '@soostori/contracts'
import { TeamService } from '../src/TeamService.js'
import type { BusinessId, EmployeeId, PersonId, DeviceId } from '@soostori/core'
import { newId } from '@soostori/core'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSyncEngine(): SyncEngine {
  return {
    enqueue: vi.fn().mockResolvedValue({ state: 'queued' as const }),
    pull:    vi.fn().mockResolvedValue([]),
    apply:   vi.fn().mockReturnValue({ state: 'applied' as const, entityVersion: 1 }),
  }
}

function mockRepo(): TeamRepository {
  const invitations = new Map<string, any>()
  const memberships = new Map<string, any>()

  return {
    upsertInvitation: vi.fn(async (inv) => { invitations.set(inv.id, inv) }),
    getInvitation:    vi.fn(async (id) => invitations.get(id) ?? null),
    listPendingInvitations: vi.fn(async (bizId) =>
      [...invitations.values()].filter(i => i.businessId === bizId && i.status === 'pending')
    ),
    updateInvitationStatus: vi.fn(async (id, status) => {
      const inv = invitations.get(id)
      if (inv) invitations.set(id, { ...inv, status })
    }),
    upsertMembership: vi.fn(async (m) => { memberships.set(m.id, m) }),
    getMembership:     vi.fn(async (id) => memberships.get(id) ?? null),
    getMembershipByEmployee: vi.fn(async (eid) =>
      [...memberships.values()].find(m => m.employeeId === eid) ?? null
    ),
    listMembers: vi.fn(async (bizId) =>
      [...memberships.values()].filter(m => m.businessId === bizId)
    ),
    deleteMembership: vi.fn(async (id) => { memberships.delete(id) }),
  }
}

const BIZ_ID    = 'biz-001' as BusinessId
const DEVICE_ID = 'device-001' as DeviceId
const EMP_ID   = 'emp-owner-001' as EmployeeId

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TeamService', () => {

  // ── inviteMember ────────────────────────────────────────────────────────────

  describe('inviteMember', () => {
    it('creates a pending invitation with correct fields', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      const inv = await svc.inviteMember({
        businessId: BIZ_ID,
        email: 'alice@example.com',
        role: 'manager',
        idempotencyKey: 'ikey-001',
      })

      expect(inv.email).toBe('alice@example.com')
      expect(inv.role).toBe('manager')
      expect(inv.status).toBe('pending')
      expect(inv.businessId).toBe(BIZ_ID)
      expect(inv.invitedByEmployeeId).toBe(EMP_ID)
      expect(inv.expiresAt).toBeDefined()
      expect(inv.acceptedAt).toBeNull()
      expect(inv.createdAt).toBeDefined()
    })

    it('emits team.invitation.created sync event', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await svc.inviteMember({ businessId: BIZ_ID, email: 'bob@example.com', role: 'cashier', idempotencyKey: 'ikey-002' })

      expect(sync.enqueue).toHaveBeenCalled()
      const event = (sync.enqueue as any).mock.calls[0][0]
      expect(event.entityKind).toBe('teamInvitation')
      expect(event.operation).toBe('create')
    })

    it('is idempotent by idempotency key', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      const first = await svc.inviteMember({ businessId: BIZ_ID, email: 'x@y.com', role: 'viewer', idempotencyKey: 'ikey-003' })
      const second = await svc.inviteMember({ businessId: BIZ_ID, email: 'x@y.com', role: 'viewer', idempotencyKey: 'ikey-003' })

      expect(first.id).toBe(second.id)
      expect((repo.upsertInvitation as any).mock.calls.length).toBe(1)
    })

    it('throws on business isolation violation', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await expect(svc.inviteMember({
        businessId: 'other-biz' as BusinessId,
        email: 'x@y.com',
        role: 'viewer',
        idempotencyKey: 'ikey-004',
      })).rejects.toThrow('Business isolation violation')
    })
  })

  // ── acceptInvitation ────────────────────────────────────────────────────────

  describe('acceptInvitation', () => {
    it('converts pending invitation to active membership', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await svc.inviteMember({ businessId: BIZ_ID, email: 'carol@example.com', role: 'manager', idempotencyKey: 'ikey-010' })

      const personId = 'person-001' as PersonId
      const employeeId = 'emp-001' as EmployeeId

      const membership = await svc.acceptInvitation('ikey-010', personId, employeeId)

      expect(membership.role).toBe('manager')
      expect(membership.personId).toBe(personId)
      expect(membership.employeeId).toBe(employeeId)
      expect(membership.businessId).toBe(BIZ_ID)
      expect(membership.permissions).toBeNull()
    })

    it('emits team.invitation.accepted and team.member.role_changed events', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await svc.inviteMember({ businessId: BIZ_ID, email: 'dave@example.com', role: 'viewer', idempotencyKey: 'ikey-011' })
      await svc.acceptInvitation('ikey-011', 'person-002' as PersonId, 'emp-002' as EmployeeId)

      expect((sync.enqueue as any).mock.calls.length).toBe(3) // invite + accept + role_changed
    })

    it('throws when invitation does not exist', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await expect(svc.acceptInvitation('not-found', 'person-x' as PersonId, 'emp-x' as EmployeeId))
        .rejects.toThrow('not found')
    })

    it('throws when invitation is already accepted', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await svc.inviteMember({ businessId: BIZ_ID, email: 'eve@example.com', role: 'attendant', idempotencyKey: 'ikey-012' })
      await svc.acceptInvitation('ikey-012', 'person-003' as PersonId, 'emp-003' as EmployeeId)

      await expect(svc.acceptInvitation('ikey-012', 'person-004' as PersonId, 'emp-004' as EmployeeId))
        .rejects.toThrow('cannot accept')
    })

    it('throws when invitation has expired', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      // Directly insert an expired invitation
      await repo.upsertInvitation({
        id: 'expired-ikey',
        businessId: BIZ_ID,
        invitedByEmployeeId: EMP_ID,
        email: 'frank@example.com',
        role: 'cashier',
        status: 'pending',
        expiresAt: '2020-01-01T00:00:00.000Z',
        acceptedAt: null,
        createdAt: '2020-01-01T00:00:00.000Z',
      })

      await expect(svc.acceptInvitation('expired-ikey', 'person-005' as PersonId, 'emp-005' as EmployeeId))
        .rejects.toThrow('expired')
    })
  })

  // ── removeMember ────────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('deletes an existing membership', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await svc.inviteMember({ businessId: BIZ_ID, email: 'grace@example.com', role: 'manager', idempotencyKey: 'ikey-020' })
      const membership = await svc.acceptInvitation('ikey-020', 'person-010' as PersonId, 'emp-010' as EmployeeId)

      await svc.removeMember(membership.id)

      expect(repo.deleteMembership).toHaveBeenCalledWith(membership.id)
    })

    it('emits team.member.removed sync event', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await svc.inviteMember({ businessId: BIZ_ID, email: 'heidi@example.com', role: 'viewer', idempotencyKey: 'ikey-021' })
      const membership = await svc.acceptInvitation('ikey-021', 'person-011' as PersonId, 'emp-011' as EmployeeId)

      await svc.removeMember(membership.id)

      const events = (sync.enqueue as any).mock.calls.map((c: any[]) => c[0].entityKind)
      expect(events).toContain('teamMembership')
    })

    it('is idempotent when membership does not exist', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await expect(svc.removeMember('nonexistent')).resolves.toBeUndefined()
    })
  })

  // ── updateMemberRole ────────────────────────────────────────────────────────

  describe('updateMemberRole', () => {
    it('updates the member role', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await svc.inviteMember({ businessId: BIZ_ID, email: 'ivan@example.com', role: 'viewer', idempotencyKey: 'ikey-030' })
      const membership = await svc.acceptInvitation('ikey-030', 'person-020' as PersonId, 'emp-020' as EmployeeId)

      const updated = await svc.updateMemberRole(membership.id, { role: 'manager' })

      expect(updated.role).toBe('manager')
    })

    it('emits team.member.role_changed sync event', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await svc.inviteMember({ businessId: BIZ_ID, email: 'judy@example.com', role: 'cashier', idempotencyKey: 'ikey-031' })
      const membership = await svc.acceptInvitation('ikey-031', 'person-021' as PersonId, 'emp-021' as EmployeeId)

      await svc.updateMemberRole(membership.id, { role: 'manager' })

      const events = (sync.enqueue as any).mock.calls.map((c: any[]) => c[0].entityKind)
      expect(events).toContain('teamMembership')
    })

    it('throws when membership not found', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await expect(svc.updateMemberRole('not-found', { role: 'manager' }))
        .rejects.toThrow('not found')
    })
  })

  // ── assignPermission ────────────────────────────────────────────────────────

  describe('assignPermission', () => {
    it('grants a capability', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await svc.inviteMember({ businessId: BIZ_ID, email: 'ken@example.com', role: 'viewer', idempotencyKey: 'ikey-040' })
      const membership = await svc.acceptInvitation('ikey-040', 'person-030' as PersonId, 'emp-030' as EmployeeId)

      const updated = await svc.assignPermission(membership.id, { capability: 'team.view', granted: true })

      expect(updated.permissions).toContain('team.view')
    })

    it('revokes a capability', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await svc.inviteMember({ businessId: BIZ_ID, email: 'laura@example.com', role: 'viewer', idempotencyKey: 'ikey-041' })
      const membership = await svc.acceptInvitation('ikey-041', 'person-031' as PersonId, 'emp-031' as EmployeeId)

      await svc.assignPermission(membership.id, { capability: 'team.view', granted: true })
      const afterGrant = await svc.assignPermission(membership.id, { capability: 'team.view', granted: false })

      expect(afterGrant.permissions ?? []).not.toContain('team.view')
    })

    it('emits team.member.permission_changed sync event', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await svc.inviteMember({ businessId: BIZ_ID, email: 'mallory@example.com', role: 'viewer', idempotencyKey: 'ikey-042' })
      const membership = await svc.acceptInvitation('ikey-042', 'person-032' as PersonId, 'emp-032' as EmployeeId)

      await svc.assignPermission(membership.id, { capability: 'team.invite', granted: true })

      const events = (sync.enqueue as any).mock.calls.map((c: any[]) => c[0].payload)
      expect(events.some((p: any) => Array.isArray(p?.permissions) && p.permissions.includes('team.invite'))).toBe(true)
    })
  })

  // ── listPendingInvitations ──────────────────────────────────────────────────

  describe('listPendingInvitations', () => {
    it('returns only pending invitations for the business', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await svc.inviteMember({ businessId: BIZ_ID, email: 'a@example.com', role: 'viewer', idempotencyKey: 'ikey-050' })
      await svc.inviteMember({ businessId: BIZ_ID, email: 'b@example.com', role: 'cashier', idempotencyKey: 'ikey-051' })

      const list = await svc.listPendingInvitations()
      expect(list).toHaveLength(2)
      expect(list.every(i => i.status === 'pending')).toBe(true)
    })

    it('returns empty list when no pending invitations', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      const list = await svc.listPendingInvitations()
      expect(list).toHaveLength(0)
    })
  })

  // ── listMembers ─────────────────────────────────────────────────────────────

  describe('listMembers', () => {
    it('returns all active members for the business', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      await svc.inviteMember({ businessId: BIZ_ID, email: 'm1@example.com', role: 'owner', idempotencyKey: 'ikey-060' })
      await svc.acceptInvitation('ikey-060', 'person-040' as PersonId, 'emp-040' as EmployeeId)
      await svc.inviteMember({ businessId: BIZ_ID, email: 'm2@example.com', role: 'cashier', idempotencyKey: 'ikey-061' })
      await svc.acceptInvitation('ikey-061', 'person-041' as PersonId, 'emp-041' as EmployeeId)

      const members = await svc.listMembers()
      expect(members).toHaveLength(2)
    })

    it('returns empty list when no members', async () => {
      const repo = mockRepo()
      const sync = mockSyncEngine()
      const svc = new TeamService(repo, sync, BIZ_ID, DEVICE_ID, EMP_ID)

      const members = await svc.listMembers()
      expect(members).toHaveLength(0)
    })
  })
})
