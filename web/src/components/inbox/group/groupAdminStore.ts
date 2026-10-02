import { create } from 'zustand';
import {
  DEFAULT_GROUP_SETTINGS,
  type EditablePermission,
  type GroupMemberRole,
  type GroupPermissionScope,
  type GroupSettings,
} from './groupAdminTypes';

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
