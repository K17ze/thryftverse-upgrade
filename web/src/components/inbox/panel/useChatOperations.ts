'use client';

import { useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { useRouter } from 'next/navigation';
import type { Message } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import { reportChatMessage, writePinnedMessage } from '@/lib/hooks/chat-queries';
import { acceptFixtureRequest, liveConversationApi } from '../groupAdmin';
import type { SendChatMessageInput } from '@/lib/hooks/queries';
import type { useToast } from '@/components/ui/Toast';

interface UseChatOperationsOptions {
  conversationId: string;
  isGroup: boolean;
  pin: { messageId?: string } | null;
  refreshPinned: () => void;
  forwardMessage: (targetId: string, m: Message) => Promise<unknown>;
  toast: ReturnType<typeof useToast>;
  router: ReturnType<typeof useRouter>;
  qc: QueryClient;
  send: (input: SendChatMessageInput) => void;
  pendingInputs: React.MutableRefObject<Map<string, SendChatMessageInput>>;
  setPending: React.Dispatch<React.SetStateAction<Message[]>>;
  setFailedIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  setRequestResolution: (id: string, res: 'accepted' | 'declined' | null) => void;
}

export function useChatOperations({
  conversationId,
  pin,
  refreshPinned,
  forwardMessage,
  toast,
  router,
  qc,
  send,
  pendingInputs,
  setPending,
  setFailedIds,
  setRequestResolution,
}: UseChatOperationsOptions) {
  const [requestBusy, setRequestBusy] = useState(false);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);

  // Retry a failed send
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

  // Discard a failed pending send
  const discardPending = (m: Message) => {
    setPending((p) => p.filter((x) => x.id !== m.id));
    setFailedIds((s) => {
      const n = new Set(s);
      n.delete(m.id);
      return n;
    });
    pendingInputs.current.delete(m.id);
  };

  // Pin / unpin message
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

  // Report message
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

  // Forward message target resolution
  const forwardPicked = (targetId: string) => {
    const m = forwardTarget;
    setForwardTarget(null);
    if (!m) return;
    forwardMessage(targetId, m)
      .then(() => toast.show('Message forwarded', 'success'))
      .catch(() => toast.show("Couldn't forward the message — try again", 'error'));
  };

  // Accept inbound message request
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

  // Decline inbound message request
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

  return {
    requestBusy,
    forwardTarget,
    setForwardTarget,
    retryPending,
    discardPending,
    togglePin,
    reportMessage,
    forwardPicked,
    acceptRequest,
    declineRequest,
  };
}
