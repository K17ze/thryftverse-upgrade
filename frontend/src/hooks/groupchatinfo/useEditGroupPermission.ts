/**
 * useEditGroupPermission — the edit-permission gate for the edit-group
 * screen. Managers short-circuit to 'allowed'; non-managers stay in
 * 'loading' until the server-reported settings capabilities resolve, so
 * the restricted state is never flashed at a member who can actually edit.
 * Extracted verbatim from EditGroupScreen.
 */

import { useEffect, useState } from 'react';
import { fetchGroupSettingsFromApi } from '../../services/chatApi';
import type { Conversation } from '../../domain/conversation';

export type EditGroupPermission = 'loading' | 'allowed' | 'restricted';

export function useEditGroupPermission(
  conversation: Conversation | undefined,
  conversationId: string,
  currentUserId: string | undefined
) {
  const role = currentUserId ? conversation?.memberRoles?.[currentUserId] : undefined;
  const isGroupManager = Boolean(
    currentUserId &&
      (conversation?.ownerId === currentUserId || role === 'owner' || role === 'admin')
  );
  const [editPermission, setEditPermission] = useState<EditGroupPermission>(
    isGroupManager ? 'allowed' : 'loading'
  );

  useEffect(() => {
    let active = true;
    if (isGroupManager) {
      setEditPermission('allowed');
      return () => {
        active = false;
      };
    }
    setEditPermission('loading');
    fetchGroupSettingsFromApi(conversationId)
      .then((snapshot) => {
        if (active) setEditPermission(snapshot.capabilities.canEditGroupInfo ? 'allowed' : 'restricted');
      })
      .catch(() => {
        if (active) setEditPermission('restricted');
      });
    return () => {
      active = false;
    };
  }, [conversationId, isGroupManager]);

  return { editPermission, canEditGroup: editPermission === 'allowed' };
}
