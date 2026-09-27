'use client';

/**
 * ForwardSheet — the recipient picker behind the message Forward action,
 * a compact port of the mobile forward-to flow. Lists the viewer's real
 * conversations (the current thread is filtered out by the caller — a
 * forward back into the same thread is a duplicate, not a forward),
 * searchable by name; a pick fires onSelect with the target id and the
 * caller owns the write. Archived threads stay eligible — forwarding
 * into one unarchives it on the sender's side on the next poll.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useSession } from '@/lib/session/SessionProvider';
import { GroupAvatarMosaic } from './GroupAvatarMosaic';
import { conversationTitle, isGroupConversation, mosaicMembers } from './inboxModel';

interface ForwardSheetProps {
  open: boolean;
  onClose: () => void;
  /** Forwardable targets — real conversations, current thread excluded. */
  targets: Conversation[];
  /** Recipient picked — the caller performs the send write. */
  onSelect: (conversationId: string) => void;
}

export function ForwardSheet({ open, onClose, targets, onSelect }: ForwardSheetProps) {
  const { user } = useSession();
  const viewerId = user?.id ?? '';
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Fresh search per open.
  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((c) => conversationTitle(c).toLowerCase().includes(q));
  }, [targets, query]);

  return (
    <Sheet open={open} onClose={onClose} title="Forward to" maxWidth={440}>
      <div className="px-5 pb-6">
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
          <Icon name="search" size={16} className="shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="min-w-0 flex-1 bg-transparent text-body text-input-text placeholder:text-text-muted focus:outline-none"
          />
        </div>
        <div role="listbox" aria-label="Conversations" className="mt-3 max-h-[50vh] overflow-y-auto">
          {matches.map((c) => {
            const title = conversationTitle(c);
            const isGroup = isGroupConversation(c);
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => onSelect(c.id)}
                className="pressable flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-row-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {isGroup ? (
                  <GroupAvatarMosaic
                    members={mosaicMembers(c, viewerId)}
                    size={40}
                    groupPhoto={c.avatar}
                    fallbackName={title}
                    groupId={c.id}
                  />
                ) : (
                  <Avatar src={c.participantAvatar} name={title} size={40} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="clamp-1 block text-body font-medium text-text-primary">
                    {title}
                  </span>
                  {isGroup ? (
                    <span className="block text-meta text-text-muted">Group</span>
                  ) : null}
                </span>
              </button>
            );
          })}
          {matches.length === 0 ? (
            <p className="py-8 text-center text-body text-text-muted">
              {targets.length === 0
                ? 'No other conversations to forward to.'
                : `No conversations match “${query.trim()}”.`}
            </p>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
