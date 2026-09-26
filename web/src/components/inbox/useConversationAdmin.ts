'use client';

/**
 * useConversationAdmin — the mutation + capability hooks behind the
 * conversation info surface. Fixture mode mutates the CONVERSATIONS module
 * dataset and session stores, then re-issues fresh query-cache references
 * (the useSendChatMessage pattern); live mode calls the same backend routes
 * as the mobile chatApi. Every action returns whether it succeeded so the
 * caller owns toasts and navigation.
 */

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import type { Conversation, User } from '@/lib/contracts/domain';
import {
  addFixtureMembers,
  capabilitiesFor,
  clearFixtureChat,
  deleteFixtureConversation,
  groupSettingsFor,
  isGroupManager,
  liveGroupApi,
  removeFixtureMember,
  updateFixtureGroup,
  useGroupAdminStore,
  type EditablePermission,
  type GroupCapabilities,
  type GroupMemberRole,
  type GroupPermissionScope,
  type GroupSettings,
} from './groupAdmin';

/** Re-issue fresh references around the mutated fixture objects so every
 *  subscribed surface re-renders on the same write. */
function useInvalidateConversation(conversationId: string) {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.setQueryData<Conversation | null>(['conversation', conversationId], (old) =>
      old ? { ...old, messages: [...old.messages] } : old,
    );
    qc.setQueryData<Conversation[]>(['conversations'], (old) => (old ? [...old] : old));
    void qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  }, [qc, conversationId]);
}

/**
 * Group settings + capabilities — fixture mode returns the backend default
 * row scoped by the viewer's derived role; live mode reads
 * GET /group-settings (fail-closed like mobile: a fetch error keeps
 * capabilities at the role-derived floor rather than inventing authority).
 */
export function useGroupCapabilities(
  conversation: Conversation | null | undefined,
  viewerId: string,
) {
  const overrides = useGroupAdminStore((s) =>
    conversation ? s.settingsOverrides[conversation.id] : undefined,
  );
  const roleOverrides = useGroupAdminStore((s) =>
    conversation ? s.roleOverrides[conversation.id] : undefined,
  );
  const setPermissionStore = useGroupAdminStore((s) => s.setPermission);
  const [liveCaps, setLiveCaps] = useState<GroupCapabilities | null>(null);
  const [liveSettings, setLiveSettings] = useState<GroupSettings | null>(null);
  const [settingsFailed, setSettingsFailed] = useState(false);

  const isGroup = conversation?.type === 'group';
  const conversationId = conversation?.id;

  useEffect(() => {
    setLiveCaps(null);
    setLiveSettings(null);
    setSettingsFailed(false);
    if (!isGroup || !conversationId || DATA_MODE !== 'live') return;
    let active = true;
    liveGroupApi
      .fetchSettings(conversationId)
      .then((snapshot) => {
        if (!active) return;
        setLiveSettings(snapshot.settings);
        setLiveCaps(snapshot.capabilities);
      })
      .catch(() => {
        // Role-derived access remains the honest fallback while the
        // settings endpoint is unavailable — mutations stay server-gated.
        if (active) setSettingsFailed(true);
      });
    return () => {
      active = false;
    };
  }, [conversationId, isGroup]);

  const settings = conversation
    ? (overrides ?? liveSettings ?? groupSettingsFor(conversation, undefined))
    : null;
  const manager = conversation
    ? isGroupManager(conversation, viewerId, roleOverrides)
    : false;
  const capabilities: GroupCapabilities | null =
    conversation && settings
      ? (liveCaps ?? capabilitiesFor(settings, manager))
      : null;

  const setPermission = useCallback(
    async (key: EditablePermission, scope: GroupPermissionScope) => {
      if (!conversationId) return false;
      // Optimistic session write — reverted by the caller's error path only
      // if the live PATCH actually fails.
      setPermissionStore(conversationId, key, scope);
      if (DATA_MODE === 'live') {
        try {
          const res = await liveGroupApi.patchSettings(conversationId, { [key]: scope });
          setLiveSettings(res.settings);
        } catch {
          return false;
        }
      }
      return true;
    },
    [conversationId, setPermissionStore],
  );

  return { settings, capabilities, setPermission, settingsFailed };
}

