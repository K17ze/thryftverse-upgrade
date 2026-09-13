import { useCallback, useState } from 'react';
import { useStore } from '../../store/useStore';
import { deleteConversationOnApi } from '../../services/chatApi';
import { useHaptic } from '../useHaptic';
import { useNotifications } from '../useNotifications';

export interface InboxConfirmSheetState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  variant?: 'default' | 'danger';
}

export interface InboxActionSheetState {
  visible: boolean;
  conversationId: string;
  isMuted: boolean;
  isPinned: boolean;
}

/**
 * Owns the inbox row/ conversation action handlers (delete, mute, archive,
 * pin, read toggle, request accept/decline) plus the state driving the
 * confirmation and quick-action sheets those handlers open.
 */
export function useInboxActions() {
  const { showSuccess, showInfo, showError } = useNotifications();
  const haptic = useHaptic();
  const conversations = useStore((state) => state.conversations);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const toggleConversationPinned = useStore((state) => state.toggleConversationPinned);
  const toggleConversationUnread = useStore((state) => state.toggleConversationUnread);
  const toggleMutedConversation = useStore((state) => state.toggleMutedConversation);
  const toggleArchivedConversation = useStore((state) => state.toggleArchivedConversation);
  const archivedIds = useStore((state) => state.archivedConversationIds);
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const acceptMessageRequest = useStore((state) => state.acceptMessageRequest);
  const declineMessageRequest = useStore((state) => state.declineMessageRequest);

  const [confirmSheet, setConfirmSheet] = useState<InboxConfirmSheetState>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [actionSheet, setActionSheet] = useState<InboxActionSheetState>({
    visible: false,
    conversationId: '',
    isMuted: false,
    isPinned: false,
  });

  const handleDelete = useCallback((id: string) => {
    haptic.medium();
    setConfirmSheet({
      visible: true,
      title: 'Remove from inbox?',
      message: 'This conversation will be hidden from your inbox. The other participant keeps their copy.',
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        const previous = conversations.find((c) => c.id === id);
        deleteConversation(id);
        showError('Conversation removed', 'This conversation was removed from your inbox.');
        try {
          await deleteConversationOnApi(id, 'me');
        } catch {
          showError('Delete failed', 'Failed to delete on server. Restoring conversation.');
          if (previous) {
            upsertConversation(previous);
          }
        }
      },
    });
  }, [conversations, deleteConversation, upsertConversation, showError, haptic]);

  const handleMute = useCallback((id: string) => {
    haptic.light();
    const nowMuted = !mutedIds.includes(id);
    toggleMutedConversation(id)
      .then(() => {
        showInfo(nowMuted ? 'Conversation muted' : 'Conversation unmuted');
      })
      .catch(() => {
        showError('Action failed', 'Could not update mute status. Check your connection and try again.');
      });
  }, [toggleMutedConversation, mutedIds, showInfo, showError, haptic]);

  const handleArchive = useCallback((id: string) => {
    haptic.light();
    const nowArchived = !archivedIds.includes(id);
    toggleArchivedConversation(id)
      .then(() => {
        showInfo(nowArchived ? 'Conversation archived' : 'Conversation unarchived');
      })
      .catch(() => {
        showError('Action failed', 'Could not update archive status. Check your connection and try again.');
      });
  }, [toggleArchivedConversation, archivedIds, showInfo, showError, haptic]);

  const handleAcceptRequest = useCallback((id: string) => {
    haptic.medium();
    acceptMessageRequest(id)
      .then(() => {
        showSuccess('Request accepted', 'Message request accepted.');
      })
      .catch(() => {
        showError('Action failed', 'Could not accept this request. Check your connection and try again.');
      });
  }, [acceptMessageRequest, showSuccess, showError, haptic]);

  const handleDeclineRequest = useCallback((id: string) => {
    haptic.medium();
    declineMessageRequest(id)
      .then(() => {
        showInfo('Request declined', 'Message request declined.');
      })
      .catch(() => {
        showError('Action failed', 'Could not decline this request. Check your connection and try again.');
      });
  }, [declineMessageRequest, showInfo, showError, haptic]);

  const handlePin = useCallback((id: string) => {
    haptic.medium();
    const nowPinned = !conversations.find((c) => c.id === id)?.isPinned;
    toggleConversationPinned(id)
      .then(() => {
        showSuccess(nowPinned ? 'Pinned' : 'Unpinned', nowPinned ? 'Conversation pinned.' : 'Conversation unpinned.');
      })
      .catch(() => {
        showError('Action failed', 'Could not update pin status. Check your connection and try again.');
      });
  }, [conversations, toggleConversationPinned, showSuccess, showError, haptic]);

  const handleToggleRead = useCallback((id: string) => {
    const convo = conversations.find((c) => c.id === id);
    const willMarkUnread = convo ? !convo.unread : false;
    haptic.light();
    toggleConversationUnread(id)
      .then(() => {
        showInfo(willMarkUnread ? 'Marked unread' : 'Marked read', willMarkUnread ? 'Conversation marked as unread' : 'Conversation marked as read');
      })
      .catch(() => {
        showError('Action failed', 'Could not update read status. Check your connection and try again.');
      });
  }, [conversations, toggleConversationUnread, showInfo, showError, haptic]);

  // Long-press quick actions: an ActionSheet exposing mute, pin, and
  // delete. Preserves the capabilities previously surfaced via the old
  // multi-button swipe panels (AGENTS.md §8: preserve working functionality).
  const handleQuickActions = useCallback((id: string) => {
    const convo = conversations.find((c) => c.id === id);
    const isMuted = mutedIds.includes(id);
    const isPinned = !!convo?.isPinned;
    haptic.medium();
    setActionSheet({ visible: true, conversationId: id, isMuted, isPinned });
  }, [conversations, mutedIds, haptic]);

  const dismissConfirmSheet = useCallback(() => {
    setConfirmSheet((s) => ({ ...s, visible: false }));
  }, []);
  const dismissActionSheet = useCallback(() => {
    setActionSheet((s) => ({ ...s, visible: false }));
  }, []);

  return {
    confirmSheet,
    actionSheet,
    dismissConfirmSheet,
    dismissActionSheet,
    handleDelete,
    handleMute,
    handleArchive,
    handleAcceptRequest,
    handleDeclineRequest,
    handlePin,
    handleToggleRead,
    handleQuickActions,
  };
}
