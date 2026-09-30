import type { Message } from '@/lib/contracts/domain';
import { MessageActionsMenu } from '../MessageBubble';
import {
  QUICK_REACTIONS,
  forwardableMessage,
} from '@/lib/hooks/chat-queries';
import type { ConfirmSheetState } from '../ConfirmSheet';

interface ChatActionMenuWrapperProps {
  msgMenu: { id: string; x: number; y: number } | null;
  menuMessage: Message | undefined;
  failedIds: ReadonlySet<string>;
  canPinMessage: boolean;
  pinMessageId: string | undefined;
  threadActions: {
    hasReacted: (m: Message, emoji: string) => boolean;
    toggleReaction: (m: Message, emoji: string) => void;
    isSavedByMe: (m: Message) => boolean;
    isSaved: (m: Message) => boolean;
    toggleSave: (m: Message) => void;
    deleteMessage: (id: string, mode: 'me' | 'everyone') => void;
  };
  replyable: (m: Message) => boolean;
  actionable: (m: Message) => boolean;
  editable: (m: Message) => boolean;
  isMine: (m: Message) => boolean;
  isSystem: (m: Message) => boolean;
  onRetryPending: (m: Message) => void;
  onDiscardPending: (m: Message) => void;
  onReply: (m: Message) => void;
  onForward: (m: Message) => void;
  onTogglePin: (m: Message) => void;
  onReport: (m: Message) => void;
  onCopyText: (text: string) => void;
  onStartEdit: (m: Message) => void;
  onRequestConfirm: (config: ConfirmSheetState) => void;
  onClose: () => void;
}

export function ChatActionMenuWrapper({
  msgMenu,
  menuMessage,
  failedIds,
  canPinMessage,
  pinMessageId,
  threadActions,
  replyable,
  actionable,
  editable,
  isMine,
  isSystem,
  onRetryPending,
  onDiscardPending,
  onReply,
  onForward,
  onTogglePin,
  onReport,
  onCopyText,
  onStartEdit,
  onRequestConfirm,
  onClose,
}: ChatActionMenuWrapperProps) {
  if (!msgMenu || !menuMessage) return null;

  const menuFailed = failedIds.has(menuMessage.id);

  return (
    <MessageActionsMenu
      anchor={{ x: msgMenu.x, y: msgMenu.y }}
      reactions={
        menuFailed
          ? undefined
          : QUICK_REACTIONS.map((emoji) => ({
              emoji,
              reactedByMe: threadActions.hasReacted(menuMessage, emoji),
            }))
      }
      onReact={
        menuFailed
          ? undefined
          : (emoji) => threadActions.toggleReaction(menuMessage, emoji)
      }
      onRetry={menuFailed ? () => onRetryPending(menuMessage) : undefined}
      onRemove={menuFailed ? () => onDiscardPending(menuMessage) : undefined}
      onReply={
        menuFailed || !replyable(menuMessage)
          ? undefined
          : () => onReply(menuMessage)
      }
      onForward={
        menuFailed || !forwardableMessage(menuMessage)
          ? undefined
          : () => onForward(menuMessage)
      }
      onPin={
        menuFailed || !canPinMessage || !actionable(menuMessage)
          ? undefined
          : () => onTogglePin(menuMessage)
      }
      pinned={pinMessageId === menuMessage.id}
      hasReacted={(emoji) => threadActions.hasReacted(menuMessage, emoji)}
      saved={threadActions.isSavedByMe(menuMessage)}
      onSave={
        // Tombstones offer only Unsave (the mobile grammar —
        // retracting a save is the sole action a deleted row
        // can take); persisted messages always offer the save
        // toggle.
        actionable(menuMessage) ||
        (menuMessage.isDeleted === true && threadActions.isSaved(menuMessage))
          ? () => threadActions.toggleSave(menuMessage)
          : undefined
      }
      onReport={
        menuFailed || isMine(menuMessage) || isSystem(menuMessage)
          ? undefined
          : () => onReport(menuMessage)
      }
      onCopy={
        menuFailed || !menuMessage.text
          ? undefined
          : () => onCopyText(menuMessage.text as string)
      }
      onEdit={
        !menuFailed && editable(menuMessage)
          ? () => onStartEdit(menuMessage)
          : undefined
      }
      onDeleteForMe={
        menuFailed
          ? undefined
          : () =>
              onRequestConfirm({
                open: true,
                title: 'Delete for me?',
                message:
                  'The message is removed from your view — everyone else in the conversation still sees it.',
                confirmLabel: 'Delete for me',
                variant: 'danger',
                onConfirm: () =>
                  threadActions.deleteMessage(menuMessage.id, 'me'),
              })
      }
      onDeleteForEveryone={
        !menuFailed && isMine(menuMessage)
          ? () =>
              onRequestConfirm({
                open: true,
                title: 'Delete for everyone?',
                message:
                  'The message is removed for all participants and can’t be undone.',
                confirmLabel: 'Delete for everyone',
                variant: 'danger',
                onConfirm: () =>
                  threadActions.deleteMessage(menuMessage.id, 'everyone'),
              })
          : undefined
      }
      onClose={onClose}
    />
  );
}
