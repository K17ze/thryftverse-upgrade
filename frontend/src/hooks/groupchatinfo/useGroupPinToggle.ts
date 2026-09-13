/**
 * useGroupPinToggle — pin-to-inbox toggle for the group details screen,
 * with a re-entrancy guard and busy state for the action row.
 * Extracted verbatim from GroupChatInfoScreen.
 */

import { useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { parseApiError } from '../../lib/apiClient';

export function useGroupPinToggle(conversationId: string, isPinned: boolean | undefined) {
  const { show } = useToast();
  const togglePinned = useStore((state) => state.toggleConversationPinned);
  const [isTogglingPin, setIsTogglingPin] = useState(false);
  const pinPending = useRef(false);

  const togglePin = async () => {
    if (pinPending.current) return;
    pinPending.current = true;
    setIsTogglingPin(true);
    try {
      await togglePinned(conversationId);
      show(isPinned ? 'Group unpinned' : 'Group pinned to your inbox', 'success');
    } catch (error) {
      show(parseApiError(error, 'Could not confirm pin status. Check your inbox and retry.').message, 'error');
    } finally {
      pinPending.current = false;
      setIsTogglingPin(false);
    }
  };

  return { isTogglingPin, togglePin };
}
