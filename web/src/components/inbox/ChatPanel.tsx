'use client';

/**
 * ChatPanel — the conversation thread surface (right pane on desktop,
 * full screen on mobile). Port of ChatScreen/GroupChatScreen: presence
 * header for DMs — mosaic, member count and the dismissible description
 * bar for groups — listing context card, in-thread message search with
 * match highlighting, date-separated message stream with offer cards,
 * image bubbles, receipts and a quiet copy action, optimistic composer
 * with staged photo attach. Fixture mode mutates locally — outgoing
 * messages are appended optimistically and reconciled once the store
 * write lands; offer resolutions are local overrides.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Message } from '@/lib/contracts/domain';
import {
  useConversation,
  useSendChatMessage,
  useUser,
  type SendChatMessageInput,
} from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useToast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatPrice } from '@/lib/utils/format';
import { Composer } from './Composer';
import { GroupAvatarMosaic } from './GroupAvatarMosaic';
import { MessageBubble } from './MessageBubble';
import { OfferCard } from './OfferCard';
import { useInboxSafety } from './inboxSafety';
import { useGroupCapabilities } from './useConversationAdmin';
import {
  conversationTitle,
  isGroupConversation,
  memberCount,
  mosaicMembers,
  senderLabelFor,
} from './inboxModel';

type OfferStatus = NonNullable<Message['offerStatus']>;

// ── Date separators ─────────────────────────────────────────────────────

/**
 * Date-divider label — the mobile formatDateSeparator grammar: 'Today',
 * 'Yesterday', weekday name inside the last week, then 'Wed, 24 Sep'.
 */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return d.toLocaleDateString('en-GB', { weekday: 'short' });
  }
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

interface MessageGroup {
  key: string;
  label: string;
  messages: Message[];
}

function groupByDay(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const m of messages) {
    const key = Number.isNaN(new Date(m.timestamp).getTime())
      ? ''
      : new Date(m.timestamp).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.messages.push(m);
    } else {
      groups.push({ key, label: key ? dayLabel(m.timestamp) : '', messages: [m] });
    }
  }
  return groups;
}

// Live offers render as cards; an 'offer_declined' record is commerce prose
// and falls through to the text bubble, same as the row preview.
function isOffer(m: Message): boolean {
  return m.type === 'offer' || (m.offerPrice != null && m.type !== 'offer_declined');
}

function isMine(m: Message): boolean {
  return m.sender === 'me' || m.senderId === 'me';
}

function isSystem(m: Message): boolean {
  return m.isSystem === true || m.type === 'system' || m.sender === 'system';
}

// ── Component ────────────────────────────────────────────────────────────

