import { useCallback, useEffect, useRef } from 'react';
import { DATA_MODE } from '@/lib/api/client';
import { setTypingStatus } from '@/lib/api/services/chat';

export function useTypingSignal(threadId: string | undefined) {
  // ── Typing signal — the mobile useConversationComposer grammar. The
  // edge is realtime-only (chat.typing.update fans out to the thread
  // topic, nothing persists), so it fires purely on local transitions:
  // start after a 1s debounce while the draft is non-empty, stop after
  // 3s idle, on send, or when the draft clears. Live mode only — the
  // fixture dataset has no endpoint. The endpoint is rate-limited
  // (10/10s); one POST per transition stays far inside it.
  const typingOn = useRef(false);
  const typingStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const postTyping = useCallback(
    (on: boolean) => {
      if (!threadId || DATA_MODE !== 'live' || typingOn.current === on) return;
      typingOn.current = on;
      setTypingStatus(threadId, on).catch(() => undefined);
    },
    [threadId],
  );

  const clearTypingTimers = useCallback(() => {
    if (typingStartTimer.current) {
      clearTimeout(typingStartTimer.current);
      typingStartTimer.current = null;
    }
    if (typingStopTimer.current) {
      clearTimeout(typingStopTimer.current);
      typingStopTimer.current = null;
    }
  }, []);

  const stopTypingNow = useCallback(() => {
    clearTypingTimers();
    postTyping(false);
  }, [clearTypingTimers, postTyping]);

  const noteKeystroke = useCallback(
    (next: string) => {
      if (!threadId || DATA_MODE !== 'live') return;
      if (typingStopTimer.current) {
        clearTimeout(typingStopTimer.current);
        typingStopTimer.current = null;
      }
      if (next.length > 0) {
        if (!typingOn.current && !typingStartTimer.current) {
          typingStartTimer.current = setTimeout(() => {
            typingStartTimer.current = null;
            postTyping(true);
          }, 1000);
        }
        typingStopTimer.current = setTimeout(() => {
          typingStopTimer.current = null;
          postTyping(false);
        }, 3000);
      } else {
        // Draft cleared — no lingering "typing…" on the far side.
        if (typingStartTimer.current) {
          clearTimeout(typingStartTimer.current);
          typingStartTimer.current = null;
        }
        postTyping(false);
      }
    },
    [threadId, postTyping],
  );

  // Thread switch / unmount — a live "typing" must be stopped on the
  // thread it belongs to before the composer moves on. The cleanup runs
  // with the previous threadId, which is exactly the target of the stop.
  useEffect(() => {
    return () => {
      clearTypingTimers();
      if (threadId && DATA_MODE === 'live' && typingOn.current) {
        typingOn.current = false;
        setTypingStatus(threadId, false).catch(() => undefined);
      }
    };
  }, [threadId, clearTypingTimers]);

  return {
    noteKeystroke,
    stopTypingNow,
  };
}
