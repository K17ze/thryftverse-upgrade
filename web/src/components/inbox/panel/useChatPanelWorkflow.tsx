import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import {
  useConversation,
  useConversations,
  useMarkConversationRead,
  useSendChatMessage,
  useUser,
  type SendChatMessageInput,
} from '@/lib/hooks/queries';
import { useConversationRealtime } from '@/lib/hooks/chat-realtime';
import {
  fetchConversationPresence,
  marketplaceMeta,
  messageClientMessageId,
  newClientMessageId,
  type ConversationPresence,
  type MessageWithClientId,
} from '@/lib/api/services/chat';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useToast } from '@/components/ui/Toast';
import { ClientTime } from '@/components/ui/ClientTime';
import { timeAgo } from '@/lib/utils/format';
import { CLOSED_CONFIRM, type ConfirmSheetState } from '../ConfirmSheet';
import { detectThreadSafetyWarning } from '../chatSafety';
import {
  MESSAGE_EDIT_WINDOW_MS,
  reportChatMessage,
  useForwardMessage,
  useMessageHistory,
  usePinnedMessage,
  useThreadActions,
  writePinnedMessage,
} from '@/lib/hooks/chat-queries';
import { sharedMediaItemFor, type SharedMediaItem } from '../SharedMediaGrid';
import {
  acceptFixtureRequest,
  isGroupManager,
  liveConversationApi,
  useGroupAdminStore,
} from '../groupAdmin';
import type { OfferWithOrder } from '@/lib/commerce/offerAcceptance';
import { useInboxSafety } from '../inboxSafety';
import { useReadReceiptsEnabled } from '@/lib/store/chatPrefs';
import { useGroupCapabilities } from '../useConversationAdmin';
import {
  useChatOfferActions,
  useChatOffers,
} from '../useChatOffers';
import { useResolvedListings } from '@/lib/hooks/home-modules';
import { useListingIds } from '@/lib/hooks/listing-resolution';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';
import {
  conversationTitle,
  isGroupConversation,
  memberCount,
  senderLabelFor,
} from '../inboxModel';
import {
  groupByDay,
  isMine,
  isSystem,
  isOffer,
} from './ChatStreamUtils';

// ── Typing + presence realtime ────────────────────────────────────────────
// The web has no shared WS client — the SSE twin (/realtime/stream) is the
// transport (same grammar as useCoOwnOrderBookStream: fetch + bearer,
// browser WebSocket can't send the Authorization header). One stream per
// open thread carries the conversation topic pair's full vocabulary —
// useConversationRealtime owns the pump and the message/member/receipt
// event merges; the two surfaces still read:
//
//   chat.typing.update on `chat.conversation:{id}` — per-user typing set,
//   4s auto-clear per typer, self filtered (mirrors mobile useTypingUsers).
//   presence.update on `presence.user:{peerId}` — dyad online transitions;
//   authorized server-side to conversation peers only.
//
// Fixture mode, guests and SSR never connect — the REST snapshot and the
// 15s conversation poll stay the baseline.

const PRESENCE_KEY = (id: string) => ['conversation-presence', id] as const;

/** REST snapshot for the DM peer's presence — the live-mode source for the
 *  header's "Active now" / "Last active X" line. `null` data means the
 *  peer hides their activity status or presence was never recorded —
 *  render nothing rather than a fabricated dot. */
function useConversationPresence(conversationId: string, enabled: boolean) {
  return useQuery<ConversationPresence | null>({
    queryKey: [...PRESENCE_KEY(conversationId)],
    queryFn: ({ signal }) => fetchConversationPresence(conversationId, signal),
    enabled: DATA_MODE === 'live' && enabled && !!conversationId,
    staleTime: 15_000,
    // The SSE presence.update stream covers transitions; the interval only
    // refreshes the "Last active" label's drift.
    refetchInterval: 60_000,
  });
}

/**
 * Near-bottom threshold — inside this distance from the stream tail the
 * viewer is treated as "at the latest", so an appended message keeps
 * them pinned; further up, arrivals raise the jump pill instead of
 * yanking the viewport.
 */
const NEAR_BOTTOM_PX = 80;

