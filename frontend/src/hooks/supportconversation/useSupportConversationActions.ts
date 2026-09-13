import { useCallback, useState } from 'react';

import type { SupportConversation } from '../../contracts/support';
import {
  requestSupportHandoff,
  confirmSupportResolution,
  submitSupportFeedback } from '../../services/supportConversationApi';

interface UseSupportConversationActionsOptions {
  conversationId: string;
  conversation: SupportConversation | null;
  setConversation: React.Dispatch<React.SetStateAction<SupportConversation | null>>;
  show: (msg: string, type: 'success' | 'error' | 'info') => void;
  haptic: { light: () => void; medium: () => void };
}

/**
 * useSupportConversationActions — owns the non-message actions on a
 * support conversation: human handoff request, resolution confirmation
 * (which also arms the feedback prompt on resolve), and the
 * helpful/unhelpful feedback submission.
 */
export function useSupportConversationActions({
  conversationId,
  conversation,
  setConversation,
  show,
  haptic }: UseSupportConversationActionsOptions) {
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // ── Request handoff ──
  const handleHandoff = useCallback(async () => {
    if (!conversation || isHandingOff) return;
    setIsHandingOff(true);
    haptic.medium();
    try {
      await requestSupportHandoff(conversationId, 'Customer requested human support');
      setConversation(prev => prev ? { ...prev, ownershipState: 'human_queued' } : prev);
      show("You're in the queue. A specialist will continue here.", 'info');
    } catch {
      show('Could not request a specialist. Try again.', 'error');
    } finally {
      setIsHandingOff(false);
    }
  }, [conversation, conversationId, isHandingOff, haptic, show, setConversation]);

  // ── Confirm resolution ──
  const handleConfirmResolution = useCallback(async (resolved: boolean) => {
    if (!conversation || isConfirming) return;
    setIsConfirming(true);
    haptic.medium();
    try {
      await confirmSupportResolution(conversationId, resolved);
      if (resolved) {
        setConversation(prev => prev ? { ...prev, ownershipState: 'closed' } : prev);
        setShowFeedback(true);
        show('Marked as resolved', 'success');
      } else {
        setConversation(prev => prev ? { ...prev, ownershipState: 'ai_active' } : prev);
        show("We'll continue helping you here.", 'info');
      }
    } catch {
      show('Could not submit. Check your connection.', 'error');
    } finally {
      setIsConfirming(false);
    }
  }, [conversation, conversationId, isConfirming, haptic, show, setConversation]);

  // ── Submit feedback ──
  const handleFeedback = useCallback(async (rating: 'helpful' | 'unhelpful') => {
    haptic.light();
    try {
      await submitSupportFeedback(conversationId, rating);
      setShowFeedback(false);
      show('Thanks for your feedback', 'success');
    } catch {
      show('Could not submit feedback', 'error');
    }
  }, [conversationId, haptic, show]);

  return {
    isHandingOff,
    handleHandoff,
    showFeedback,
    isConfirming,
    handleConfirmResolution,
    handleFeedback };
}
