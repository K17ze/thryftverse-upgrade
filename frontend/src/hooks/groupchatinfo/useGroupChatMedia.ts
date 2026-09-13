/**
 * useGroupChatMedia — shared-media state for the group details screen.
 * Loads the server media index (60-item window), exposes load/retry state,
 * and derives the row count plus the visual preview strip items (with the
 * local message fallback while the index is empty).
 * Extracted verbatim from GroupChatInfoScreen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Conversation } from '../../domain/conversation';
import { fetchConversationMediaFromApi } from '../../services/chatApi';
import {
  resolveGroupInfoMediaItems,
  toVisualMediaItems,
  type GroupInfoRemoteMedia,
} from '../../components/groupchatinfo/groupChatInfoViewModels';

export function useGroupChatMedia(
  conversationId: string,
  conversation: Conversation | undefined
) {
  const [remoteMedia, setRemoteMedia] = useState<GroupInfoRemoteMedia[]>([]);
  const [mediaState, setMediaState] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading');

  const loadMedia = useCallback(() => {
    setMediaState('loading');
    fetchConversationMediaFromApi(conversationId, { limit: 60 })
      .then((items) => {
        setRemoteMedia(items);
        setMediaState('ready');
      })
      .catch(() => {
        setMediaState('error');
      });
  }, [conversationId]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const mediaItems = useMemo(
    () => resolveGroupInfoMediaItems(remoteMedia, conversation?.messages),
    [remoteMedia, conversation?.messages]
  );

  const visualMediaItems = useMemo(() => toVisualMediaItems(mediaItems), [mediaItems]);

  return { mediaItems, mediaState, loadMedia, visualMediaItems };
}
