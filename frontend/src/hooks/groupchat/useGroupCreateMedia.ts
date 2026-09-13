/**
 * useGroupCreateMedia — group avatar/cover media state for the
 * create-group flow: optimistic uploads via useGroupMediaUpload,
 * curated remote presets pushed through the upload pipeline, and the
 * media source sheet. Extracted verbatim from CreateGroupChatScreen.
 */

import { useCallback, useState } from 'react';
import { useHaptic } from '../useHaptic';
import { useToast } from '../../context/ToastContext';
import { useGroupMediaUpload, type GroupMediaUploadResult } from '../useGroupMediaUpload';
import { uploadRemoteGroupPreset } from '../../components/groupchat/groupPresetUpload';
import { parseApiError } from '../../lib/apiClient';
import type { GroupMediaSource } from '../../components/chat/GroupMediaSourceSheet';

export type GroupMediaTarget = 'avatar' | 'cover';

interface PresetMediaState {
  target: GroupMediaTarget;
  previewUri: string;
  remoteUrl: string | null;
  finalizationId: string | null;
  status: 'uploading' | 'confirmed' | 'failed';
}

export interface GroupCreateMediaResult {
  groupMedia: GroupMediaUploadResult;
  presetAvatar: PresetMediaState | null;
  presetCover: PresetMediaState | null;
  isUploadingPhoto: boolean;
  isUploadingCover: boolean;
  avatarDisplayUri: string | null;
  coverDisplayUri: string | null;
  mediaSourceSheet: { visible: boolean; target: GroupMediaTarget };
  pickGroupPhoto: () => void;
  pickCoverPhoto: () => void;
  selectMediaSource: (source: GroupMediaSource) => void;
  selectPreset: (url: string) => void;
  removeGroupPhoto: () => void;
  removeCoverPhoto: () => void;
  closeMediaSourceSheet: () => void;
  resetMedia: () => void;
}

export function useGroupCreateMedia(): GroupCreateMediaResult {
  const haptic = useHaptic();
  const { show } = useToast();
  // Flagship media upload — optimistic preview, client-side compression,
  // camera+gallery source, retry/revert, stale-operation guard.
  const groupMedia = useGroupMediaUpload(null, null);
  // Curated presets are remote URLs; the create API requires an upload
  // receipt, so presets are downloaded and pushed through the upload
  // pipeline before being attached to the create payload.
  const [presetMedia, setPresetMedia] = useState<PresetMediaState | null>(null);
  const [mediaSourceSheet, setMediaSourceSheet] = useState<{ visible: boolean; target: GroupMediaTarget }>({ visible: false, target: 'avatar' });

  const presetAvatar = presetMedia?.target === 'avatar' ? presetMedia : null;
  const presetCover = presetMedia?.target === 'cover' ? presetMedia : null;
  const isUploadingPhoto =
    groupMedia.avatar.status === 'uploading' || presetAvatar?.status === 'uploading';
  const isUploadingCover =
    groupMedia.cover.status === 'uploading' || presetCover?.status === 'uploading';
  const avatarDisplayUri = presetAvatar?.previewUri ?? groupMedia.avatarDisplayUri;
  const coverDisplayUri = presetCover?.previewUri ?? groupMedia.coverDisplayUri;

  const pickGroupPhoto = useCallback(() => {
    if (isUploadingPhoto) return;
    haptic.light();
    setMediaSourceSheet({ visible: true, target: 'avatar' });
  }, [haptic, isUploadingPhoto]);

  const pickCoverPhoto = useCallback(() => {
    if (isUploadingCover) return;
    haptic.light();
    setMediaSourceSheet({ visible: true, target: 'cover' });
  }, [haptic, isUploadingCover]);

  const selectMediaSource = useCallback((source: GroupMediaSource) => {
    const target = mediaSourceSheet.target;
    setPresetMedia(null);
    if (target === 'avatar') {
      void groupMedia.pickAvatar(source);
    } else {
      void groupMedia.pickCover(source);
    }
  }, [mediaSourceSheet.target, groupMedia]);

  const selectPreset = useCallback((url: string) => {
    const target = mediaSourceSheet.target;
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
            : current,
        );
      })
      .catch((err) => {
        setPresetMedia((current) =>
          current?.target === target && current.previewUri === url ? null : current,
        );
        show(parseApiError(err, 'Could not apply that preset.').message, 'error');
      });
  }, [mediaSourceSheet.target, show]);

  const removeGroupPhoto = useCallback(() => {
    haptic.light();
    groupMedia.removeAvatar();
    if (presetMedia?.target === 'avatar') setPresetMedia(null);
  }, [haptic, groupMedia, presetMedia?.target]);

  const removeCoverPhoto = useCallback(() => {
    haptic.light();
    groupMedia.removeCover();
    if (presetMedia?.target === 'cover') setPresetMedia(null);
  }, [haptic, groupMedia, presetMedia?.target]);

  const closeMediaSourceSheet = useCallback(() => {
    setMediaSourceSheet((prev) => ({ ...prev, visible: false }));
  }, []);

  const resetMedia = useCallback(() => {
    setPresetMedia(null);
    groupMedia.removeAvatar();
    groupMedia.removeCover();
  }, [groupMedia]);

  return {
    groupMedia,
    presetAvatar,
    presetCover,
    isUploadingPhoto,
    isUploadingCover,
    avatarDisplayUri,
    coverDisplayUri,
    mediaSourceSheet,
    pickGroupPhoto,
    pickCoverPhoto,
    selectMediaSource,
    selectPreset,
    removeGroupPhoto,
    removeCoverPhoto,
    closeMediaSourceSheet,
    resetMedia,
  };
}
