/**
 * Team sync event names — canonical, single source of truth.
 *
 * Emitted by TeamService on every mutation so all platforms can sync.
 */

export const TEAM_INVITATION_CREATED  = 'team.invitation.created'
export const TEAM_INVITATION_ACCEPTED = 'team.invitation.accepted'
export const TEAM_INVITATION_EXPIRED  = 'team.invitation.expired'
export const TEAM_INVITATION_REVOKED  = 'team.invitation.revoked'
export const TEAM_MEMBER_REMOVED      = 'team.member.removed'
export const TEAM_MEMBER_ROLE_CHANGED = 'team.member.role_changed'
export const TEAM_MEMBER_PERMISSION_CHANGED = 'team.member.permission_changed'

export const ALL_TEAM_EVENTS = [
  TEAM_INVITATION_CREATED,
  TEAM_INVITATION_ACCEPTED,
  TEAM_INVITATION_EXPIRED,
  TEAM_INVITATION_REVOKED,
  TEAM_MEMBER_REMOVED,
  TEAM_MEMBER_ROLE_CHANGED,
  TEAM_MEMBER_PERMISSION_CHANGED,
] as const

export type TeamEventName = typeof ALL_TEAM_EVENTS[number]
