'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { useRouter } from 'next/navigation';
import type { Message } from '@/lib/contracts/domain';
import type { useToast } from '@/components/ui/Toast';
import { CLOSED_CONFIRM, type ConfirmSheetState } from '../ConfirmSheet';

interface UseChatInteractionsOptions {
  conversationId: string;
  hasCounterTarget: boolean;
  router: ReturnType<typeof useRouter>;
  toast: ReturnType<typeof useToast>;
}

/**
 * Chat panel interaction, menu, and modal workflow:
 *  - Search query staging and ref autofocus
 *  - Message context menu coordinates and target selection
 *  - Reply and inline editing staging
 *  - Deletion/report confirmation sheet state
 *  - Global escape key hierarchy dismissing top-most layer
 *  - Native clipboard copy helper
 */
export function useChatInteractions({
  conversationId,
  hasCounterTarget,
  router,
  toast,
}: UseChatInteractionsOptions) {
  const [descDismissed, setDescDismissed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [msgMenu, setMsgMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSheetState>(CLOSED_CONFIRM);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset local interactive staging when thread switches
  useEffect(() => {
    setDescDismissed(false);
    setSearchOpen(false);
    setQuery('');
    setReplyTarget(null);
    setMsgMenu(null);
    setEditing(null);
    setConfirm(CLOSED_CONFIRM);
  }, [conversationId]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Escape key hierarchy
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (msgMenu || confirm.open || hasCounterTarget) return;
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
    hasCounterTarget,
    searchOpen,
    editing,
    replyTarget,
    router,
  ]);

  const replyMessage = useCallback((m: Message) => setReplyTarget(m), []);

  const reactAt = useCallback(
    (m: Message, anchor: { x: number; y: number }) => {
      setMsgMenu({ id: m.id, x: anchor.x, y: anchor.y });
    },
    [],
  );

  const openMessageMenu = useCallback(
    (x: number, y: number, m: Message) => setMsgMenu({ id: m.id, x, y }),
    [],
  );

  const copyMessageText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show('Message copied', 'success');
    } catch {
      toast.show("Couldn't copy — clipboard access was blocked", 'error');
    }
  };

  return {
    descDismissed,
    setDescDismissed,
    searchOpen,
    setSearchOpen,
    query,
    setQuery,
    searchInputRef,
    replyTarget,
    setReplyTarget,
    replyMessage,
    msgMenu,
    setMsgMenu,
    reactAt,
    openMessageMenu,
    editing,
    setEditing,
    confirm,
    setConfirm,
    copyMessageText,
  };
}
