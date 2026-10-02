'use client';

import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react';
import type { Conversation, Message } from '@/lib/contracts/domain';
import { useToast } from '@/components/ui/Toast';
import { isMine, isSystem } from './ChatStreamUtils';

const NEAR_BOTTOM_PX = 80;

interface UseChatStreamNavigationOptions {
  conversationId: string;
  conversation?: Conversation | null;
  messages: Message[];
  searchOpen: boolean;
  history: {
    hasMore: boolean;
    loading: boolean;
    loadOlder: () => void;
  };
  senderNameFor: (m: Message) => string;
  previewTextFor: (m: Message) => string;
}

export function useChatStreamNavigation({
  conversationId,
  conversation,
  messages,
  searchOpen,
  history,
  senderNameFor,
  previewTextFor,
}: UseChatStreamNavigationOptions) {
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const prependAnchor = useRef<{ height: number; top: number } | null>(null);
  const nearBottom = useRef(true);
  const [newBelow, setNewBelow] = useState(false);
  const [arrivalAnnouncement, setArrivalAnnouncement] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountScroll = useRef(false);

  const unreadAnchor = useRef<{ cid: string; taken: boolean; id: string | null }>({
    cid: conversationId,
    taken: false,
    id: null,
  });

  // Reset navigation when conversation changes
  useEffect(() => {
    didMountScroll.current = false;
    prependAnchor.current = null;
    nearBottom.current = true;
    setNewBelow(false);
    setFlashId(null);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    unreadAnchor.current = { cid: conversationId, taken: false, id: null };
  }, [conversationId]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // Unread divider anchor
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, searchOpen]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottom.current = remaining <= NEAR_BOTTOM_PX;
    if (nearBottom.current) setNewBelow(false);
    if (el.scrollTop === 0 && history.hasMore && !history.loading) {
      prependAnchor.current = { height: el.scrollHeight, top: 0 };
      history.loadOlder();
    }
  };

  const scrollToBottom = (smooth: boolean | React.SyntheticEvent = true) => {
    const el = scrollRef.current;
    if (!el) return;
    const isSmooth = typeof smooth === 'boolean' ? smooth : true;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: isSmooth ? 'smooth' : 'auto',
    });
    nearBottom.current = true;
    setNewBelow(false);
  };

  return {
    scrollRef,
    nearBottom,
    newBelow,
    setNewBelow,
    arrivalAnnouncement,
    flashId,
    unreadAnchorId: unreadAnchor.current.id,
    scrollToMessage,
    loadOlder,
    onScroll,
    scrollToBottom,
  };
}
