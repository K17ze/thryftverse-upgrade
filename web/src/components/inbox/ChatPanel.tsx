'use client';

/**
 * ChatPanel — conversation thread orchestrator (desktop right pane / mobile full screen).
 * Connects presence, realtime SSE stream, date-grouped message feed,
 * offer lifecycles, and optimistic composer.
 */

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
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { timeAgo } from '@/lib/utils/format';
import { Composer } from './Composer';
import { CLOSED_CONFIRM, type ConfirmSheetState } from './ConfirmSheet';
import { ChatSafetyBanner } from './ChatSafetyBanner';
import { detectThreadSafetyWarning } from './chatSafety';
import {
  MESSAGE_EDIT_WINDOW_MS,
  QUICK_REACTIONS,
  forwardableMessage,
  reportChatMessage,
  useForwardMessage,
  useMessageHistory,
  usePinnedMessage,
  useThreadActions,
  writePinnedMessage,
} from '@/lib/hooks/chat-queries';
import { MessageActionsMenu } from './MessageBubble';
import { sharedMediaItemFor, type SharedMediaItem } from './SharedMediaGrid';
import {
  acceptFixtureRequest,
  isGroupManager,
  liveConversationApi,
  useGroupAdminStore,
} from './groupAdmin';
import type { OfferWithOrder } from '@/lib/commerce/offerAcceptance';
import { useInboxSafety } from './inboxSafety';
import { useReadReceiptsEnabled } from '@/lib/store/chatPrefs';
import { useGroupCapabilities } from './useConversationAdmin';
import {
  useChatOfferActions,
  useChatOffers,
} from './useChatOffers';
import { useResolvedListings } from '@/lib/hooks/home-modules';
import { useListingIds } from '@/lib/hooks/listing-resolution';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';
import {
  conversationTitle,
  isGroupConversation,
  memberCount,
  senderLabelFor,
} from './inboxModel';

// Sub-components factored out for modular domain architecture (<400 LOC target)
import { ChatSkeleton } from './panel/ChatSkeleton';
import { ChatHeader } from './panel/ChatHeader';
import { ChatSearchRail } from './panel/ChatSearchRail';
import { ChatListingContext } from './panel/ChatListingContext';
import { MessageRequestBanner } from './panel/MessageRequestBanner';
import { PinnedMessageBar } from './panel/PinnedMessageBar';
import { ChatMessageList } from './panel/ChatMessageList';
import { ChatModals } from './panel/ChatModals';
import {
  groupByDay,
  isMine,
  isSystem,
  isOffer,
} from './panel/ChatStreamUtils';

const PRESENCE_KEY = (id: string) => ['conversation-presence', id] as const;

