import type { Conversation } from '@/lib/contracts/domain';
import {
  adminFieldsOf,
  DEFAULT_GROUP_SETTINGS,
  type GroupCapabilities,
  type GroupMemberRole,
  type GroupSettings,
} from './groupAdminTypes';

export function sanitizeMemberRoles(
  raw?: Record<string, string>,
): Record<string, GroupMemberRole> | undefined {
  if (!raw) return undefined;
  const out: Record<string, GroupMemberRole> = {};
  for (const [id, role] of Object.entries(raw)) {
    if (role === 'owner' || role === 'admin' || role === 'member') out[id] = role;
  }
  return Object.keys(out).length ? out : undefined;
}

export function isSystemMessage(m: Conversation['messages'][number]): boolean {
  return m.isSystem === true || m.type === 'system' || m.sender === 'system';
}

/** True when the thread's own data declares the viewer created the group —
 *  authored fixtures and session-created groups both emit the marker. */
export function viewerCreatedGroup(c: Conversation): boolean {
  return c.messages.some(
    (m) => isSystemMessage(m) && /you created the group/i.test(m.systemTitle ?? m.text ?? ''),
  );
}

/**
 * Effective member roles — live memberRoles merged with session overrides;
 * absent role data falls back to creator provenance (viewer = owner,
 * everyone else member). Returns undefined when the data honestly carries
 * no roles — the surface renders members flat, no badges.
 */
export function memberRolesFor(
  c: Conversation,
  viewerId: string,
  overrides: Record<string, GroupMemberRole> | undefined,
): Record<string, GroupMemberRole> | undefined {
  const live = sanitizeMemberRoles(adminFieldsOf(c).memberRoles);
  if (live || overrides) return { ...live, ...overrides };
  if (!viewerCreatedGroup(c)) return undefined;
  const roles: Record<string, GroupMemberRole> = {};
  for (const p of c.participantProfiles ?? []) {
    roles[p.id] = p.id === viewerId ? 'owner' : 'member';
  }
  for (const id of c.participantIds ?? []) {
    roles[id] = roles[id] ?? (id === viewerId ? 'owner' : 'member');
  }
  roles[viewerId] = 'owner';
  return roles;
}

/** The viewer's role — an explicit ownerId is authoritative (it moves on
 *  transfer); creatorId is only an owner proxy when no ownerId is present. */
export function viewerRole(
  c: Conversation,
  viewerId: string,
  overrides: Record<string, GroupMemberRole> | undefined,
): GroupMemberRole | undefined {
  const fields = adminFieldsOf(c);
  if (fields.ownerId === viewerId) return 'owner';
  if (fields.ownerId == null && fields.creatorId === viewerId) return 'owner';
  return memberRolesFor(c, viewerId, overrides)?.[viewerId];
}

/** Owner or admin — the backend's canManage test. */
export function isGroupManager(
  c: Conversation,
  viewerId: string,
  overrides: Record<string, GroupMemberRole> | undefined,
): boolean {
  const role = viewerRole(c, viewerId, overrides);
  return role === 'owner' || role === 'admin';
}

/** Effective settings — session override, else the backend default row. */
export function groupSettingsFor(
  c: Conversation,
  overrides: GroupSettings | undefined,
): GroupSettings {
  return overrides ?? DEFAULT_GROUP_SETTINGS;
}

/**
 * Capability derivation — the exact formula the backend's
 * GET /group-settings handler applies: canManage OR scope === 'everyone'.
 */
export function capabilitiesFor(
  settings: GroupSettings,
  canManage: boolean,
): GroupCapabilities {
  return {
    canManage,
    canEditGroupInfo: canManage || settings.editGroupInfo === 'everyone',
    canSendMessages: canManage || settings.sendMessages === 'everyone',
    canAddMembers: canManage || settings.addMembers === 'everyone',
  };
}
