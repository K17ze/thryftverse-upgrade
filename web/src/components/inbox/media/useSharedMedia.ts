'use client';

import { useEffect, useMemo, useState } from 'react';
import { DATA_MODE } from '@/lib/api/client';
import type { Conversation } from '@/lib/contracts/domain';
import { isVideoUri } from '@/lib/utils/media';
import {
  sharedMediaItemsFor,
  type SharedMediaItem,
} from './sharedMediaModel';

export function useSharedMedia(conversation: Conversation | null | undefined) {
  const [remote, setRemote] = useState<SharedMediaItem[]>([]);
  const conversationId = conversation?.id;

  // Live mode fetches the server media feed once — the local store only
  // retains recently scrolled messages. Fixture mode is already complete.
  useEffect(() => {
    if (!conversationId || DATA_MODE !== 'live') return;
    let active = true;
    import('@/lib/api/http')
      .then(({ fetchJson }) =>
        fetchJson<{ items?: unknown[] }>(
          `/chat/conversations/${conversationId}/media?limit=60`,
        ),
      )
      .then((payload) => {
        if (!active || !payload?.items) return;
        setRemote(
          (
            payload.items as Array<{
              id: string;
              mediaUri: string;
              mediaType?: string;
              senderUserId?: string | null;
              createdAt?: string;
            }>
          )
            .filter((it) => it.mediaType !== 'document')
            .map((it) => ({
              id: it.id,
              uri: it.mediaUri,
              isVideo: it.mediaType === 'video' || isVideoUri(it.mediaUri),
              senderLabel: 'Member',
              timestamp: it.createdAt,
            })),
        );
      })
      .catch(() => {
        // Media absence is honest — the grid renders what the thread knows.
      });
    return () => {
      active = false;
    };
  }, [conversationId]);

  return useMemo(() => {
    if (!conversation) return [];
    const local = sharedMediaItemsFor(conversation);
    const seen = new Set(local.map((m) => m.id));
    return [...local, ...remote.filter((m) => !seen.has(m.id))];
  }, [conversation, remote]);
}
