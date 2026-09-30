'use client';

/**
 * PinnedMessageBar — banner at top of chat showing pinned group message.
 * Supports click-to-scroll and group manager unpin action.
 */

import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';

interface PinnedViewData {
  messageId: string;
  senderLabel: string;
  text: string;
}

interface PinnedMessageBarProps {
  pinnedView?: PinnedViewData | null;
  canPin: boolean;
  onScrollToMessage: (id: string) => void;
  onUnpin: () => void;
}

export function PinnedMessageBar({
  pinnedView,
  canPin,
  onScrollToMessage,
  onUnpin,
}: PinnedMessageBarProps) {
  if (!pinnedView) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-alt px-4 py-2">
      <Icon
        name="pin"
        size={14}
        className="shrink-0 text-text-muted"
        aria-hidden
      />
      <button
        type="button"
        onClick={() => onScrollToMessage(pinnedView.messageId)}
        className="pressable min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-meta text-text-secondary">
          <span className="font-semibold text-text-primary">
            {pinnedView.senderLabel}
          </span>{' '}
          {pinnedView.text}
        </span>
      </button>
      {canPin ? (
        <IconButton
          name="close"
          size={14}
          aria-label="Unpin message"
          className="-my-1.5 shrink-0"
          onClick={onUnpin}
        />
      ) : null}
    </div>
  );
}
