'use client';

/**
 * groupAdmin — the group-administration model for the info surface, ported
 * from mobile useGroupChatInfoData / useGroupMemberActions / group-settings.
 *
 * The web Conversation contract carries no `ownerId`/`memberRoles`/settings
 * fields, so authority is resolved in three honest layers:
 *
 *   1. Live fields — when a backend payload supplies ownerId/memberRoles
 *      (live mode responses do), they win.
 *   2. Session overrides — mutations made on this device (role changes,
 *      permission scope changes) persist for the session in a zustand
 *      store, mirroring the mobile store's conversation slice.
 *   3. Creator provenance — the fixture grammar marks viewer-created
 *      groups with a "You created the group" system message (authored
 *      fixtures and every createFixtureConversation group). The creator
 *      is the owner, matching the backend's create-group write.
 *
 * A group with no role data at all renders flat members — no fabricated
 * badges, no moderation powers.
 *
 * Fixture-mode writes mutate the CONVERSATIONS module dataset (the same
 * store pattern as appendFixtureMessage) and callers invalidate the
 * conversation queries so every surface re-reads one truth. Live mode
 * calls the same backend routes the mobile app uses.
 */

import { create } from 'zustand';
import type {
  Conversation,
  ConversationParticipant,
  User,
} from '@/lib/contracts/domain';
import {
  CONVERSATIONS,
  appendFixtureMessage,
  userById,
} from '@/lib/data/fixtures';

// ── Types ────────────────────────────────────────────────────────────────

export type GroupMemberRole = 'owner' | 'admin' | 'member';
export type GroupPermissionScope = 'admins' | 'everyone';
export type EditablePermission = 'editGroupInfo' | 'sendMessages' | 'addMembers';

export interface GroupSettings {
  editGroupInfo: GroupPermissionScope;
  sendMessages: GroupPermissionScope;
  addMembers: GroupPermissionScope;
}

export interface GroupCapabilities {
  canManage: boolean;
  canEditGroupInfo: boolean;
  canSendMessages: boolean;
  canAddMembers: boolean;
}

/** Mirrors DEFAULT_GROUP_SETTINGS in backend/api/src/routes/chat.ts — the
 *  row the backend returns for a group whose settings were never saved. */
export const DEFAULT_GROUP_SETTINGS: GroupSettings = {
  editGroupInfo: 'admins',
  sendMessages: 'everyone',
  addMembers: 'admins',
};

/** Admin fields a live payload may carry beyond the web contract — read
 *  defensively; absent on fixtures means "no role data", never fabricated. */
interface ConversationAdminFields {
  ownerId?: string;
  creatorId?: string;
  memberRoles?: Record<string, string>;
  createdAt?: string;
  isPinned?: boolean;
}

function adminFieldsOf(c: Conversation): ConversationAdminFields {
  return c as Conversation & ConversationAdminFields;
}

export function conversationCreatedAt(c: Conversation): string | undefined {
  return adminFieldsOf(c).createdAt;
}

// ── Session store ────────────────────────────────────────────────────────

interface GroupAdminState {
  /** convId → userId → role. Session-local authority changes. */
  roleOverrides: Record<string, Record<string, GroupMemberRole>>;
  /** convId → settings row. Session-local permission changes. */
  settingsOverrides: Record<string, GroupSettings>;
  setMemberRole: (conversationId: string, userId: string, role: GroupMemberRole) => void;
  /** Drop role rows for removed members (and prune stale overrides). */
  dropRoles: (conversationId: string, userIds: string[]) => void;
  setPermission: (
    conversationId: string,
    key: EditablePermission,
    scope: GroupPermissionScope,
  ) => void;
  /** Forget a conversation's admin slice (leave / delete-for-me). */
  forgetConversation: (conversationId: string) => void;
}

export const useGroupAdminStore = create<GroupAdminState>()((set) => ({
  roleOverrides: {},
  settingsOverrides: {},
  setMemberRole: (conversationId, userId, role) =>
    set((s) => ({
      roleOverrides: {
        ...s.roleOverrides,
        [conversationId]: {
          ...(s.roleOverrides[conversationId] ?? {}),
          [userId]: role,
        },
      },
    })),
  dropRoles: (conversationId, userIds) =>
    set((s) => {
      const current = s.roleOverrides[conversationId];
      if (!current) return s;
      const next = { ...current };
      for (const id of userIds) delete next[id];
      return { roleOverrides: { ...s.roleOverrides, [conversationId]: next } };
    }),
  setPermission: (conversationId, key, scope) =>
    set((s) => ({
      settingsOverrides: {
        ...s.settingsOverrides,
        [conversationId]: {
          ...(s.settingsOverrides[conversationId] ?? DEFAULT_GROUP_SETTINGS),
          [key]: scope,
        },
      },
    })),
  forgetConversation: (conversationId) =>
    set((s) => {
      const roleOverrides = { ...s.roleOverrides };
      const settingsOverrides = { ...s.settingsOverrides };
      delete roleOverrides[conversationId];
      delete settingsOverrides[conversationId];
      return { roleOverrides, settingsOverrides };
    }),
}));

// ── Role / capability derivations ────────────────────────────────────────

function sanitizeMemberRoles(
  raw?: Record<string, string>,
): Record<string, GroupMemberRole> | undefined {
  if (!raw) return undefined;
  const out: Record<string, GroupMemberRole> = {};
  for (const [id, role] of Object.entries(raw)) {
    if (role === 'owner' || role === 'admin' || role === 'member') out[id] = role;
  }
  return Object.keys(out).length ? out : undefined;
}

