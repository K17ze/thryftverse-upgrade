/**
 * useEditGroupMedia — staged avatar/cover editing for the edit-group
 * screen. Unlike useGroupMediaEditing (which persists each pick
 * immediately), edits here are staged locally and committed by the save
 * flow — picks and presets produce optimistic previews plus upload
 * receipts (finalizationId) that the save payload consumes.
 *
 * The media source sheet owns its own dismissal (it calls onClose after
 * every select), so the handlers below only mutate the draft.
 * Extracted verbatim from EditGroupScreen.
 */

import { useCallback, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../useHaptic';
import { useGroupMediaUpload } from '../useGroupMediaUpload';
import { parseApiError } from '../../lib/apiClient';
import { uploadRemoteGroupPreset } from '../../components/groupchat/groupPresetUpload';
import type { GroupMediaSource } from '../../components/chat/GroupMediaSourceSheet';
import type { Conversation } from '../../domain/conversation';

export interface EditGroupMediaSheetState {
  visible: boolean;
  target: 'avatar' | 'cover';
}

interface EditGroupPresetMedia {
  target: 'avatar' | 'cover';
  previewUri: string;
  remoteUrl: string | null;
  finalizationId: string | null;
  status: 'uploading' | 'confirmed' | 'failed';
}

export function useEditGroupMedia({
  conversation,
  onDraftChanged,
}: {
  conversation: Conversation | undefined;
  /** Runs whenever the media draft changes — invalidates a pending save. */
  onDraftChanged: () => void;
}) {
  const { show } = useToast();
  const haptic = useHaptic();

  const [mediaSheet, setMediaSheet] = useState<EditGroupMediaSheetState>({
    visible: false,
    target: 'avatar',
  });

  // Flagship media upload — optimistic preview, compression, camera+gallery, retry/revert.
  const groupMedia = useGroupMediaUpload(conversation?.avatar ?? null, conversation?.coverPhoto ?? null);

  // Curated presets are remote URLs. The conversation API requires an upload
  // receipt (finalizationId) for avatar/cover strings, so a selected preset is
  // downloaded and pushed through the standard upload pipeline before save.
  const [presetMedia, setPresetMedia] = useState<EditGroupPresetMedia | null>(null);

  const presetAvatar = presetMedia?.target === 'avatar' ? presetMedia : null;
  const presetCover = presetMedia?.target === 'cover' ? presetMedia : null;
  const isUploadingPhoto =
    groupMedia.avatar.status === 'uploading' || presetAvatar?.status === 'uploading';
  const isUploadingCover =
    groupMedia.cover.status === 'uploading' || presetCover?.status === 'uploading';
  const avatar = presetAvatar?.remoteUrl ?? groupMedia.avatar.confirmedRemote;
  const avatarFinalizationId = presetAvatar?.finalizationId ?? groupMedia.avatar.finalizationId;
  const coverPhoto = presetCover?.remoteUrl ?? groupMedia.cover.confirmedRemote;
  const coverPhotoFinalizationId = presetCover?.finalizationId ?? groupMedia.cover.finalizationId;
  const avatarDisplayUri = presetAvatar?.previewUri ?? groupMedia.avatarDisplayUri;
  const coverDisplayUri = presetCover?.previewUri ?? groupMedia.coverDisplayUri;

  const openMediaSheet = useCallback(
    (target: 'avatar' | 'cover') => setMediaSheet({ visible: true, target }),
    []
  );
  const closeMediaSheet = useCallback(
    () => setMediaSheet((prev) => ({ ...prev, visible: false })),
    []
  );

  const handleMediaSourceSelect = useCallback(
    (source: GroupMediaSource) => {
      const target = mediaSheet.target;
      setPresetMedia(null);
      if (target === 'avatar') {
        void groupMedia.pickAvatar(source);
      } else {
        void groupMedia.pickCover(source);
      }
      onDraftChanged();
    },
    [mediaSheet.target, groupMedia, onDraftChanged]
  );

  const handleSelectPreset = useCallback(
    (url: string) => {
      const target = mediaSheet.target;
      onDraftChanged();
      setPresetMedia({
        target,
        previewUri: url,
        remoteUrl: null,
        finalizationId: null,
        status: 'uploading',
      });
      uploadRemoteGroupPreset(url, target)
        .then((uploaded) => {
          setPresetMedia((current) =>
            current?.target === target && current.previewUri === url
              ? {
                  ...current,
                  remoteUrl: uploaded.publicUrl,
                  finalizationId: uploaded.finalizationId,
                  status: 'confirmed',
                }
              : current
          );
        })
        .catch((err) => {
          setPresetMedia((current) =>
            current?.target === target && current.previewUri === url ? null : current
          );
          show(parseApiError(err, 'Could not apply that preset.').message, 'error');
        });
    },
    [mediaSheet.target, onDraftChanged, show]
  );

  const removeAvatar = useCallback(() => {
    haptic.light();
    groupMedia.removeAvatar();
    if (presetMedia?.target === 'avatar') setPresetMedia(null);
    onDraftChanged();
  }, [haptic, groupMedia, presetMedia, onDraftChanged]);

  const removeCover = useCallback(() => {
    haptic.light();
    groupMedia.removeCover();
    if (presetMedia?.target === 'cover') setPresetMedia(null);
    onDraftChanged();
  }, [haptic, groupMedia, presetMedia, onDraftChanged]);

  return {
    mediaSheet,
    openMediaSheet,
    closeMediaSheet,
    avatar,
    avatarFinalizationId,
    coverPhoto,
    coverPhotoFinalizationId,
    avatarDisplayUri,
    coverDisplayUri,
    avatarUploadStatus: groupMedia.avatar.status,
    coverUploadStatus: groupMedia.cover.status,
    isUploadingPhoto,
    isUploadingCover,
    handleMediaSourceSelect,
    handleSelectPreset,
    removeAvatar,
    removeCover,
  };
}

export type EditGroupMedia = ReturnType<typeof useEditGroupMedia>;
