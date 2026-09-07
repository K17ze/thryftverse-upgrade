import { useState, useCallback, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useHaptic } from './useHaptic';
import {
  MediaUploadAsset,
  convertPickerAsset,
  validateMediaAssets,
} from '../utils/mediaUploadAsset';
import { uploadMedia } from '../services/mediaUpload';
import { resizeForUpload, type ResizePresetName } from '../platform/media/mediaTransforms';
import { parseApiError } from '../lib/apiClient';

export type GroupMediaType = 'avatar' | 'cover';

export interface GroupMediaState {
  /** The confirmed remote URL — what the server has stored. */
  confirmedRemote: string | null;
  /** The local picked URI shown optimistically while uploading. */
  pendingLocal: string | null;
  /** Upload finalization ID — required by the group create/edit API. */
  finalizationId: string | null;
  status: 'idle' | 'uploading' | 'failed' | 'confirmed';
  error: string | null;
}

export interface GroupMediaUploadResult {
  avatar: GroupMediaState;
  cover: GroupMediaState;
  /** Effective display URI — pendingLocal takes priority over confirmedRemote. */
  avatarDisplayUri: string | null;
  coverDisplayUri: string | null;
  pickAvatar: (source: 'gallery' | 'camera') => Promise<void>;
  pickCover: (source: 'gallery' | 'camera') => Promise<void>;
  retryAvatar: () => Promise<void>;
  retryCover: () => Promise<void>;
  revertAvatar: () => void;
  revertCover: () => void;
  removeAvatar: () => void;
  removeCover: () => void;
  setAvatarUrl: (url: string) => void;
  setCoverUrl: (url: string) => void;
  /** True when either media type has a pending local pick not yet confirmed. */
  hasPendingUpload: boolean;
}

const AVATAR_PRESET: ResizePresetName = 'avatar';
const COVER_PRESET: ResizePresetName = 'cover';

function initialState(remoteUrl: string | null): GroupMediaState {
  return {
    confirmedRemote: remoteUrl,
    pendingLocal: null,
    finalizationId: null,
    status: 'idle',
    error: null,
  };
}