function isSystemMessage(m: Conversation['messages'][number]): boolean {
  return m.isSystem === true || m.type === 'system' || m.sender === 'system';
}

/** True when the thread's own data declares the viewer created the group —
 *  authored fixtures and session-created groups both emit the marker. */
function viewerCreatedGroup(c: Conversation): boolean {
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

/** The viewer's role — ownerId/creatorId on a live payload beats the map. */
export function viewerRole(
  c: Conversation,
  viewerId: string,
  overrides: Record<string, GroupMemberRole> | undefined,
): GroupMemberRole | undefined {
  const fields = adminFieldsOf(c);
  if (fields.ownerId === viewerId || fields.creatorId === viewerId) return 'owner';
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

// ── Fixture writes (mutate the module dataset — the fixture store pattern) ─

export function fixtureConversation(id: string): Conversation | undefined {
  return CONVERSATIONS.find((c) => c.id === id);
}

export function updateFixtureGroup(
  id: string,
  patch: {
    title?: string;
    description?: string;
    avatar?: string | null;
    coverPhoto?: string | null;
  },
): boolean {
  const c = fixtureConversation(id);
  if (!c || c.type !== 'group') return false;
  if (patch.title !== undefined) {
    c.title = patch.title;
    c.participantName = patch.title; // row/title fallbacks agree
  }
  if (patch.description !== undefined) c.description = patch.description;
  if (patch.avatar !== undefined) c.avatar = patch.avatar ?? undefined;
  if (patch.coverPhoto !== undefined) c.coverPhoto = patch.coverPhoto ?? undefined;
  return true;
}

export function addFixtureMembers(id: string, users: User[]): string[] {
  const c = fixtureConversation(id);
  if (!c || c.type !== 'group' || users.length === 0) return [];
  const existing = new Set(c.participantIds ?? c.participantProfiles?.map((p) => p.id) ?? []);
  const added = users.filter((u) => u.id && !existing.has(u.id));
  if (added.length === 0) return [];
  c.participantIds = [...(c.participantIds ?? ['me']), ...added.map((u) => u.id)];
  c.participantProfiles = [
    ...(c.participantProfiles ?? []),
    ...added.map(
      (u): ConversationParticipant => ({
        id: u.id,
        username: u.username,
        displayName: u.username,
        avatar: u.avatar ?? null,
        identityVerified: u.identityVerified ?? u.isVerified,
      }),
    ),
  ];
  const names = added.map((u) => u.username);
  appendFixtureMessage(id, {
    id: `local-${Date.now()}-add`,
    senderId: 'system',
    sender: 'system',
    isSystem: true,
    systemTitle:
      names.length === 1 ? `You added ${names[0]}` : `You added ${names.length} members`,
    timestamp: new Date().toISOString(),
  });
  return added.map((u) => u.id);
}

export function removeFixtureMember(id: string, userId: string): boolean {
  const c = fixtureConversation(id);
  if (!c || c.type !== 'group') return false;
  c.participantIds = c.participantIds?.filter((x) => x !== userId);
  c.participantProfiles = c.participantProfiles?.filter((p) => p.id !== userId);
  const name = userById(userId)?.username ?? 'A member';
  appendFixtureMessage(id, {
    id: `local-${Date.now()}-remove`,
    senderId: 'system',
    sender: 'system',
    isSystem: true,
    systemTitle: `${name} was removed from the group`,
    timestamp: new Date().toISOString(),
  });
  return true;
}

/** Clear-chat — mirrors mobile replaceConversationMessages(conversationId, []). */
export function clearFixtureChat(id: string): boolean {
  const c = fixtureConversation(id);
  if (!c) return false;
  c.messages = [];
  c.lastMessage = '';
  return true;
}

/** Delete-for-me / leave — removes the record from the fixture store. */
export function deleteFixtureConversation(id: string): boolean {
  const i = CONVERSATIONS.findIndex((c) => c.id === id);
  if (i === -1) return false;
  CONVERSATIONS.splice(i, 1);
  return true;
}

// ── Live writes — same routes the mobile chatApi calls ───────────────────

async function apiCall<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { fetchJson } = await import('@/lib/api/http');
  const body = init?.body;
  return fetchJson<T>(path, {
    method: init?.method ?? 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: typeof body === 'string' ? body : undefined,
  });
}

export const liveGroupApi = {
  updateInfo: (id: string, patch: Record<string, unknown>) =>
    apiCall(`/chat/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  addMembers: (id: string, memberIds: string[]) =>
    apiCall(`/chat/conversations/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ memberIds }),
    }),
  removeMember: (id: string, userId: string) =>
    apiCall(`/chat/conversations/${id}/members/${userId}`, { method: 'DELETE' }),
  setRole: (id: string, userId: string, role: GroupMemberRole) =>
    apiCall(`/chat/conversations/${id}/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  fetchSettings: (id: string) =>
    apiCall<{ settings: GroupSettings; capabilities: GroupCapabilities }>(
      `/chat/conversations/${id}/group-settings`,
    ),
  patchSettings: (id: string, updates: Partial<GroupSettings>) =>
    apiCall<{ settings: GroupSettings }>(`/chat/conversations/${id}/group-settings`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  deleteConversation: (id: string, scope: 'me' | 'leave' = 'me') =>
    apiCall(`/chat/conversations/${id}?scope=${scope}`, { method: 'DELETE' }),
};
