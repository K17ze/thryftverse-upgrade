'use client';

/**
 * ConversationListPane — the inbox's left column (and the whole mobile
 * inbox). Header, quiet search, All / Requests segmented tabs, flat rows
 * separated by hairlines. Message requests render with an accent edge and
 * Accept / Decline actions — resolved locally against fixture state.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Conversation } from '@/lib/contracts/domain';
import { useConversations } from '@/lib/hooks/queries';
import { useToast } from '@/components/ui/Toast';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConversationRow } from './ConversationRow';
import { ConversationRowMenu } from './ConversationRowMenu';
import { NewMessageSheet } from './NewMessageSheet';
import { conversationTitle, formatInboxTimestamp, lastMessagePreview } from './inboxModel';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';

type Tab = 'all' | 'requests' | 'archived';

export function ConversationListPane({
  activeId,
  className = '',
}: {
  activeId?: string | null;
  className?: string;
}) {
  const { data, isLoading } = useConversations();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  // Local request resolution — fixtures have no request-response endpoint,
  // so accept/decline is honest local state (accept promotes to All).
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(new Set());
  const [declined, setDeclined] = useState<ReadonlySet<string>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const archivedIds = useInboxPrefs((s) => s.archivedIds);

  const conversations = useMemo(() => data ?? [], [data]);

  const requests = useMemo(
    () =>
      conversations.filter(
        (c) => c.isRequest && !accepted.has(c.id) && !declined.has(c.id),
      ),
    [conversations, accepted, declined],
  );
  const regular = useMemo(
    () =>
      conversations.filter(
        (c) => (!c.isRequest || accepted.has(c.id)) && !archivedIds.includes(c.id),
      ),
    [conversations, accepted, archivedIds],
  );
  const archived = useMemo(
    () => conversations.filter((c) => archivedIds.includes(c.id)),
    [conversations, archivedIds],
  );

  const query = q.trim().toLowerCase();
  const matches = (c: Conversation) =>
    !query ||
    conversationTitle(c).toLowerCase().includes(query) ||
    c.lastMessage.toLowerCase().includes(query) ||
    c.participantProfiles?.some((p) =>
      (p.displayName ?? p.username).toLowerCase().includes(query),
    ) ||
    c.listing?.title.toLowerCase().includes(query);

  const visible = (tab === 'all' ? regular : tab === 'requests' ? requests : archived).filter(matches);

  const acceptRequest = (c: Conversation) => {
    setAccepted((s) => new Set(s).add(c.id));
    toast.show(`Request from ${c.participantName} accepted`, 'success');
  };
  const declineRequest = (c: Conversation) => {
    setDeclined((s) => new Set(s).add(c.id));
    toast.show('Request declined', 'info');
  };

  return (
    <aside
      className={`flex w-full flex-col md:h-full md:w-[340px] md:shrink-0 md:border-r md:border-border-subtle ${className}`}
      aria-label="Conversations"
    >
      <div className="shrink-0 px-4 pb-3 pt-5">
        <div className="flex items-center justify-between">
          <h1 className="text-screen-title font-bold text-text-primary">Messages</h1>
          <IconButton
            name="edit"
            aria-label="New message"
            onClick={() => setComposeOpen(true)}
            className="-mr-2"
          />
        </div>
        <label className="relative mt-3 block">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages"
            aria-label="Search messages"
            className="h-9 w-full rounded-full border border-transparent bg-surface-alt pl-9 pr-3 text-body text-input-text placeholder:text-text-muted focus:border-border focus:outline-none"
          />
        </label>
        <div className="mt-3">
          <SegmentedControl<Tab>
            options={[
              { value: 'all', label: 'All' },
              {
                value: 'requests',
                label: requests.length ? `Requests · ${requests.length}` : 'Requests',
              },
              { value: 'archived', label: 'Archived' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 md:overflow-y-auto">
        {isLoading ? (
          <ConversationListSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState
            compact
            icon="inbox"
            title={
              query
                ? 'No matches'
                : tab === 'requests'
                  ? 'No requests'
                  : tab === 'archived'
                    ? 'Nothing archived'
                    : 'No messages yet'
            }
            subtitle={
              query
                ? 'Try a different name or keyword.'
                : tab === 'requests'
                  ? 'Message requests from people you don\u2019t follow appear here.'
                  : tab === 'archived'
                    ? 'Archived threads live here — use the ··· menu on any conversation.'
                    : 'When you message buyers or sellers, conversations appear here.'
            }
          />
        ) : (
          <div className="divide-y divide-border-subtle pb-2">
            {visible.map((c) =>
              tab === 'requests' ? (
                <RequestRow
                  key={c.id}
                  conversation={c}
                  onAccept={() => acceptRequest(c)}
                  onDecline={() => declineRequest(c)}
                />
              ) : (
                <div key={c.id} className="group relative">
                  <ConversationRow conversation={c} active={c.id === activeId} />
                  <ConversationRowMenu conversation={c} />
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <NewMessageSheet open={composeOpen} onClose={() => setComposeOpen(false)} />
    </aside>
  );
}

/** Request row — brand accent edge, listing context, inline actions. */
function RequestRow({
  conversation: c,
  onAccept,
  onDecline,
}: {
  conversation: Conversation;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="px-3 py-1.5">
      <div className="relative rounded-lg border-l-2 border-brand bg-brand-subtle">
        <Link
          href={`/inbox/${c.id}`}
          aria-label={`Open message request from ${c.participantName}`}
          className="absolute inset-0 rounded-lg"
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
            <div className="relative z-10 mt-2.5 flex gap-2">
              <Button variant="outline" size="sm" fullWidth onClick={onDecline}>
                Decline
              </Button>
              <Button variant="primary" size="sm" fullWidth onClick={onAccept}>
                Accept
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Row shapes match the final list layout — avatar, two lines, thumb. */
function ConversationListSkeleton() {
  return (
    <div className="px-4" aria-busy aria-label="Loading conversations">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="mt-2 h-3 w-4/5" />
          </div>
          {i % 2 === 0 ? <Skeleton className="h-10 w-10 shrink-0 rounded-md" /> : null}
        </div>
      ))}
    </div>
  );
}