export function useChatPanelWorkflow(conversationId: string) {
  const router = useRouter();
  const toast = useToast();
  const hydrated = useHydrated();
  const { user, isGuest } = useSession();
  const viewerId = user?.id ?? '';
  const { data: conversation, isLoading, isError, refetch } =
    useConversation(conversationId);
  const isGroup = conversation ? isGroupConversation(conversation) : false;
  const { data: participant } = useUser(conversation?.participantId ?? '');
  const sendMessage = useSendChatMessage(conversationId);
  const markConversationRead = useMarkConversationRead();
  const { capabilities } = useGroupCapabilities(conversation, viewerId);
  const blockedUserIds = useInboxSafety((s) => s.blockedUserIds);
  const toggleBlocked = useInboxSafety((s) => s.toggleBlocked);
  const receiptsEnabled = useReadReceiptsEnabled();

  // Offer cards run the real lifecycle — the standing record behind each
  // offer message resolves from the shared offer list and actions write
  // through the same path /offers uses.
  const { data: chatOffers } = useChatOffers();
  const {
    respond: respondToOffer,
    sendCounter,
    sendNewOffer,
  } = useChatOfferActions(conversationId);
  const [counterTarget, setCounterTarget] = useState<OfferWithOrder | null>(null);
  const forwardMessage = useForwardMessage();
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);

  // Fresh offer from a shared listing — the buyer-seat "Make offer" CTA on
  // an incoming listing_share opens the same OfferSheet grammar as a
  // counter, resolved to the real Listing first (the sheet needs the
  // catalogue/live record, not the message's price snapshot).
  const [shareOfferId, setShareOfferId] = useState<string | null>(null);
  const shareOfferResolved = useListingIds(
    useMemo(() => (shareOfferId ? [shareOfferId] : []), [shareOfferId]),
  );
  const shareOfferListing = shareOfferId
    ? shareOfferResolved.byId.get(shareOfferId)
    : undefined;

  // The counter-offer context listing resolves through the shared id
  // resolver — hoisted above the early returns (rules of hooks); live
  // ids fetch, fixture ids read the bundled catalogue.
  const { items: counterListingResolved } = useResolvedListings(
    counterTarget ? [counterTarget.listingId] : [],
  );
  const counterListing = counterListingResolved[0];

  // Shared clock — lazily-expired standing offers stop offering actions.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [pending, setPending] = useState<Message[]>([]);
  const [descDismissed, setDescDismissed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  // Long-press / right-click action menu — keyed to a message id at the
  // press point; the touch + desktop analogue of the mobile long-press sheet.
  const [msgMenu, setMsgMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSheetState>(CLOSED_CONFIRM);
  const [safetyDismissed, setSafetyDismissed] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  // Inline media → shared MediaLightbox (mobile ChatMediaPreviewScreen):
  // the tapped message pages the full thread media set.
  const [mediaIndex, setMediaIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Scroll-preservation anchor — captured before an older page lands so
  // the prepend can restore the viewport to the same message.
  const prependAnchor = useRef<{ height: number; top: number } | null>(null);
  // Tail tracking — `nearBottom` mirrors the scroll position; `newBelow`
  // shows the jump pill when messages arrive while the viewer reads up.
  const nearBottom = useRef(true);
  const [newBelow, setNewBelow] = useState(false);
  // Polite announcement log — an incoming message is announced to AT when
  // the composer isn't focused (a typing reader gets the visual append,
  // not an interruption). role="log" region lives below the stream.
  const [arrivalAnnouncement, setArrivalAnnouncement] = useState('');

  // Older-history pagination — pages fetched with `before=oldestCursor`
  // live outside the conversation cache so the 15s poll can't drop them.
  const history = useMessageHistory(conversationId, conversation);
  // Reactions / edit / delete — the message-level write paths.
  const threadActions = useThreadActions(conversationId, history.patchOlder);
  // Forward — the real recipient picker rides on the conversations list.
  const { data: allConversations } = useConversations();

  // Failed outgoing sends stay in the stream until retried or discarded —
  // the mobile send-failure grammar (a ! marker + the menu's Retry row).
  // The original send payload rides in a ref map so retry re-runs the
  // identical write without holding input state in render.
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());
  const pendingInputs = useRef(new Map<string, SendChatMessageInput>());

  const roleOverrides = useGroupAdminStore((s) =>
    conversation ? s.roleOverrides[conversation.id] : undefined,
  );
  // Pin — group admins/owners only; the backend enforces the same gate
  // (ensureGroupManagementAccess), so the menu entry never renders in DMs.
  const canPinMessage =
    !!conversation && isGroup && isGroupManager(conversation, viewerId, roleOverrides);

  // The poll tick doubles as the pin convergence trigger — other admins'
  // pins arrive on the conversation's refetch cadence.
  // The poll tick doubles as the pin convergence trigger — other admins'
  // pins arrive on the conversation's refetch cadence.
  const { pin, refresh: refreshPinned } = usePinnedMessage(
    conversationId,
    isGroup,
    hydrated && !isGuest,
    conversation,
  );

  // Dyad presence + counterparty typing — live mode only. The REST
  // snapshot seeds the header line; the SSE stream keeps it current and
  // feeds the "typing…" affordance. Groups carry no presence surface.
  const peerUserId =
    conversation && !isGroup ? conversation.participantId || null : null;
  const presenceQuery = useConversationPresence(
    conversationId,
    !!conversation && !isGroup && !isGuest,
  );

  // The realtime stream's clientMessageId echo — the server row lands in
  // the conversation cache before/independent of the send response, so the
  // matching optimistic bubble (and its failed-marker/retry payload) drops
  // here rather than waiting on the reconcile effect.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const onServerEcho = useCallback((clientMessageId: string) => {
    for (const pm of pendingRef.current) {
      if (messageClientMessageId(pm) === clientMessageId) {
        pendingInputs.current.delete(pm.id);
        setFailedIds((s) => {
          if (!s.has(pm.id)) return s;
          const n = new Set(s);
          n.delete(pm.id);
          return n;
        });
      }
    }
    setPending((p) =>
      p.filter((pm) => messageClientMessageId(pm) !== clientMessageId),
    );
  }, []);

  const { typingUserIds } = useConversationRealtime({
    conversationId,
    viewerId,
    peerUserId,
    enabled: hydrated && !isGuest && !!conversation,
    onServerEcho,
    onPinChanged: refreshPinned,
    patchOlder: history.patchOlder,
  });
  const peerTyping = typingUserIds.length > 0;

  // Message-request state — the detail payload doesn't carry
  // requestStatus; the conversations list does (and the open row shares
  // its cache). A resolved-but-unconfirmed resolution hides the banner
  // optimistically, same grammar as the Requests tab.
  const requestResolutions = useInboxPrefs((s) => s.requests);
  const setRequestResolution = useInboxPrefs((s) => s.setRequestResolution);
  const [requestBusy, setRequestBusy] = useState(false);
  const qc = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const didMountScroll = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "New messages" divider anchor — snapshot once per thread visit, keyed
  // to a message id so a mark-read refetch can't move or lose it (the
  // mobile useUnreadDividerAnchor pattern).
  const unreadAnchor = useRef<{ cid: string; taken: boolean; id: string | null }>({
    cid: conversationId,
    taken: false,
    id: null,
  });

  // Reset thread-local state when switching conversations.
  useEffect(() => {
    setPending([]);
    setFailedIds(new Set());
    pendingInputs.current.clear();
    setForwardTarget(null);
    setCounterTarget(null);
    setShareOfferId(null);
    setDescDismissed(false);
    setSearchOpen(false);
    setQuery('');
    setReplyTarget(null);
    setMsgMenu(null);
    setEditing(null);
    setConfirm(CLOSED_CONFIRM);
    setSafetyDismissed(null);
    setFlashId(null);
    setMediaIndex(null);
    didMountScroll.current = false;
    prependAnchor.current = null;
    nearBottom.current = true;
    setNewBelow(false);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    unreadAnchor.current = { cid: conversationId, taken: false, id: null };
  }, [conversationId]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // Focus the search field when the in-thread search opens.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Escape — the desktop deselect grammar (Messenger/iMessage): unwinds
  // the innermost staged thing first (search, then a staged reply or
  // edit), then leaves the thread for the list. Overlay surfaces handle
  // their own Escape — the gate skips while a menu, sheet or lightbox is
  // open, and `defaultPrevented` covers the composer's own Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (msgMenu || confirm.open || mediaIndex !== null || forwardTarget || counterTarget)
        return;
      if (searchOpen) {
        setQuery('');
        setSearchOpen(false);
        return;
      }
      if (editing) {
        setEditing(null);
        return;
      }
      if (replyTarget) {
        setReplyTarget(null);
        return;
      }
      router.push('/inbox');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [
    msgMenu,
    confirm.open,
    mediaIndex,
    forwardTarget,
    counterTarget,
    searchOpen,
    editing,
    replyTarget,
    router,
  ]);

  // Opening a thread marks it read — the write clears the fixture/server
  // unread flag and the row/header/tab badges drop on the same write.
  const needsRead = !!conversation && (conversation.unread || (conversation.unreadCount ?? 0) > 0);
  useEffect(() => {
    if (needsRead) markConversationRead(conversationId);
  }, [conversationId, needsRead, markConversationRead]);

  // Reconcile optimistic sends: once the outgoing write lands in the
  // query result (SSE echo or REST refetch — both serializers carry
  // clientMessageId), drop the matching pending bubble. A live-mode send
  // reconciles strictly on its idempotency key — two identical texts sent
  // back-to-back can no longer cross-match; fixture sends (no cmid) keep
  // the text + media + send-order heuristic.
  useEffect(() => {
    if (!conversation) return;
    setPending((p) =>
      p.filter((pm) => {
        const sentAt = new Date(pm.timestamp).getTime();
        const pmCmid = messageClientMessageId(pm);
        const attachmentUri = (m: Message) =>
          m.mediaUri ?? m.documentUri ?? m.voiceUri ?? '';
        const keep = !conversation.messages.some((dm) => {
          if (dm.id.startsWith('opt-') || dm.sender !== 'me') return false;
          if (pmCmid) return messageClientMessageId(dm) === pmCmid;
          return (
            (dm.text ?? '') === (pm.text ?? '') &&
            (dm.type ?? 'text') === (pm.type ?? 'text') &&
            Boolean(attachmentUri(dm)) === Boolean(attachmentUri(pm)) &&
            (Number.isNaN(sentAt) ||
              Number.isNaN(new Date(dm.timestamp).getTime()) ||
              new Date(dm.timestamp).getTime() >= sentAt - 5_000)
          );
        });
        // Reconciled sends — the server copy landed, so the stashed retry
        // payload is dead weight. Idempotent, safe under StrictMode replays.
        if (!keep) {
          pendingInputs.current.delete(pm.id);
          setFailedIds((s) => {
            if (!s.has(pm.id)) return s;
            const n = new Set(s);
            n.delete(pm.id);
            return n;
          });
        }
        return keep;
      }),
    );
  }, [conversation]);

  // The rendered stream — paged history prepends before the polled page 1
  // and optimistic sends tail it. Dedupe by id keeps the first-seen slot
  // (prepend ordering) but a later copy wins the payload — a boundary
  // message sitting in both an older page and page 1 renders the fresher
  // page-1 snapshot, not the stale prepend.
  const messages = useMemo(() => {
    const merged: Message[] = [];
    const indexById = new Map<string, number>();
    for (const m of [...history.older, ...(conversation?.messages ?? []), ...pending]) {
      const at = indexById.get(m.id);
      if (at === undefined) {
        indexById.set(m.id, merged.length);
        merged.push(m);
      } else {
        merged[at] = m;
      }
    }
    return merged;
  }, [history.older, conversation, pending]);

  // Thread media set — the same mapping the shared-media grid uses, so
  // the inline lightbox pages the identical items (deleted messages can
  // never surface through either surface).
  const mediaItems = useMemo<SharedMediaItem[]>(
    () =>
      conversation
        ? messages
            .map((m) => sharedMediaItemFor(conversation, m))
            .filter((x): x is SharedMediaItem => x !== null)
        : [],
    [conversation, messages],
  );

  // Message-keyed callbacks — one stable handler each, the row supplies
  // its own message. Per-row closures would re-render every bubble on
  // every thread render (MessageBubble is memoized on these identities).
  const openMediaFor = useCallback(
    (m: Message) => {
      const at = mediaItems.findIndex((it) => it.id === m.id);
      if (at >= 0) setMediaIndex(at);
    },
    [mediaItems],
  );

  // In-thread safety prompt — the mobile detectChatSafetyWarning gate:
  // the buyer side of a marketplace thread only. The marketplace signal
  // is the thread's listing link — fixture `listing`, live `itemId`/
  // `context.listing`. The seller proof chains airtight first — the
  // catalog listing's sellerId, then a standing offer on the listing
  // (server-bound buyerId/sellerId) — then the payload's ownerId, the
  // mobile classifier's `sellerId ?? ownerId` proxy. An unproven role
  // suppresses the banner rather than show buyer-protection copy to a
  // possible seller; a viewer-authored offer or counterparty-seller
  // listing-share is the fallback proof of the buyer seat.
  const meta = marketplaceMeta(conversation);
  const safetyListingId =
    conversation?.listing?.id ?? meta.itemId ?? meta.listingId;
  // The thread's listing resolves through the shared id resolver — live
  // ids fetch (the safety banner's seller determination needs the real
  // sellerId), fixture ids read the bundled catalogue.
  const { items: threadListingResolved } = useResolvedListings(
    safetyListingId ? [safetyListingId] : [],
  );
  const threadListing = threadListingResolved[0];
  const threadOffer = useMemo(
    () =>
      safetyListingId
        ? chatOffers?.find((o) => o.listingId === safetyListingId)
        : undefined,
    [chatOffers, safetyListingId],
  );
  const metaOwnerId = meta.ownerId;
  // The seller seat — the wire's context.listing.sellerId resolves it
  // without the listing fetch; the resolver chain is the fallback.
  const threadSellerId =
    threadListing?.sellerId ?? threadOffer?.sellerId ?? meta.listingSellerId ?? metaOwnerId;

  // Quick-reply role — native ChatComposer grammar: a marketplace thread
  // seats the viewer as buyer or seller; non-marketplace threads show no
  // strip at all. An unresolved seller defaults to buyer rather than
  // offering seller templates to a possible buyer seat.
  const quickReplyRole: 'buyer' | 'seller' | null =
    !isGroup && safetyListingId
      ? threadSellerId && threadSellerId === viewerId
        ? 'seller'
        : 'buyer'
      : null;

  const safetyWarning = useMemo(() => {
    if (!conversation || isGroup || !safetyListingId) return null;
    const sellerId = threadSellerId;
    const isSelling = sellerId
      ? sellerId === viewerId
      : !messages.some(
            (m) => isMine(m) && (m.type === 'offer' || m.offerPrice != null),
          ) &&
          !messages.some(
            (m) => m.listing?.sellerId === conversation.participantId,
          );
    return detectThreadSafetyWarning(messages, {
      isMarketplace: true,
      isSelling,
    });
  }, [
    conversation,
    isGroup,
    safetyListingId,
    threadSellerId,
    messages,
    viewerId,
  ]);

  // In-thread search — client-side filter over message text (WhatsApp's
  // conversation search). System rows search on their title; media-only
  // messages carry no text and honestly never match; deleted payloads are
  // tombstones — the removed body never surfaces through search.
  const searchQuery = query.trim();
  const matches = useMemo(() => {
    if (!searchQuery) return messages;
    const needle = searchQuery.toLowerCase();
    return messages.filter(
      (m) => !m.isDeleted && (m.text ?? m.systemTitle ?? '').toLowerCase().includes(needle),
    );
  }, [messages, searchQuery]);

  // Reply previews — resolve replyToMessageId against the loaded set. A
  // parent that scrolled out of the fetch window renders no quote rather
  // than a fabricated one; a deleted parent quotes as its tombstone.
  const messageById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const senderNameFor = (m: Message): string =>
    !conversation
      ? 'Member'
      : isMine(m)
        ? 'You'
        : isGroup
          ? senderLabelFor(conversation, m.senderId)
          : conversation.participantName;

  // The one-line reply label — the message's own noun grammar, never a
  // fabricated body (deleted payloads stay tombstoned).
  const previewTextFor = (m: Message): string =>
    m.isDeleted
      ? 'This message was deleted'
      : m.text ??
        (m.mediaType === 'video'
          ? 'Video'
          : m.mediaUri
            ? 'Photo'
            : m.type === 'voice' || m.voiceUri
              ? 'Voice message'
              : m.type === 'document' || m.documentUri
                ? (m.documentName ?? 'Document')
                : m.systemTitle ?? 'Message');

  const replyInfoFor = (m: Message): { senderName: string; text: string } | undefined => {
    if (!m.replyToMessageId) return undefined;
    const parent = messageById.get(m.replyToMessageId);
    if (!parent) return undefined;
    return { senderName: senderNameFor(parent), text: previewTextFor(parent) };
  };

  // Pinned bar view-model — the loaded stream copy wins; the live pin
  // response carries the serialized message for pins outside the loaded
  // window. An unresolvable pin renders nothing rather than a fabricated
  // preview.
  const pinnedView = useMemo(() => {
    if (!pin) return null;
    const m = messageById.get(pin.messageId) ?? pin.message;
    if (!m || m.isDeleted) return null;
    return {
      messageId: pin.messageId,
      senderLabel: senderNameFor(m),
      text: previewTextFor(m),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, messageById]);

  /**
   * Unread divider anchor — resolved on the first populated render while
   * the thread still reports unread, before the open-time mark-read write
   * lands. unreadCount counts back over incoming non-system messages (the
   * server read cursor); a bare `unread` flag anchors at the last incoming
   * message — the conservative point it can prove (mobile's fallback).
   */
  if (unreadAnchor.current.cid !== conversationId) {
    unreadAnchor.current = { cid: conversationId, taken: false, id: null };
  }
  if (!unreadAnchor.current.taken && conversation && conversation.messages.length > 0) {
    unreadAnchor.current.taken = true;
    if (conversation.unread || (conversation.unreadCount ?? 0) > 0) {
      const incoming = conversation.messages.filter(
        (m) => !isMine(m) && !isSystem(m) && !m.isDeleted,
      );
      const count = conversation.unreadCount ?? 0;
      const anchor =
        count > 0
          ? incoming[Math.max(0, incoming.length - count)]
          : incoming[incoming.length - 1];
      unreadAnchor.current.id = anchor?.id ?? null;
    }
  }

  const scrollToMessage = useCallback(
    (id: string) => {
      const el = scrollRef.current?.querySelector(`[data-mid="${CSS.escape(id)}"]`);
      if (!el) {
        // The parent scrolled out of the loaded window — honest no-op, not
        // a fabricated jump.
        toast.show('Original message is outside the loaded history', 'info');
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashId(id);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashId(null), 1400);
    },
    [toast],
  );

  // Reply / react / reaction-toggle — message-keyed, stable identities
  // (the setters and the thread action are stable; see MessageBubble's
  // memo contract).
  const replyMessage = useCallback((m: Message) => setReplyTarget(m), []);
  const reactAt = useCallback((m: Message, anchor: { x: number; y: number }) => {
    setMsgMenu({ id: m.id, x: anchor.x, y: anchor.y });
  }, []);
  const { toggleReaction } = threadActions;
  const toggleReactionFor = useCallback(
    (m: Message, emoji: string) => toggleReaction(m, emoji),
    [toggleReaction],
  );
  const togglePollVoteFor = useCallback(
    (m: Message, optionIndex: number) => threadActions.togglePollVote(m, optionIndex),
    [threadActions],
  );

  const copyMessageText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show('Message copied', 'success');
    } catch {
      toast.show("Couldn't copy — clipboard access was blocked", 'error');
    }
  };

  // Fetch the next older page — captures the scroll anchor first so the
  // prepend restores the viewport instead of jumping to the top.
  const loadOlder = () => {
    if (!history.hasMore || history.loading) return;
    const el = scrollRef.current;
    if (el) prependAnchor.current = { height: el.scrollHeight, top: el.scrollTop };
    history.loadOlder();
  };

  // Auto-scroll — instant on first paint; afterwards an appended message
  // pulls the stream down only when the viewer is already near the
  // bottom or the arrival is their own send. A 15s-poll arrival while
  // they're reading history raises the "New messages" pill instead of
  // dragging the viewport. A prepend (older history landing) restores
  // the captured anchor; a same-window refetch changes nothing.
  const prevWindow = useRef<{ first?: string; last?: string; count: number }>({ count: 0 });
  useEffect(() => {
    const el = scrollRef.current;
    const first = messages[0]?.id;
    const last = messages[messages.length - 1]?.id;
    const prev = prevWindow.current;
    const prepended =
      prev.count > 0 &&
      messages.length > prev.count &&
      prev.last === last &&
      prev.first !== first;
    // Tail moved forward without the list shrinking — an optimistic send
    // reconciling to its server id counts (count can stay flat); a
    // delete-for-me dropping the tail does not.
    const appended =
      didMountScroll.current && prev.last !== last && messages.length >= prev.count;
    if (el && messages.length > 0 && !searchOpen) {
      if (prepended && prependAnchor.current) {
        const a = prependAnchor.current;
        el.scrollTop = a.top + (el.scrollHeight - a.height);
      } else if (!didMountScroll.current) {
        el.scrollTo({ top: el.scrollHeight });
        didMountScroll.current = true;
        nearBottom.current = true;
      } else if (appended) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && (nearBottom.current || isMine(lastMessage))) {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          nearBottom.current = true;
        } else {
          setNewBelow(true);
        }
        // Announce incoming arrivals politely unless the composer holds
        // focus — mid-typing announcements would interrupt the reader.
        if (
          lastMessage &&
          !isMine(lastMessage) &&
          !isSystem(lastMessage) &&
          !lastMessage.isDeleted
        ) {
          const active = document.activeElement;
          const composerFocused =
            active instanceof HTMLElement &&
            active.closest('[data-chat-composer]') !== null;
          if (!composerFocused) {
            setArrivalAnnouncement(
              `${senderNameFor(lastMessage)}: ${previewTextFor(lastMessage)}`,
            );
          }
        }
      }
    }
    if (!prepended) prependAnchor.current = null;
    prevWindow.current = { first, last, count: messages.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, searchOpen]);

  // Scroll-to-top auto-load — the WhatsApp grammar; the "Load older"
  // button below stays the explicit affordance for keyboard users. The
  // same event keeps `nearBottom` honest and clears the jump pill once
  // the viewer scrolls back to the tail themselves.
  const onStreamScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop < 64) loadOlder();
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    nearBottom.current = near;
    if (near) setNewBelow(false);
  };

  // Jump-pill action — smooth-scroll to the tail and drop the affordance.
  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      nearBottom.current = true;
    }
    setNewBelow(false);
  };

  const send = (input: SendChatMessageInput) => {
    // A retry replays the stashed input — its reply linkage rides there
    // (replyTarget cleared when the first attempt fired).
    const replyToMessageId = replyTarget?.id ?? input.replyToMessageId;
    // Idempotency key — the backend dedupes on it and echoes it back on
    // chat.message.created. A retry reuses the stashed key so a send that
    // landed but lost its response can't double-post. Lives outside
    // Message so stripForPersist can't leak it.
    const clientMessageId =
      DATA_MODE === 'live'
        ? (input.clientMessageId ?? newClientMessageId())
        : undefined;
    // Same narrowing the mutation's fixture write applies — document/voice
    // ride their own uri fields + type tag; mediaType is image|video only.
    const isDoc = input.mediaType === 'document';
    const isVoice = input.mediaType === 'voice';
    const optimistic: Message & MessageWithClientId = {
      id: `opt-${Date.now()}`,
      senderId: viewerId,
      sender: 'me',
      text: input.text,
      mediaUri: !isDoc && !isVoice ? input.mediaUri : undefined,
      mediaType:
        input.mediaType === 'image' || input.mediaType === 'video'
          ? input.mediaType
          : undefined,
      documentUri: isDoc ? input.mediaUri : undefined,
      documentName: isDoc ? input.documentName : undefined,
      documentMimeType: isDoc ? input.documentMimeType : undefined,
      voiceUri: isVoice ? input.mediaUri : undefined,
      voiceDurationMs: isVoice ? input.voiceDurationMs : undefined,
      voiceWaveform: isVoice ? input.voiceWaveform : undefined,
      replyToMessageId,
      type: isDoc
        ? 'document'
        : isVoice
          ? 'voice'
          : input.mediaUri
            ? 'media'
            : 'text',
      timestamp: new Date().toISOString(),
      readStatus: 'sending',
      clientMessageId,
    };
    setPending((p) => [...p, optimistic]);
    setReplyTarget(null);
    pendingInputs.current.set(optimistic.id, {
      ...input,
      replyToMessageId,
      clientMessageId,
    });
    sendMessage.mutate(
      { ...input, replyToMessageId, clientMessageId },
      {
        onError: () => {
          // The send failed — keep the optimistic bubble in place marked
          // failed (the mobile send-failure grammar: the message stays
          // put, the menu offers Retry / Remove instead of silently
          // dropping the draft).
          setFailedIds((s) => new Set(s).add(optimistic.id));
          toast.show("Message couldn't be sent", 'error');
        },
      },
    );
  };

  // Retry a failed send — re-runs the identical mutation; the failed row
  // drops now and the fresh optimistic send takes its place at the tail.
  const retryPending = (m: Message) => {
    const input = pendingInputs.current.get(m.id);
    setPending((p) => p.filter((x) => x.id !== m.id));
    setFailedIds((s) => {
      const n = new Set(s);
      n.delete(m.id);
      return n;
    });
    pendingInputs.current.delete(m.id);
    if (input) send(input);
  };

  // Remove a failed pending send — local discard, no server edge exists
  // for a message that never landed.
  const discardPending = (m: Message) => {
    setPending((p) => p.filter((x) => x.id !== m.id));
    setFailedIds((s) => {
      const n = new Set(s);
      n.delete(m.id);
      return n;
    });
    pendingInputs.current.delete(m.id);
  };

  // Pin / unpin — the write is group-admin-gated server-side; the menu
  // entry only exists when canPinMessage held at render time.
  const togglePin = (m: Message) => {
    const isPinned = pin?.messageId === m.id;
    void writePinnedMessage(conversationId, m.id, isPinned).then((ok) => {
      if (ok) {
        refreshPinned();
        toast.show(isPinned ? 'Message unpinned' : 'Message pinned', 'success');
      } else {
        toast.show(
          isPinned
            ? "Couldn't unpin the message — try again"
            : "Couldn't pin the message — try again",
          'error',
        );
      }
    });
  };

  // Message report — the mobile ChatSheets grammar: fixed 'other' reason,
  // the message id as the evidence reference, deterministic idempotency
  // key. Fire-and-acknowledge, no sheet.
  const reportMessage = (m: Message) => {
    void reportChatMessage(conversationId, m.id).then((ok) =>
      toast.show(
        ok
          ? 'Report submitted. Thank you.'
          : "Couldn't submit the report — try again",
        ok ? 'success' : 'error',
      ),
    );
  };

  // Forward — the sheet pick re-sends the message payload into the chosen
  // conversation through the normal send edge (no forward endpoint).
  const forwardPicked = (targetId: string) => {
    const m = forwardTarget;
    setForwardTarget(null);
    if (!m) return;
    forwardMessage(targetId, m)
      .then(() => toast.show('Message forwarded', 'success'))
      .catch(() => toast.show("Couldn't forward the message — try again", 'error'));
  };

  const title = conversation ? conversationTitle(conversation) : '';
  const members = conversation ? memberCount(conversation) : 0;
  const presence = presenceQuery.data ?? null;
  // A live presence update flips the dot on the avatar the same way the
  // subtitle reads it — 'null' means the peer hides activity status and
  // no presence chrome renders (never a fabricated dot).
  const isPeerOnline =
    !isGroup &&
    (DATA_MODE === 'live'
      ? presence?.isOnline === true
      : conversation?.isOnline === true);

  // Presence subtitle (the mobile useChatHeaderData grammar): 'typing…'
  // wins over everything, then the live snapshot — 'Active now' while
  // connected, 'Last active X' from the persisted last-seen. Fixture
  // mode keeps the authored online/lastSeen fields.
  const subtitle: ReactNode = isGroup
    ? `${members} ${members === 1 ? 'member' : 'members'}`
    : peerTyping
      ? 'typing…'
      : DATA_MODE === 'live'
        ? presence?.isOnline
          ? 'Active now'
          : presence?.lastSeenAt
            ? (
                <ClientTime
                  iso={presence.lastSeenAt}
                  format={(iso) => `Last active ${timeAgo(iso)}`}
                />
              )
            : null
        : conversation?.isOnline
          ? 'Active now'
          : participant?.lastSeen
            ? /^(now|just now)$/i.test(participant.lastSeen)
              ? 'Active now'
              : `Last seen ${participant.lastSeen}`
            : null;

  // Unaccepted inbound request — the thread opens read-only until the
  // viewer resolves it (the send edge rejects pending requests
  // server-side: 'Message request has not been accepted').
  const requestResolution = hydrated
    ? requestResolutions[conversationId]
    : undefined;
  const pendingRequest =
    !isGroup &&
    conversation &&
    (conversation.isRequest === true ||
      (allConversations ?? []).find((c) => c.id === conversationId)?.isRequest === true) &&
    !requestResolution;

  // Accept / decline — the identical write grammar the Requests tab runs
  // (ConversationList): optimistic resolution in inboxPrefs, the live
  // edge posts and reverts on failure, fixtures mutate the module
  // dataset. A decline removes the thread from the inbox — leave it.
  const acceptRequest = () => {
    if (requestBusy) return;
    setRequestBusy(true);
    setRequestResolution(conversationId, 'accepted');
    if (DATA_MODE === 'live') {
      liveConversationApi
        .acceptRequest(conversationId)
        .then(() => {
          void qc.invalidateQueries({ queryKey: ['conversations'] });
          void qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
        })
        .catch(() => {
          setRequestResolution(conversationId, null);
          toast.show("Couldn't accept the request — try again", 'error');
        })
        .finally(() => setRequestBusy(false));
      return;
    }
    acceptFixtureRequest(conversationId);
    void qc.invalidateQueries({ queryKey: ['conversations'] });
    setRequestBusy(false);
  };

  const declineRequest = () => {
    if (requestBusy) return;
    setRequestBusy(true);
    setRequestResolution(conversationId, 'declined');
    const leave = () => router.push('/inbox');
    if (DATA_MODE === 'live') {
      liveConversationApi
        .declineRequest(conversationId)
        .then(() => {
          void qc.invalidateQueries({ queryKey: ['conversations'] });
          leave();
        })
        .catch(() => {
          setRequestResolution(conversationId, null);
          toast.show("Couldn't decline the request — try again", 'error');
        })
        .finally(() => setRequestBusy(false));
      return;
    }
    leave();
    setRequestBusy(false);
  };

  const groups = groupByDay(matches);
  const lastMine = [...messages].reverse().find(isMine);
  // Read receipts off (Settings → Messaging): the "Seen" caption never
  // lands on own messages — the tick itself caps at delivered inside
  // MessageReceipt, this gate suppresses the label everywhere
  // (bubbles, offer cards, listing shares all key off lastMineReadId).
  const lastMineReadId =
    receiptsEnabled && lastMine?.readStatus === 'read' ? lastMine.id : undefined;

  // Composer gates — the info surface owns the toggles; the thread owns
  // the honest readout. A blocked counterparty gets an unblock control;
  // an admins-only group gets a read-only notice.
  const counterpartyBlocked =
    !isGroup && hydrated && !!conversation?.participantId
      ? blockedUserIds.includes(conversation.participantId)
      : false;
  const groupReadOnly = isGroup && capabilities != null && !capabilities.canSendMessages;
  const composerOpen = !counterpartyBlocked && !groupReadOnly && !pendingRequest;

  // Reply only targets real messages — a pending optimistic id means
  // nothing to the server, and tombstones/systems carry nothing to quote.
  const replyable = (m: Message) =>
    composerOpen && !isSystem(m) && !m.isDeleted && !m.id.startsWith('opt-');
  // React/delete apply to any persisted message; pending optimistic ids
  // mean nothing to the reactions/messages edges.
  const actionable = (m: Message) =>
    !isSystem(m) && !m.isDeleted && !m.id.startsWith('opt-');

  // Edit is sender-only, text bodies only, inside the backend's 15-minute
  // window — an unparseable timestamp honestly can't prove its age.
  const editable = (m: Message) =>
    isMine(m) &&
    actionable(m) &&
    Boolean(m.text) &&
    !m.mediaUri &&
    !isOffer(m) &&
    m.type !== 'listing_share' &&
    m.type !== 'voice' &&
    m.type !== 'document' &&
    !Number.isNaN(Date.parse(m.timestamp)) &&
    Date.now() - Date.parse(m.timestamp) >= 0 &&
    Date.now() - Date.parse(m.timestamp) < MESSAGE_EDIT_WINDOW_MS;

  // The press-menu's message — resolved at render so a refetch that drops
  // the message closes the menu instead of acting on a ghost.
  const menuMessage = msgMenu ? messages.find((mm) => mm.id === msgMenu.id) : undefined;

  return {
    isGuest,
    isLoading,
    isError,
    refetch,
    conversation,
    title,
    subtitle,
    isGroup,
    viewerId,
    isPeerOnline,
    searchOpen,
    setSearchOpen,
    query,
    setQuery,
    searchInputRef,
    descDismissed,
    setDescDismissed,
    pinnedView,
    canPinMessage,
    scrollToMessage,
    togglePin,
    safetyWarning,
    safetyDismissed,
    setSafetyDismissed,
    scrollRef,
    onStreamScroll,
    history,
    loadOlder,
    searchQuery,
    matches,
    groups,
    unreadAnchorId: unreadAnchor.current.id,
    flashId,
    failedIds,
    lastMineReadId,
    nowMs,
    chatOffers,
    replyable,
    actionable,
    editable,
    replyMessage,
    reactAt,
    setMsgMenu,
    openMediaFor,
    toggleReactionFor,
    togglePollVoteFor,
    respondToOffer,
    setCounterTarget,
    setShareOfferId,
    replyInfoFor,
    messages,
    newBelow,
    jumpToLatest,
    arrivalAnnouncement,
    msgMenu,
    menuMessage,
    threadActions,
    retryPending,
    discardPending,
    setForwardTarget,
    setReplyTarget,
    setEditing,
    setConfirm,
    copyMessageText,
    reportMessage,
    pin,
    peerTyping,
    pendingRequest,
    counterpartyBlocked,
    toggleBlocked,
    groupReadOnly,
    sendMessage,
    send,
    replyTarget,
    editing,
    confirm,
    forwardTarget,
    allConversations,
    forwardPicked,
    mediaItems,
    mediaIndex,
    setMediaIndex,
    counterTarget,
    counterListing,
    sendCounter,
    shareOfferListing,
    sendNewOffer,
    requestBusy,
    acceptRequest,
    declineRequest,
    quickReplyRole,
    senderNameFor,
    previewTextFor,
  };
}
