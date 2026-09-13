/**
 * useGroupMediaEditing — avatar/cover editing orchestration for the group
 * details screen: the media source sheet state, the upload pipeline
 * (useGroupMediaUpload), curated-preset handling with optimistic preview,
 * removal with rollback, and the confirmed-upload → API → store sync
 * effects. Extracted verbatim from GroupChatInfoScreen; upload internals
 * are unchanged.
 */

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useGroupMediaUpload } from '../useGroupMediaUpload';
import { updateConversationOnApi } from '../../services/chatApi';
import { parseApiError } from '../../lib/apiClient';
import { uploadRemoteGroupPreset } from '../../components/groupchat/groupPresetUpload';
import type { GroupMediaSource } from '../../components/chat/GroupMediaSourceSheet';
import type { Conversation } from '../../domain/conversation';
import type { GroupChatInfoMediaSheetState } from '../../components/groupchatinfo/GroupChatInfoSheets';

export function useGroupMediaEditing(
  conversation: Conversation | undefined,
  conversationId: string
) {
  const { show } = useToast();
  const upsertConversation = useStore((state) => state.upsertConversation);

  const [mediaSheet, setMediaSheet] = useState<GroupChatInfoMediaSheetState>({
    visible: false,
    target: 'avatar',
  });

  const mediaUpload = useGroupMediaUpload(
    conversation?.avatar ?? null,
    conversation?.coverPhoto ?? null
  );

  // Optimistic preview while a curated preset is being downloaded + uploaded.
  const [presetPreview, setPresetPreview] = useState<{
    target: 'avatar' | 'cover';
    uri: string;
  } | null>(null);

  const displayCoverPhoto =
    presetPreview?.target === 'cover'
      ? presetPreview.uri
      : mediaUpload.coverDisplayUri ?? conversation?.coverPhoto;
  const displayAvatar =
    presetPreview?.target === 'avatar'
      ? presetPreview.uri
      : mediaUpload.avatarDisplayUri ?? conversation?.avatar;

  const openMediaSheet = useCallback(
    (target: 'avatar' | 'cover') => setMediaSheet({ visible: true, target }),
    []
  );
  const closeMediaSheet = useCallback(
    () => setMediaSheet((prev) => ({ ...prev, visible: false })),
    []
  );

  const handleMediaSourceSelect = useCallback(
    async (source: GroupMediaSource) => {
      const target = mediaSheet.target;
      setMediaSheet((s) => ({ ...s, visible: false }));
      if (source === 'camera' || source === 'gallery') {
        if (target === 'avatar') {
          await mediaUpload.pickAvatar(source);
        } else {
          await mediaUpload.pickCover(source);
        }
      }
    },
    [mediaSheet.target, mediaUpload]
  );

  /**
   * A curated preset is a remote URL — the conversation API requires an
   * upload receipt (`finalizationId`) for avatar/cover strings, so the
   * preset is downloaded and pushed through the standard upload pipeline
   * before it is persisted. Preview stays optimistic; the store is only
   * written after the server confirms.
   */
  const handleSelectPreset = useCallback(
    async (url: string) => {
      const target = mediaSheet.target;
      setMediaSheet((s) => ({ ...s, visible: false }));
      if (!conversation) return;
      setPresetPreview({ target, uri: url });
      try {
        const uploaded = await uploadRemoteGroupPreset(url, target);
        const patch =
          target === 'avatar'
            ? { avatar: uploaded.publicUrl, avatarFinalizationId: uploaded.finalizationId }
            : {
                coverPhoto: uploaded.publicUrl,
                coverPhotoFinalizationId: uploaded.finalizationId,
              };
        await updateConversationOnApi(conversationId, patch);
        upsertConversation({
          ...conversation,
          ...(target === 'avatar'
            ? { avatar: uploaded.publicUrl }
            : { coverPhoto: uploaded.publicUrl }),
        });
        show(target === 'avatar' ? 'Group photo updated' : 'Cover banner updated', 'success');
      } catch (err) {
        show(parseApiError(err, 'Could not update photo').message, 'error');
      } finally {
        setPresetPreview(null);
      }
    },
    [conversation, conversationId, mediaSheet.target, upsertConversation, show]
  );

  const handleRemoveMedia = useCallback(async () => {
    const target = mediaSheet.target;
    setMediaSheet((s) => ({ ...s, visible: false }));
    try {
      if (target === 'avatar') {
        mediaUpload.removeAvatar();
        if (conversation) {
          upsertConversation({ ...conversation, avatar: undefined });
        }
        await updateConversationOnApi(conversationId, { avatar: null });
        show('Group photo removed', 'info');
      } else {
        mediaUpload.removeCover();
        if (conversation) {
          upsertConversation({ ...conversation, coverPhoto: undefined });
        }
        await updateConversationOnApi(conversationId, { coverPhoto: null });
        show('Cover banner removed', 'info');
      }
    } catch (err) {
      if (conversation) {
        upsertConversation(
          target === 'avatar'
            ? { ...conversation, avatar: conversation.avatar }
            : { ...conversation, coverPhoto: conversation.coverPhoto }
        );
      }
      show(parseApiError(err, 'Could not remove photo').message, 'error');
    }
  }, [conversation, conversationId, mediaSheet.target, mediaUpload, upsertConversation, show]);

  // Sync confirmed uploads to API & store
  useEffect(() => {
    if (mediaUpload.avatar.status === 'confirmed' && mediaUpload.avatar.confirmedRemote) {
      const prevAvatar = conversation?.avatar;
      updateConversationOnApi(conversationId, {
        avatar: mediaUpload.avatar.confirmedRemote,
        avatarFinalizationId: mediaUpload.avatar.finalizationId ?? undefined,
      })
        .then(() => {
          if (conversation) {
            useStore.getState().upsertConversation({
              ...conversation,
              avatar: mediaUpload.avatar.confirmedRemote ?? undefined,
            });
          }
          show('Group photo updated', 'success');
        })
        .catch((err) => {
          mediaUpload.removeAvatar();
          if (conversation) {
            useStore.getState().upsertConversation({ ...conversation, avatar: prevAvatar });
          }
          show(parseApiError(err, 'Could not save photo').message, 'error');
        });
    }
  }, [mediaUpload.avatar.status, mediaUpload.avatar.confirmedRemote]);

  useEffect(() => {
    if (mediaUpload.cover.status === 'confirmed' && mediaUpload.cover.confirmedRemote) {
      const prevCover = conversation?.coverPhoto;
      updateConversationOnApi(conversationId, {
        coverPhoto: mediaUpload.cover.confirmedRemote,
        coverPhotoFinalizationId: mediaUpload.cover.finalizationId ?? undefined,
      })
        .then(() => {
          if (conversation) {
            useStore.getState().upsertConversation({
              ...conversation,
              coverPhoto: mediaUpload.cover.confirmedRemote ?? undefined,
            });
          }
          show('Cover banner updated', 'success');
        })
        .catch((err) => {
          mediaUpload.removeCover();
          if (conversation) {
            useStore.getState().upsertConversation({ ...conversation, coverPhoto: prevCover });
          }
          show(parseApiError(err, 'Could not save cover banner').message, 'error');
        });
    }
  }, [mediaUpload.cover.status, mediaUpload.cover.confirmedRemote]);

  return {
    mediaSheet,
    openMediaSheet,
    closeMediaSheet,
    displayCoverPhoto,
    displayAvatar,
    handleMediaSourceSelect,
    handleSelectPreset,
    handleRemoveMedia,
  };
}
