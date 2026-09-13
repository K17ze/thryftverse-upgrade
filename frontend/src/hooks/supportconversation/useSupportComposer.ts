import { useCallback, useState } from 'react';

import type { ConversationOwnershipState } from '../../contracts/support';
import { sendSupportMessage } from '../../services/supportConversationApi';
import {
  isPending,
  type DisplayMessage,
  type PendingMessage } from '../../components/supportconversation/supportConversationViewModels';

interface UseSupportComposerOptions {
  conversationId: string;
  ownershipState: ConversationOwnershipState;
  messages: DisplayMessage[];
  setMessages: React.Dispatch<React.SetStateAction<DisplayMessage[]>>;
  scrollToBottom: (animated?: boolean) => void;
  show: (msg: string, type: 'success' | 'error' | 'info') => void;
  haptic: { light: () => void; medium: () => void };
}

/**
 * useSupportComposer — owns composer text state plus the send/retry flow.
 * Sending is optimistic: a `sending` pending message is appended, patched
 * to the server message on success, or flipped to `failed` on error so the
 * row can offer tap-to-retry.
 */
export function useSupportComposer({
  conversationId,
  ownershipState,
  messages,
  setMessages,
  scrollToBottom,
  show,
  haptic }: UseSupportComposerOptions) {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const composerEnabled = ownershipState !== 'closed' && !isSending;
  const canSend = input.trim().length > 0 && !isSending && ownershipState !== 'closed';

  // ── Send message ──
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending || ownershipState === 'closed') return;

    const pendingId = `pending-${Date.now()}`;
    const pendingMessage: PendingMessage = {
      id: pendingId,
      conversationId,
      authorId: null,
      authorRole: 'customer',
      body: trimmed,
      citations: [],
      metadata: {},
      createdAt: new Date().toISOString(),
      status: 'sending' };

    setInput('');
    setIsSending(true);
    haptic.medium();
    setMessages(prev => [...prev, pendingMessage]);
    scrollToBottom(true);

    try {
      const sent = await sendSupportMessage(conversationId, trimmed);
      setMessages(prev => prev.map(m => (m.id === pendingId ? sent : m)));
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === pendingId && isPending(m)
            ? { ...m, status: 'failed' as const }
            : m
        )
      );
      show('Could not send message. Tap to retry.', 'error');
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, ownershipState, conversationId, haptic, show, setMessages, scrollToBottom]);

  // ── Retry failed message ──
  const handleRetry = useCallback(async (messageId: string) => {
    const failedMessage = messages.find(m => m.id === messageId);
    if (!failedMessage || !isPending(failedMessage) || failedMessage.status !== 'failed') return;

    setMessages(prev =>
      prev.map(m =>
        m.id === messageId && isPending(m)
          ? { ...m, status: 'sending' as const }
          : m
      )
    );

    try {
      const sent = await sendSupportMessage(conversationId, failedMessage.body);
      setMessages(prev => prev.map(m => (m.id === messageId ? sent : m)));
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId && isPending(m)
            ? { ...m, status: 'failed' as const }
            : m
        )
      );
      show('Still could not send. Check your connection.', 'error');
    }
  }, [messages, conversationId, show, setMessages]);

  return {
    input,
    setInput,
    isSending,
    composerEnabled,
    canSend,
    handleSend,
    handleRetry };
}
