/**
 * useGroupMemberSelection — member selection state for the create-group
 * flow (selectedIds + selectedUsers map, prefill support, MAX_MEMBERS
 * cap toast). Extracted verbatim from CreateGroupChatScreen.
 */

import { useCallback, useState } from 'react';
import { useHaptic } from '../useHaptic';
import { useToast } from '../../context/ToastContext';
import { MAX_MEMBERS } from '../../utils/chatGroupHelpers';
import type { SelectableUser } from '../../utils/chatGroupHelpers';

export interface GroupMemberSelectionResult {
  selectedIds: string[];
  selectedUsers: Map<string, SelectableUser>;
  toggleMember: (user: SelectableUser) => void;
  resetSelection: () => void;
}

export function useGroupMemberSelection({
  prefillMemberIds,
  currentUserId,
  clearCreateError,
}: {
  prefillMemberIds?: string[];
  currentUserId?: string;
  clearCreateError: () => void;
}): GroupMemberSelectionResult {
  const haptic = useHaptic();
  const { show } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>(
    prefillMemberIds ? prefillMemberIds.filter((id) => id !== currentUserId) : []
  );
  const [selectedUsers, setSelectedUsers] = useState<Map<string, SelectableUser>>(new Map());

  const toggleMember = (user: SelectableUser) => {
    haptic.light();
    clearCreateError();
    setSelectedIds((current) => {
      if (current.includes(user.id)) {
        setSelectedUsers((prev) => {
          const next = new Map(prev);
          next.delete(user.id);
          return next;
        });
        return current.filter((id) => id !== user.id);
      }
      if (current.length >= MAX_MEMBERS) {
        show(`Groups are limited to ${MAX_MEMBERS} members`, 'error');
        return current;
      }
      setSelectedUsers((prev) => {
        const next = new Map(prev);
        next.set(user.id, user);
        return next;
      });
      return [...current, user.id];
    });
  };

  const resetSelection = useCallback(() => {
    setSelectedIds([]);
    setSelectedUsers(new Map());
  }, []);

  return { selectedIds, selectedUsers, toggleMember, resetSelection };
}