export function useGroupMediaUpload(
  currentAvatarRemote: string | null,
  currentCoverRemote: string | null,
): GroupMediaUploadResult {
  const haptic = useHaptic();
  const [avatar, setAvatar] = useState<GroupMediaState>(() => initialState(currentAvatarRemote));
  const [cover, setCover] = useState<GroupMediaState>(() => initialState(currentCoverRemote));

  // Stale-operation guard — prevents a slow first upload from overwriting a fast second pick.
  const avatarOpIdRef = useRef(0);
  const coverOpIdRef = useRef(0);
  // Retain the picked asset for retry-without-re-pick.
  const pendingAssetRef = useRef<{ avatar?: MediaUploadAsset; cover?: MediaUploadAsset }>({});

  const updateAvatar = useCallback((patch: Partial<GroupMediaState>) => {
    setAvatar((prev) => ({ ...prev, ...patch }));
  }, []);
  const updateCover = useCallback((patch: Partial<GroupMediaState>) => {
    setCover((prev) => ({ ...prev, ...patch }));
  }, []);

  /**
   * Core upload routine: resize → uploadMedia → store finalizationId.
   * The local URI is already shown optimistically by the caller.
   */
  const performUpload = useCallback(async (
    type: GroupMediaType,
    asset: MediaUploadAsset,
    opId: number,
  ): Promise<void> => {
    const updateState = type === 'avatar' ? updateAvatar : updateCover;
    const opIdRef = type === 'avatar' ? avatarOpIdRef : coverOpIdRef;
    const preset = type === 'avatar' ? AVATAR_PRESET : COVER_PRESET;

    updateState({ status: 'uploading', error: null });

    try {
      // Client-side resize/compress before upload — reduces payload from
      // multi-MB to ~100-200KB, cutting upload time on cellular by 5-10×.
      // Backend Sharp still does final normalization + derivatives.
      const resized = await resizeForUpload(asset.uri, preset);
      const uploaded = await uploadMedia(resized.uri, type === 'avatar' ? 'avatars' : 'covers');

      // Stale guard — user may have picked again while we were uploading.
      if (opId !== opIdRef.current) return;

      updateState({
        confirmedRemote: uploaded.publicUrl,
        pendingLocal: null,
        finalizationId: uploaded.finalizationId,
        status: 'confirmed',
        error: null,
      });
      pendingAssetRef.current[type] = undefined;
      haptic.success();
    } catch (err: unknown) {
      if (opId !== opIdRef.current) return;
      const parsed = parseApiError(err, `Could not upload group ${type}.`);
      const message =
        parsed.status === 401
          ? 'Sign in again to upload photos'
          : parsed.isNetworkError
            ? 'Upload service is unreachable'
            : parsed.message;
      updateState({ status: 'failed', error: message });
    }
  }, [updateAvatar, updateCover, haptic]);

  /**
   * Launch the picker (gallery or camera), validate, resize for preview,
   * set optimistic local URI, then kick off the upload in the background.
   */
  const pickMedia = useCallback(async (
    type: GroupMediaType,
    source: 'gallery' | 'camera',
  ): Promise<void> => {
    const isAvatar = type === 'avatar';
    const updateState = isAvatar ? updateAvatar : updateCover;
    const aspect = isAvatar ? [1, 1] as [number, number] : [3, 1] as [number, number];
    const opIdRef = isAvatar ? avatarOpIdRef : coverOpIdRef;

    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          updateState({ status: 'failed', error: 'Camera permission denied' });
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect,
          quality: 0.9,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: false,
          allowsEditing: true,
          aspect,
          quality: 0.9,
        });
      }

      if (result.canceled || !result.assets?.[0]?.uri) return;

      haptic.medium();
      const rawAsset = result.assets[0];
      const asset = convertPickerAsset(rawAsset);

      // Validate — reject oversized or undersized images before upload.
      const validation = validateMediaAssets([asset], [], {
        maxTotalCount: 1,
        maxImageSizeBytes: 20 * 1024 * 1024,
      });
      if (!validation.valid) {
        updateState({ status: 'failed', error: validation.errors[0]?.message ?? 'Invalid image' });
        return;
      }

      pendingAssetRef.current[type] = asset;
      const opId = ++opIdRef.current;

      // Optimistic preview — show the local URI instantly.
      updateState({
        pendingLocal: asset.uri,
        status: 'uploading',
        error: null,
      });

      await performUpload(type, asset, opId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not select photo';
      updateState({ status: 'failed', error: message });
    }
  }, [updateAvatar, updateCover, performUpload, haptic]);

  const retryMedia = useCallback(async (type: GroupMediaType): Promise<void> => {
    const pending = pendingAssetRef.current[type];
    if (!pending) {
      const updateState = type === 'avatar' ? updateAvatar : updateCover;
      updateState({ status: 'failed', error: 'No pending upload to retry' });
      return;
    }
    const opIdRef = type === 'avatar' ? avatarOpIdRef : coverOpIdRef;
    const opId = ++opIdRef.current;
    await performUpload(type, pending, opId);
  }, [performUpload, updateAvatar, updateCover]);

  const revertMedia = useCallback((type: GroupMediaType): void => {
    const updateState = type === 'avatar' ? updateAvatar : updateCover;
    pendingAssetRef.current[type] = undefined;
    updateState({
      pendingLocal: null,
      status: 'idle',
      error: null,
    });
  }, [updateAvatar, updateCover]);

  const removeMedia = useCallback((type: GroupMediaType): void => {
    const updateState = type === 'avatar' ? updateAvatar : updateCover;
    pendingAssetRef.current[type] = undefined;
    haptic.light();
    updateState({
      confirmedRemote: null,
      pendingLocal: null,
      finalizationId: null,
      status: 'idle',
      error: null,
    });
  }, [updateAvatar, updateCover, haptic]);

  const setMediaUrl = useCallback((type: GroupMediaType, url: string): void => {
    const updateState = type === 'avatar' ? updateAvatar : updateCover;
    pendingAssetRef.current[type] = undefined;
    haptic.selection();
    updateState({
      confirmedRemote: url,
      pendingLocal: null,
      finalizationId: null,
      status: 'confirmed',
      error: null,
    });
  }, [updateAvatar, updateCover, haptic]);

  const avatarDisplayUri = avatar.pendingLocal ?? avatar.confirmedRemote;
  const coverDisplayUri = cover.pendingLocal ?? cover.confirmedRemote;
  const hasPendingUpload = avatar.status === 'uploading' || cover.status === 'uploading';

  return {
    avatar,
    cover,
    avatarDisplayUri,
    coverDisplayUri,
    pickAvatar: (source) => pickMedia('avatar', source),
    pickCover: (source) => pickMedia('cover', source),
    retryAvatar: () => retryMedia('avatar'),
    retryCover: () => retryMedia('cover'),
    revertAvatar: () => revertMedia('avatar'),
    revertCover: () => revertMedia('cover'),
    removeAvatar: () => removeMedia('avatar'),
    removeCover: () => removeMedia('cover'),
    setAvatarUrl: (url: string) => setMediaUrl('avatar', url),
    setCoverUrl: (url: string) => setMediaUrl('cover', url),
    hasPendingUpload,
  };
}