/** All admin actions for a conversation — group and DM alike. */
export function useConversationAdmin(conversation: Conversation | null | undefined) {
  const invalidate = useInvalidateConversation(conversation?.id ?? '');
  const setMemberRoleStore = useGroupAdminStore((s) => s.setMemberRole);
  const dropRolesStore = useGroupAdminStore((s) => s.dropRoles);
  const forgetConversation = useGroupAdminStore((s) => s.forgetConversation);

  const updateGroupInfo = useCallback(
    async (patch: {
      title?: string;
      description?: string;
      avatar?: string | null;
      coverPhoto?: string | null;
    }): Promise<boolean> => {
      if (!conversation) return false;
      if (DATA_MODE === 'live') {
        try {
          await liveGroupApi.updateInfo(conversation.id, patch);
          invalidate();
          return true;
        } catch {
          return false;
        }
      }
      const ok = updateFixtureGroup(conversation.id, patch);
      if (ok) invalidate();
      return ok;
    },
    [conversation, invalidate],
  );

  const addMembers = useCallback(
    async (users: User[]): Promise<boolean> => {
      if (!conversation || users.length === 0) return false;
      if (DATA_MODE === 'live') {
        try {
          await liveGroupApi.addMembers(
            conversation.id,
            users.map((u) => u.id),
          );
          invalidate();
          return true;
        } catch {
          return false;
        }
      }
      const addedIds = addFixtureMembers(conversation.id, users);
      if (addedIds.length === 0) return false;
      for (const id of addedIds) setMemberRoleStore(conversation.id, id, 'member');
      invalidate();
      return true;
    },
    [conversation, invalidate, setMemberRoleStore],
  );

  const removeMember = useCallback(
    async (userId: string): Promise<boolean> => {
      if (!conversation) return false;
      if (DATA_MODE === 'live') {
        try {
          await liveGroupApi.removeMember(conversation.id, userId);
          invalidate();
          return true;
        } catch {
          return false;
        }
      }
      const ok = removeFixtureMember(conversation.id, userId);
      if (ok) {
        dropRolesStore(conversation.id, [userId]);
        invalidate();
      }
      return ok;
    },
    [conversation, invalidate, dropRolesStore],
  );

  const setMemberRole = useCallback(
    async (userId: string, role: GroupMemberRole): Promise<boolean> => {
      if (!conversation) return false;
      if (DATA_MODE === 'live') {
        try {
          await liveGroupApi.setRole(conversation.id, userId, role);
        } catch {
          return false;
        }
      }
      setMemberRoleStore(conversation.id, userId, role);
      invalidate();
      return true;
    },
    [conversation, invalidate, setMemberRoleStore],
  );

  const clearChat = useCallback(async (): Promise<boolean> => {
    if (!conversation) return false;
    if (DATA_MODE === 'live') {
      // Live has no clear-history endpoint — delete-for-me is the honest
      // server edge, so a live clear is not faked locally.
      return false;
    }
    const ok = clearFixtureChat(conversation.id);
    if (ok) invalidate();
    return ok;
  }, [conversation, invalidate]);

  /** Delete-for-me (DM "Remove from inbox") or leave (group). Removes the
   *  record — the thread routes then render their not-found state. */
  const removeConversation = useCallback(
    async (scope: 'me' | 'leave'): Promise<boolean> => {
      if (!conversation) return false;
      if (DATA_MODE === 'live') {
        try {
          await liveGroupApi.deleteConversation(conversation.id, scope);
        } catch {
          return false;
        }
      } else if (!deleteFixtureConversation(conversation.id)) {
        return false;
      }
      forgetConversation(conversation.id);
      invalidate();
      return true;
    },
    [conversation, invalidate, forgetConversation],
  );

  return {
    updateGroupInfo,
    addMembers,
    removeMember,
    setMemberRole,
    clearChat,
    removeConversation,
  };
}
