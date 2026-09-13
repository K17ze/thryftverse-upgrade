/**
 * useGroupMuteToggle — conversation mute toggle for the group details
 * screen, with a re-entrancy guard and busy state for the row + dock.
 * Extracted verbatim from GroupChatInfoScreen.
 */

import { useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../useHaptic';
import { parseApiError } from '../../lib/apiClient';

export function useGroupMuteToggle(conversationId: string, isMuted: boolean) {
  const { show } = useToast();
  const haptic = useHaptic();
  const toggleMuted = useStore((state) => state.toggleMutedConversation);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const mutePending = useRef(false);

  const toggleMute = async () => {
    if (mutePending.current) return;
    mutePending.current = true;
    haptic.light();
    setIsTogglingMute(true);
    try {
      await toggleMuted(conversationId);
      show(isMuted ? 'Conversation unmuted' : 'Conversation muted', 'success');
    } catch (err) {
      show(parseApiError(err, 'Could not update mute status. Try again.').message, 'error');
    } finally {
      mutePending.current = false;
      setIsTogglingMute(false);
    }
  };

  return { isTogglingMute, toggleMute };
}
