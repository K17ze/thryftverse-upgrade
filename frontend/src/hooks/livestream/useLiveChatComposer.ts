/**
 * useLiveChatComposer — chat input state and send for the live stream
 * viewer.
 *
 * Owns:
 * - Composer text state
 * - Authenticated send via the realtime chat contract — the message lands
 *   in the list through the chat subscription, not a local append.
 */

import { useCallback, useState } from 'react';
import { useHaptic } from '../useHaptic';
import { useSignupWall } from '../useSignupWall';
import { useToast } from '../../context/ToastContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { sendStreamChatMessage } from '../../services/liveShoppingApi';

export function useLiveChatComposer(sessionId: string) {
  const haptic = useHaptic();
  const { show } = useToast();
  const { requireAuth } = useSignupWall();
  const { t } = useAppTranslation('liveStreamViewer');

  const [chatInput, setChatInput] = useState('');

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim()) return;
    if (!requireAuth('message_seller')) return;
    const text = chatInput.trim();
    setChatInput('');
    haptic.light();
    try {
      await sendStreamChatMessage(sessionId, text);
    } catch {
      show(t('toast.couldNotSend'), 'error');
    }
  }, [chatInput, haptic, sessionId, show, requireAuth, t]);

  return { chatInput, setChatInput, handleSendChat };
}
