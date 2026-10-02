'use client';

import { memo } from 'react';
import Link from 'next/link';
import type { Conversation } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import {
  conversationTitle,
  formatInboxTimestamp,
  lastMessagePreview,
} from '../inboxModel';

/**
 * Request row — brand accent edge, listing context, inline actions.
 * Memoized on conversation identity: the accept/decline/block closures
 * capture only the conversation prop and stable store/query deps, so
 * an unrelated inbox merge leaves every other request untouched.
 */
function RequestRowImpl({
  conversation: c,
  onAccept,
  onDecline,
  onBlock,
}: {
  conversation: Conversation;
  onAccept: () => void;
  onDecline: () => void;
  onBlock: () => void;
}) {
  return (
    <div
      className="px-3 py-1.5"
      // Group marker — focusAdjacentGroupControl walks to it from the
      // action buttons to park focus on a sibling row before an
      // accept/decline write unmounts this one.
      data-request-row
      // Same content-visibility windowing as ConversationRowItem — the
      // taller action dock gets its own best-known height hint.
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 148px' }}
    >
      <div className="relative rounded-lg border-l-2 border-brand bg-brand-subtle">
        <Link
          href={`/inbox/${c.id}`}
          data-conversation-row
          aria-label={`Open message request from ${c.participantName}`}
          className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
        <div className="flex gap-3 p-3">
          <Avatar src={c.participantAvatar} name={c.participantName} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                {conversationTitle(c)}
              </span>
              <span className="tnum shrink-0 text-meta text-text-muted">
                {formatInboxTimestamp(c.lastMessageTime)}
              </span>
            </div>
            <p className="clamp-1 mt-0.5 text-body text-text-secondary">{lastMessagePreview(c)}</p>
            {c.listing ? (
              <p className="clamp-1 mt-0.5 text-meta font-semibold text-text-secondary">
                {c.listing.title}
              </p>
            ) : null}
            <div className="relative z-elevated mt-2.5 flex items-center gap-2">
              <Button variant="outline" size="sm" fullWidth onClick={onDecline}>
                Decline
              </Button>
              <Button variant="primary" size="sm" fullWidth onClick={onAccept}>
                Accept
              </Button>
              <button
                type="button"
                onClick={onBlock}
                aria-label={`Block ${conversationTitle(c)}`}
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-danger-text"
              >
                <Icon name="ban" size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const RequestRow = memo(
  RequestRowImpl,
  (a, b) => a.conversation === b.conversation,
);