function useConversationPresence(conversationId: string, enabled: boolean) {
  return useQuery<ConversationPresence | null>({
    queryKey: [...PRESENCE_KEY(conversationId)],
    queryFn: ({ signal }) => fetchConversationPresence(conversationId, signal),
    enabled: DATA_MODE === 'live' && enabled && !!conversationId,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

const NEAR_BOTTOM_PX = 80;

export function ChatPanel({ conversationId }: { conversationId: string }) {
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

  const { data: chatOffers } = useChatOffers();
  const {
    respond: respondToOffer,
    sendCounter,
    sendNewOffer,
  } = useChatOfferActions(conversationId);
  const [counterTarget, setCounterTarget] = useState<OfferWithOrder | null>(null);

  const [shareOfferId, setShareOfferId] = useState<string | null>(null);
  const shareOfferResolved = useListingIds(
    useMemo(() => (shareOfferId ? [shareOfferId] : []), [shareOfferId]),
  );
  const shareOfferListing = shareOfferId
    ? shareOfferResolved.byId.get(shareOfferId)
    : undefined;

  const { items: counterListingResolved } = useResolvedListings(
    counterTarget ? [counterTarget.listingId] : [],
  );
  const counterListing = counterListingResolved[0];

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
  const [msgMenu, setMsgMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSheetState>(CLOSED_CONFIRM);
  const [safetyDismissed, setSafetyDismissed] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [mediaIndex, setMediaIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prependAnchor = useRef<{ height: number; top: number } | null>(null);
  const nearBottom = useRef(true);
  const [newBelow, setNewBelow] = useState(false);
  const [arrivalAnnouncement, setArrivalAnnouncement] = useState('');

  const history = useMessageHistory(conversationId, conversation);
  const threadActions = useThreadActions(conversationId, history.patchOlder);
  const { data: allConversations } = useConversations();
  const forwardMessage = useForwardMessage();
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);

  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());
  const pendingInputs = useRef(new Map<string, SendChatMessageInput>());

  const roleOverrides = useGroupAdminStore((s) =>
    conversation ? s.roleOverrides[conversation.id] : undefined,
  );
  const canPinMessage =
    !!conversation && isGroup && isGroupManager(conversation, viewerId, roleOverrides);

  const { pin, refresh: refreshPinned } = usePinnedMessage(
    conversationId,
    isGroup,
    hydrated && !isGuest,
    conversation,
  );

  const peerUserId =
    conversation && !isGroup ? conversation.participantId || null : null;
  const presenceQuery = useConversationPresence(
    conversationId,
    !!conversation && !isGroup && !isGuest,
  );

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

  const requestResolutions = useInboxPrefs((s) => s.requests);
  const setRequestResolution = useInboxPrefs((s) => s.setRequestResolution);
  const [requestBusy, setRequestBusy] = useState(false);
  const qc = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const didMountScroll = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadAnchor = useRef<{ cid: string; taken: boolean; id: string | null }>({
    cid: conversationId,
    taken: false,
    id: null,
  });

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

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

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

  const needsRead = !!conversation && (conversation.unread || (conversation.unreadCount ?? 0) > 0);
  useEffect(() => {
    if (needsRead) markConversationRead(conversationId);
  }, [conversationId, needsRead, markConversationRead]);

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

  const mediaItems = useMemo<SharedMediaItem[]>(
    () =>
      conversation
        ? messages
            .map((m) => sharedMediaItemFor(conversation, m))
            .filter((x): x is SharedMediaItem => x !== null)
        : [],
    [conversation, messages],
  );

  const openMediaFor = useCallback(
    (m: Message) => {
      const at = mediaItems.findIndex((it) => it.id === m.id);
      if (at >= 0) setMediaIndex(at);
    },
    [mediaItems],
  );

  const meta = marketplaceMeta(conversation);
  const safetyListingId =
    conversation?.listing?.id ?? meta.itemId ?? meta.listingId;
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
  const threadSellerId =
    threadListing?.sellerId ?? threadOffer?.sellerId ?? meta.listingSellerId ?? metaOwnerId;

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

  const searchQuery = query.trim();
  const matches = useMemo(() => {
    if (!searchQuery) return messages;
    const needle = searchQuery.toLowerCase();
    return messages.filter(
      (m) => !m.isDeleted && (m.text ?? m.systemTitle ?? '').toLowerCase().includes(needle),
    );
  }, [messages, searchQuery]);

  const messageById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const senderNameFor = (m: Message): string =>
    !conversation
      ? 'Member'
      : isMine(m)
        ? 'You'
        : isGroup
          ? senderLabelFor(conversation, m.senderId)
          : conversation.participantName;

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

  const pinnedView = useMemo(() => {
    if (!pin) return null;
    const m = messageById.get(pin.messageId) ?? pin.message;
    if (!m || m.isDeleted) return null;
    return {
      messageId: pin.messageId,
      senderLabel: senderNameFor(m),
      text: previewTextFor(m),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- senderNameFor/previewTextFor are render-closures over the same conversation/message set
  }, [pin, messageById]);

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

  const loadOlder = () => {
    if (!history.hasMore || history.loading) return;
    const el = scrollRef.current;
    if (el) prependAnchor.current = { height: el.scrollHeight, top: el.scrollTop };
    history.loadOlder();
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- senderNameFor/previewTextFor are render-closures over the same conversation/message set
  }, [messages, searchOpen]);

  const onStreamScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop < 64) loadOlder();
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    nearBottom.current = near;
    if (near) setNewBelow(false);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      nearBottom.current = true;
    }
    setNewBelow(false);
  };

  const send = (input: SendChatMessageInput) => {
    const replyToMessageId = replyTarget?.id ?? input.replyToMessageId;
    const clientMessageId =
      DATA_MODE === 'live'
        ? (input.clientMessageId ?? newClientMessageId())
        : undefined;
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
          setFailedIds((s) => new Set(s).add(optimistic.id));
          toast.show("Message couldn't be sent", 'error');
        },
      },
    );
  };

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

  const discardPending = (m: Message) => {
    setPending((p) => p.filter((x) => x.id !== m.id));
    setFailedIds((s) => {
      const n = new Set(s);
      n.delete(m.id);
      return n;
    });
    pendingInputs.current.delete(m.id);
  };

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

  const forwardPicked = (targetId: string) => {
    const m = forwardTarget;
    setForwardTarget(null);
    if (!m) return;
    forwardMessage(targetId, m)
      .then(() => toast.show('Message forwarded', 'success'))
      .catch(() => toast.show("Couldn't forward the message — try again", 'error'));
  };

  if (isGuest) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <EmptyState
          icon="chat"
          title="Sign in to message"
          subtitle="Messages and offers live on your account."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </div>
    );
  }

  if (isLoading) return <ChatSkeleton />;

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <EmptyState
          icon="alert"
          title="Couldn't load this conversation"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      </div>
    );
  }

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
  const presence = presenceQuery.data ?? null;
  const isPeerOnline =
    !isGroup &&
    (DATA_MODE === 'live'
      ? presence?.isOnline === true
      : conversation.isOnline === true);

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
        : conversation.isOnline
          ? 'Active now'
          : participant?.lastSeen
            ? /^(now|just now)$/i.test(participant.lastSeen)
              ? 'Active now'
              : `Last seen ${participant.lastSeen}`
            : null;

  const requestResolution = hydrated
    ? requestResolutions[conversationId]
    : undefined;
  const pendingRequest =
    !isGroup &&
    (conversation.isRequest === true ||
      (allConversations ?? []).find((c) => c.id === conversationId)?.isRequest === true) &&
    !requestResolution;

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
  const lastMineReadId =
    receiptsEnabled && lastMine?.readStatus === 'read' ? lastMine.id : undefined;

  const counterpartyBlocked =
    !isGroup && hydrated && !!conversation.participantId
      ? blockedUserIds.includes(conversation.participantId)
      : false;
  const groupReadOnly = isGroup && capabilities != null && !capabilities.canSendMessages;
  const composerOpen = !counterpartyBlocked && !groupReadOnly && !pendingRequest;

  const replyable = (m: Message) =>
    composerOpen && !isSystem(m) && !m.isDeleted && !m.id.startsWith('opt-');
  const actionable = (m: Message) =>
    !isSystem(m) && !m.isDeleted && !m.id.startsWith('opt-');

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

  const menuMessage = msgMenu ? messages.find((mm) => mm.id === msgMenu.id) : undefined;

  return (
    <div
      role="region"
      aria-label={`Conversation with ${title}`}
      className="flex h-full min-w-0 flex-col bg-background"
    >
      <ChatHeader
        conversationId={conversationId}
        title={title}
        subtitle={subtitle as string | null}
        isGroup={isGroup}
        conversation={conversation}
        viewerId={viewerId}
        isPeerOnline={isPeerOnline}
        searchOpen={searchOpen}
        onToggleSearch={() => {
          if (searchOpen) setQuery('');
          setSearchOpen((o) => !o);
        }}
        onBack={() => router.push('/inbox')}
        onInfo={() => router.push(`/inbox/${conversationId}/info`)}
      />

      <MessageRequestBanner
        show={Boolean(pendingRequest)}
        title={title}
        busy={requestBusy}
        onAccept={acceptRequest}
        onDecline={declineRequest}
      />

      <ChatSearchRail
        ref={searchInputRef}
        open={searchOpen}
        query={query}
        title={title}
        matchCount={matches.length}
        onQueryChange={setQuery}
        onClose={() => setSearchOpen(false)}
      />

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
            className="-my-1.5 shrink-0"
            onClick={() => setDescDismissed(true)}
          />
        </div>
      ) : null}

      <PinnedMessageBar
        pinnedView={pinnedView}
        canPin={canPinMessage}
        onScrollToMessage={scrollToMessage}
        onUnpin={() => {
          const m = messageById.get(pinnedView?.messageId ?? '') ?? pin?.message;
          if (m) togglePin(m);
        }}
      />

      <ChatListingContext listing={conversation.listing} />

      {safetyWarning && safetyDismissed !== safetyWarning.level ? (
        <ChatSafetyBanner
          warning={safetyWarning}
          onDismiss={
            safetyWarning.dismissible
              ? () => setSafetyDismissed(safetyWarning.level)
              : undefined
          }
        />
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onStreamScroll}
          role="log"
          aria-label="Messages"
          className="h-full overflow-y-auto px-3 py-4 md:px-4"
        >
          <div className="mx-auto w-full lg:max-w-3xl">
            {history.hasMore || history.loading ? (
              <div className="mb-1 flex justify-center">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={history.loading}
                  aria-live="polite"
                  className="pressable relative rounded-full border border-border-subtle bg-surface px-3.5 py-1.5 text-meta font-semibold text-text-secondary after:absolute after:-inset-y-2 after:content-[''] hover:text-text-primary disabled:opacity-60"
                >
                  {history.loading
                    ? 'Loading…'
                    : history.error
                      ? 'Couldn’t load — try again'
                      : 'Load older messages'}
                </button>
              </div>
            ) : history.older.length > 0 ? (
              <p className="mb-1 text-center text-meta text-text-muted">
                Beginning of conversation
              </p>
            ) : null}

            {searchQuery && matches.length === 0 ? (
              <p className="py-10 text-center text-body text-text-muted">
                No results for “{searchQuery}”
              </p>
            ) : (
              <ChatMessageList
                groups={groups}
                conversation={conversation}
                isGroup={isGroup}
                viewerId={viewerId}
                conversationId={conversationId}
                searchQuery={searchQuery}
                unreadAnchorId={unreadAnchor.current.id}
                flashId={flashId}
                failedIds={failedIds}
                lastMineReadId={lastMineReadId}
                nowMs={nowMs}
                chatOffers={chatOffers}
                replyable={replyable}
                actionable={actionable}
                isSaved={threadActions.isSaved}
                onReply={replyMessage}
                onReact={reactAt}
                onOpenMenu={(x, y, m) => setMsgMenu({ id: m.id, x, y })}
                onReplyPress={scrollToMessage}
                onMediaPress={openMediaFor}
                onToggleReaction={toggleReactionFor}
                onTogglePollVote={togglePollVoteFor}
                onRespondToOffer={respondToOffer}
                onCounterOffer={(offer) => setCounterTarget(offer)}
                onMakeShareOffer={(listingId) => setShareOfferId(listingId)}
                replyInfoFor={replyInfoFor}
              />
            )}

            {!searchQuery && messages.length === 0 ? (
              <p className="py-10 text-center text-body text-text-muted">
                Say hello to {title}.
              </p>
            ) : null}
          </div>
        </div>

        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
        >
          {newBelow ? (
            <button
              type="button"
              onClick={jumpToLatest}
              className="pressable pointer-events-auto flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-meta font-semibold text-text-inverse shadow-modal"
            >
              <Icon name="chevronDown" size={14} aria-hidden />
              New messages
            </button>
          ) : null}
        </div>
      </div>

      <p aria-live="polite" role="status" className="sr-only">
        {arrivalAnnouncement}
      </p>

      {msgMenu && menuMessage
        ? (() => {
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
                onRetry={menuFailed ? () => retryPending(menuMessage) : undefined}
                onRemove={menuFailed ? () => discardPending(menuMessage) : undefined}
                onReply={
                  menuFailed || !replyable(menuMessage)
                    ? undefined
                    : () => setReplyTarget(menuMessage)
                }
                onForward={
                  menuFailed || !forwardableMessage(menuMessage)
                    ? undefined
                    : () => setForwardTarget(menuMessage)
                }
                onPin={
                  menuFailed || !canPinMessage || !actionable(menuMessage)
                    ? undefined
                    : () => togglePin(menuMessage)
                }
                pinned={pin?.messageId === menuMessage.id}
                hasReacted={(emoji) => threadActions.hasReacted(menuMessage, emoji)}
                saved={threadActions.isSavedByMe(menuMessage)}
                onSave={
                  actionable(menuMessage) ||
                  (menuMessage.isDeleted === true && threadActions.isSaved(menuMessage))
                    ? () => threadActions.toggleSave(menuMessage)
                    : undefined
                }
                onReport={
                  menuFailed || isMine(menuMessage) || isSystem(menuMessage)
                    ? undefined
                    : () => reportMessage(menuMessage)
                }
                onCopy={
                  menuFailed || !menuMessage.text
                    ? undefined
                    : () => void copyMessageText(menuMessage.text as string)
                }
                onEdit={
                  !menuFailed && editable(menuMessage)
                    ? () => {
                        setReplyTarget(null);
                        setEditing(menuMessage);
                      }
                    : undefined
                }
                onDeleteForMe={
                  menuFailed
                    ? undefined
                    : () =>
                        setConfirm({
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
                        setConfirm({
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
                onClose={() => setMsgMenu(null)}
              />
            );
          })()
        : null}

      {peerTyping ? (
        <div className="shrink-0 px-4 pb-1" aria-live="polite">
          <div className="mx-auto flex w-full items-center gap-1.5 lg:max-w-3xl">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
            <span className="sr-only">{title} is typing</span>
          </div>
        </div>
      ) : null}

      {pendingRequest ? null : counterpartyBlocked ? (
        <div className="shrink-0 border-t border-border-subtle px-4 py-3">
          <div className="mx-auto flex w-full items-center justify-between gap-3 lg:max-w-3xl">
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
        </div>
      ) : groupReadOnly ? (
        <div className="shrink-0 border-t border-border-subtle px-4 py-3.5">
          <p className="mx-auto w-full text-center text-meta text-text-muted lg:max-w-3xl">
            Only admins can send messages in this group.
          </p>
        </div>
      ) : (
        <Composer
          threadId={conversationId}
          quickReplyRole={quickReplyRole}
          sending={sendMessage.isPending}
          onSend={send}
          replyTo={
            replyTarget
              ? { senderName: senderNameFor(replyTarget), text: previewTextFor(replyTarget) }
              : null
          }
          onCancelReply={() => setReplyTarget(null)}
          editTarget={editing ? { id: editing.id, text: editing.text ?? '' } : null}
          onEditSubmit={(id, text) => {
            threadActions.editMessage(id, text);
            setEditing(null);
          }}
          onCancelEdit={() => setEditing(null)}
        />
      )}

      <ChatModals
        confirmState={confirm}
        onCloseConfirm={() => setConfirm(CLOSED_CONFIRM)}
        forwardOpen={forwardTarget !== null}
        onCloseForward={() => setForwardTarget(null)}
        forwardTargets={(allConversations ?? []).filter((c) => c.id !== conversationId)}
        onForwardPick={forwardPicked}
        mediaItems={mediaItems}
        mediaIndex={mediaIndex}
        onMediaIndexChange={setMediaIndex}
        onCloseMedia={() => setMediaIndex(null)}
        counterTarget={counterTarget}
        counterListing={counterListing}
        onCloseCounter={() => setCounterTarget(null)}
        onSendCounter={(amount, expiryHours) => {
          if (counterTarget) sendCounter(counterTarget, amount, expiryHours);
          setCounterTarget(null);
        }}
        shareOfferListing={shareOfferListing}
        onCloseShareOffer={() => setShareOfferId(null)}
        onSendShareOffer={(amount, expiryHours) => {
          if (shareOfferListing) sendNewOffer(shareOfferListing, amount, expiryHours);
          setShareOfferId(null);
        }}
      />
    </div>
  );
}
