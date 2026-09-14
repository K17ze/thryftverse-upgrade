export type MessageAction = 'copy' | 'reply' | 'react' | 'forward' | 'save' | 'askAgent' | 'edit' | 'delete' | 'retry' | 'report';

import type { Ionicons } from '@expo/vector-icons';

export interface ActionDef {
  id: MessageAction;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color?: string;
  destructive?: boolean;
}

export interface MessageContextCapabilities {
  isOwnMessage: boolean;
  isFailed: boolean;
  messageText?: string;
  /** P2-03: Whether the message is still within the edit window. */
  canEdit?: boolean;
  /** Save in chat — the caller gates this so in-flight, failed, deleted,
   *  and system messages never offer the action. */
  canSave?: boolean;
  /** Whether the message is currently saved in chat (shared state —
   *  drives the "Save in chat" / "Unsave" label). */
  isSaved?: boolean;
  /** Deleted-for-everyone tombstone — no content actions apply; the only
   *  meaningful gesture is retracting a prior save (unsave). */
  isDeletedMessage?: boolean;
}

export function deriveMessageActions(caps: MessageContextCapabilities): ActionDef[] {
  const list: ActionDef[] = [];

  // Deleted-for-everyone tombstone — reply/react/forward/copy/etc. have no
  // payload to act on. The backend still permits unsave on tombstones, so
  // the only action offered is retracting a prior save.
  if (caps.isDeletedMessage) {
    if (caps.canSave && caps.isSaved) {
      list.push({ id: 'save', label: 'Unsave', icon: 'bookmark' });
    }
    return list;
  }

  if (caps.isOwnMessage && caps.isFailed) {
    list.push({ id: 'retry', label: 'Retry', icon: 'refresh-outline' });
  }

  list.push({ id: 'reply', label: 'Reply', icon: 'arrow-undo-outline' });
  list.push({ id: 'react', label: 'React', icon: 'happy-outline' });
  list.push({ id: 'forward', label: 'Forward', icon: 'arrow-forward-outline' });

  // Save in chat — Snapchat-style negotiated persistence. Either party
  // may save; the marker is shared state both sides see. Label flips to
  // "Unsave" once the current state is saved.
  if (caps.canSave) {
    list.push({
      id: 'save',
      label: caps.isSaved ? 'Unsave' : 'Save in chat',
      icon: caps.isSaved ? 'bookmark' : 'bookmark-outline',
    });
  }

  // P2-03: Edit — only for the sender's own text messages within the edit
  // window. Placed before copy so the primary authoring action leads.
  if (caps.isOwnMessage && caps.canEdit && caps.messageText && caps.messageText.trim().length > 0) {
    list.push({ id: 'edit', label: 'Edit', icon: 'create-outline' });
  }

  if (caps.messageText && caps.messageText.trim().length > 0) {
    list.push({ id: 'copy', label: 'Copy text', icon: 'copy-outline' });
    // Ask agent about this message — spec 16 agent invocation path
    list.push({
      id: 'askAgent',
      label: 'Ask agent about this',
      icon: 'bulb-outline',
    });
  }

  if (!caps.isOwnMessage) {
    list.push({ id: 'report', label: 'Report', icon: 'flag-outline', color: 'danger' });
  }

  if (caps.isOwnMessage) {
    list.push({
      id: 'delete',
      label: 'Delete message',
      icon: 'trash-outline',
      color: 'danger',
      destructive: true,
    });
  }

  return list;
}

export function hasAction(actions: ActionDef[], actionId: MessageAction): boolean {
  return actions.some((a) => a.id === actionId);
}
