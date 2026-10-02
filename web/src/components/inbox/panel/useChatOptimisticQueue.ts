'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conversation, Message } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import {
  messageClientMessageId,
  newClientMessageId,
  type MessageWithClientId,
} from '@/lib/api/services/chat';
import type { useSendChatMessage, SendChatMessageInput } from '@/lib/hooks/queries';
import type { useToast } from '@/components/ui/Toast';

interface UseChatOptimisticQueueOptions {
  conversationId: string;
  viewerId: string;
  conversation?: Conversation | null;
  replyTarget: Message | null;
  setReplyTarget: (m: Message | null) => void;
  sendMessage: ReturnType<typeof useSendChatMessage>;
  toast: ReturnType<typeof useToast>;
}

/**
 * Optimistic message queue:
 *  - Generates client-side optimistic message with unique id & clientMessageId
 *  - Records send mutations with retry buffers
 *  - Handles server echo deduction and gap reconciliations
 *  - Resets on thread transition
 */
export function useChatOptimisticQueue({
  conversationId,
  viewerId,
  conversation,
  replyTarget,
  setReplyTarget,
  sendMessage,
  toast,
}: UseChatOptimisticQueueOptions) {
  const [pending, setPending] = useState<Message[]>([]);
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());
  const pendingInputs = useRef(new Map<string, SendChatMessageInput>());

  // Reset optimistic state on conversation switch
  useEffect(() => {
    setPending([]);
    setFailedIds(new Set());
    pendingInputs.current.clear();
  }, [conversationId]);

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

  // Reconcile optimistic sends against confirmed conversation messages
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

  return {
    pending,
    setPending,
    failedIds,
    setFailedIds,
    pendingInputs,
    send,
    onServerEcho,
  };
}