export function ChatPanel({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const toast = useToast();
  const hydrated = useHydrated();
  const { user } = useSession();
  const { data: conversation, isLoading } = useConversation(conversationId);
  const isGroup = conversation ? isGroupConversation(conversation) : false;
  const { data: participant } = useUser(conversation?.participantId ?? '');
  const sendMessage = useSendChatMessage(conversationId);
  const { capabilities } = useGroupCapabilities(conversation, user?.id ?? 'me');
  const blockedUserIds = useInboxSafety((s) => s.blockedUserIds);
  const toggleBlocked = useInboxSafety((s) => s.toggleBlocked);

  const [pending, setPending] = useState<Message[]>([]);
  const [offerStatus, setOfferStatus] = useState<Record<string, OfferStatus>>({});
  const [descDismissed, setDescDismissed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const didMountScroll = useRef(false);

  // Reset thread-local state when switching conversations.
  useEffect(() => {
    setPending([]);
    setOfferStatus({});
    setDescDismissed(false);
    setSearchOpen(false);
    setQuery('');
    didMountScroll.current = false;
  }, [conversationId]);

  // Focus the search field when the in-thread search opens.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Reconcile optimistic sends: once the fixture write (id `local-*`)
  // refetches into the query result, drop the matching pending bubble.
  // Media pairs match on text + mediaUri so a captioned photo can't be
  // swallowed by an unrelated text send.
  useEffect(() => {
    if (!conversation) return;
    setPending((p) =>
      p.filter(
        (pm) =>
          !conversation.messages.some(
            (dm) =>
              dm.id.startsWith('local-') &&
              dm.sender === 'me' &&
              dm.text === pm.text &&
              (dm.mediaUri ?? '') === (pm.mediaUri ?? ''),
          ),
      ),
    );
  }, [conversation]);

  const messages = useMemo(
    () => [...(conversation?.messages ?? []), ...pending],
    [conversation, pending],
  );

  // In-thread search — client-side filter over message text (WhatsApp's
  // conversation search). System rows search on their title; media-only
  // messages carry no text and honestly never match.
  const searchQuery = query.trim();
  const matches = useMemo(() => {
    if (!searchQuery) return messages;
    const needle = searchQuery.toLowerCase();
    return messages.filter((m) => (m.text ?? m.systemTitle ?? '').toLowerCase().includes(needle));
  }, [messages, searchQuery]);

  // Auto-scroll — instant on first paint, smooth on new messages. Skipped
  // while searching so opening the filter doesn't yank the viewport.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0 || searchOpen) return;
    el.scrollTo({ top: el.scrollHeight, behavior: didMountScroll.current ? 'smooth' : 'auto' });
    didMountScroll.current = true;
  }, [messages.length, searchOpen]);

  const send = (input: SendChatMessageInput) => {
    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      senderId: 'me',
      sender: 'me',
      text: input.text,
      mediaUri: input.mediaUri,
      mediaType: input.mediaType,
      type: input.mediaUri ? 'media' : 'text',
      timestamp: new Date().toISOString(),
      readStatus: 'sending',
    };
    setPending((p) => [...p, optimistic]);
    sendMessage.mutate(input, {
      onError: () => {
        setPending((p) => p.filter((m) => m.id !== optimistic.id));
        toast.show("Message couldn't be sent", 'error');
      },
    });
  };

  const resolveOffer = (m: Message, status: OfferStatus) => {
    setOfferStatus((s) => ({ ...s, [m.id]: status }));
    if (status === 'accepted') {
      toast.show(`Offer accepted — ${formatPrice(m.offerPrice)} agreed`, 'success');
    } else if (status === 'declined') {
      toast.show('Offer declined', 'info');
    }
  };

  if (isLoading) return <ChatSkeleton />;

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon="chat"
          title="Conversation not found"
          subtitle="It may have been archived or deleted."
          actionLabel="Back to inbox"
          onAction={() => router.push('/inbox')}
        />
      </div>
    );
  }

  const title = conversationTitle(conversation);
  const members = memberCount(conversation);
  // DM subtitle is a real presence signal; groups show the member count
  // (mobile ChatTopBar grammar — no presence on a group avatar).
  const subtitle = isGroup
    ? `${members} ${members === 1 ? 'member' : 'members'}`
    : conversation.isOnline
      ? 'Active now'
      : participant?.lastSeen
        ? /^(now|just now)$/i.test(participant.lastSeen)
          ? 'Active now'
          : `Last seen ${participant.lastSeen}`
        : null;

  const groups = groupByDay(matches);
  const lastMine = [...messages].reverse().find(isMine);
  const lastMineReadId = lastMine?.readStatus === 'read' ? lastMine.id : undefined;

  // Composer gates — the info surface owns the toggles; the thread owns
  // the honest readout. A blocked counterparty gets an unblock control;
  // an admins-only group gets a read-only notice.
  const counterpartyBlocked =
    !isGroup && hydrated && !!conversation.participantId
      ? blockedUserIds.includes(conversation.participantId)
      : false;
  const groupReadOnly = isGroup && capabilities != null && !capabilities.canSendMessages;

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      {/* Presence / group header */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-2 py-2 md:px-3">
        <IconButton
          name="back"
          aria-label="Back to inbox"
          className="md:hidden"
          onClick={() => router.push('/inbox')}
        />
        {/* Header identity — tapping opens the info surface, matching the
            mobile header → conversation-info navigation. */}
        <Link
          href={`/inbox/${conversationId}/info`}
          aria-label={`${isGroup ? 'Group' : 'Chat'} details — ${title}`}
          className="pressable -my-1 flex min-w-0 flex-1 items-center gap-2 py-1"
        >
          <span className="relative shrink-0">
            {isGroup ? (
              <GroupAvatarMosaic
                members={mosaicMembers(conversation)}
                size={40}
                groupPhoto={conversation.avatar}
                fallbackName={title}
                groupId={conversation.id}
              />
            ) : (
              <>
                <Avatar src={conversation.participantAvatar} name={title} size={40} />
                {conversation.isOnline ? (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success-text ring-2 ring-background"
                    aria-label="Online"
                  />
                ) : null}
              </>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <h1 className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                {title}
              </h1>
              {!isGroup && conversation.participantVerified ? (
                <Icon name="verified" filled size={14} className="shrink-0 text-commerce-trust" />
              ) : null}
            </div>
            {subtitle ? <p className="text-meta text-text-muted">{subtitle}</p> : null}
          </div>
        </Link>
        {!isGroup ? (
          <IconButton
            name="phone"
            aria-label="Start a call"
            onClick={() => toast.show('Calling is coming soon', 'info')}
          />
        ) : null}
        <IconButton
          name="search"
          aria-label={searchOpen ? 'Close search' : 'Search in conversation'}
          aria-pressed={searchOpen}
          onClick={() => {
            if (searchOpen) setQuery('');
            setSearchOpen((o) => !o);
          }}
        />
        <IconButton
          name="more"
          aria-label={isGroup ? 'Group info' : 'Conversation info'}
          onClick={() => router.push(`/inbox/${conversationId}/info`)}
        />
      </header>

      {/* In-thread search — filters the stream client-side with match
          highlighting and a live result count; Escape clears, then closes. */}
      {searchOpen ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-alt px-3 py-1.5 md:px-4">
          <Icon name="search" size={16} className="shrink-0 text-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                if (searchQuery) setQuery('');
                else setSearchOpen(false);
              }
            }}
            placeholder={`Search in ${title}`}
            aria-label={`Search in ${title}`}
            className="h-8 min-w-0 flex-1 bg-transparent text-body text-input-text placeholder:text-text-muted focus:outline-none"
          />
          {searchQuery ? (
            <span className="tnum shrink-0 text-meta text-text-muted" aria-live="polite">
              {matches.length} {matches.length === 1 ? 'result' : 'results'}
            </span>
          ) : null}
          <IconButton
            name="close"
            size={14}
            aria-label="Close search"
            className="h-8 w-8 shrink-0"
            onClick={() => {
              setQuery('');
              setSearchOpen(false);
            }}
          />
        </div>
      ) : null}

      {/* Group description — the dismissible info bar from GroupChatScreen */}
      {isGroup && conversation.description && !descDismissed ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-alt px-4 py-2">
          <Icon name="people" size={16} className="shrink-0 text-text-muted" />
          <p className="clamp-2 min-w-0 flex-1 text-meta text-text-secondary">
            {conversation.description}
          </p>
          <IconButton
            name="close"
            size={14}
            aria-label="Dismiss group description"
            className="h-8 w-8 shrink-0"
            onClick={() => setDescDismissed(true)}
          />
        </div>
      ) : null}

      {/* Listing context card */}
      {conversation.listing ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-3 py-2.5 md:px-4">
          {conversation.listing.image ? (
            <AppImage
              src={conversation.listing.image}
              alt={conversation.listing.title}
              sizes="44px"
              className="h-11 w-11 shrink-0 rounded-md"
              fallbackIcon="bag"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="clamp-1 text-body font-medium text-text-primary">
              {conversation.listing.title}
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-body font-semibold text-text-primary">
              <span className="tnum">{formatPrice(conversation.listing.price)}</span>
              {conversation.listing.isSold ? <Badge variant="neutral">Sold</Badge> : null}
            </p>
          </div>
          <Link
            href={`/item/${conversation.listing.id}`}
            className="pressable inline-flex shrink-0 items-center gap-1 text-body-emphasis font-semibold text-text-primary"
          >
            View
            <Icon name="forward" size={14} />
          </Link>
        </div>
      ) : null}

      {/* Message stream */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-4">
        {searchQuery && matches.length === 0 ? (
          <p className="py-10 text-center text-body text-text-muted">
            No results for “{searchQuery}”
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.key || 'undated'}>
              {g.label ? (
                <p className="my-4 text-center text-meta text-text-muted">{g.label}</p>
              ) : null}
              {g.messages.map((m, i) => {
                const mine = isMine(m);
                // Cluster-first incoming group message gets a sender label —
                // the same name resolution the mobile GroupChatScreen uses.
                const prev = g.messages[i - 1];
                const clusterFirst = !prev || isSystem(prev) || prev.senderId !== m.senderId;
                const senderLabel =
                  isGroup && !mine && !isSystem(m) && clusterFirst
                    ? senderLabelFor(conversation, m.senderId)
                    : undefined;
                return isOffer(m) ? (
                  <OfferCard
                    key={m.id}
                    message={m}
                    mine={mine}
                    showSeen={m.id === lastMineReadId}
                    status={offerStatus[m.id] ?? m.offerStatus ?? 'pending'}
                    highlight={searchQuery || undefined}
                    onAccept={() => resolveOffer(m, 'accepted')}
                    onDecline={() => resolveOffer(m, 'declined')}
                    onCounter={() => toast.show('Send your counter-offer in the chat', 'info')}
                  />
                ) : (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    mine={mine}
                    showSeen={m.id === lastMineReadId}
                    senderLabel={senderLabel}
                    highlight={searchQuery || undefined}
                  />
                );
              })}
            </div>
          ))
        )}
        {!searchQuery && messages.length === 0 ? (
          <p className="py-10 text-center text-body text-text-muted">
            Say hello to {title}.
          </p>
        ) : null}
      </div>

      {counterpartyBlocked ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
          <p className="text-meta text-text-muted">
            You blocked {title} — unblock to send messages.
          </p>
          <button
            type="button"
            onClick={() => toggleBlocked(conversation.participantId)}
            className="pressable shrink-0 text-body-emphasis font-semibold text-brand"
          >
            Unblock
          </button>
        </div>
      ) : groupReadOnly ? (
        <p className="shrink-0 border-t border-border-subtle px-4 py-3.5 text-center text-meta text-text-muted">
          Only admins can send messages in this group.
        </p>
      ) : (
        <Composer sending={sendMessage.isPending} onSend={send} />
      )}
    </div>
  );
}

/** Chat skeleton — header row, alternating bubble shapes, composer bar. */
function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy aria-label="Loading conversation">
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="mt-1.5 h-3 w-20" />
        </div>
      </div>
      <div className="flex-1 space-y-2.5 overflow-hidden px-4 py-6">
        <Skeleton className="h-9 w-3/5 rounded-chat" />
        <Skeleton className="ml-auto h-9 w-1/2 rounded-chat" />
        <Skeleton className="h-9 w-2/5 rounded-chat" />
        <Skeleton className="h-16 w-3/4 rounded-xl" />
        <Skeleton className="ml-auto h-9 w-3/5 rounded-chat" />
      </div>
      <div className="border-t border-border-subtle px-4 py-3">
        <Skeleton className="h-10 w-full rounded-chat" />
      </div>
    </div>
  );
}
