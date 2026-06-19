import { useState, useCallback, useRef, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { MediaUploadAsset, convertPickerAsset, validateMediaAssets } from '../utils/mediaUploadAsset';
import { uploadMedia } from '../services/mediaUpload';
import { updateMyProfile } from '../services/profileApi';
import { persistProfileMediaUri } from '../utils/profileMediaAsset';
import {
  setStoredUserAvatar,
  setStoredUserAvatarForUser,
  setStoredUserCover,
  setStoredUserCoverForUser,
} from '../preferences/profileMediaPreferences';

export type ProfileMediaType = 'avatar' | 'cover';

export interface ProfileMediaState {
  confirmedRemote: string | null;
  pendingLocal: string | null;
  status: 'idle' | 'uploading' | 'failed' | 'confirmed';
  error: string | null;
}

export interface ProfileMediaUploadResult {
  avatar: ProfileMediaState;
  cover: ProfileMediaState;
  pickAvatar: () => Promise<void>;
  pickCover: () => Promise<void>;
  retryAvatar: () => Promise<void>;
  retryCover: () => Promise<void>;
  revertAvatar: () => void;
  revertCover: () => void;
  hasUnsavedMedia: boolean;
}

export function useProfileMediaUpload(
  userId: string | undefined,
  currentAvatarRemote: string | null,
  currentCoverRemote: string | null,
  onAvatarConfirmed: (url: string) => void,
  onCoverConfirmed: (url: string) => void
): ProfileMediaUploadResult {
  const [avatar, setAvatar] = useState<ProfileMediaState>({
    confirmedRemote: currentAvatarRemote,
    pendingLocal: null,
    status: 'idle',
    error: null,
  });

  const [cover, setCover] = useState<ProfileMediaState>({
    confirmedRemote: currentCoverRemote,
    pendingLocal: null,
    status: 'idle',
    error: null,
  });

  const pendingAssetRef = useRef<{ avatar?: MediaUploadAsset; cover?: MediaUploadAsset }>({});
  const opIdRef = useRef(0);

  // Sync external remote URLs when no local operation is active
  useEffect(() => {
    if (avatar.status === 'idle' || avatar.status === 'confirmed') {
      setAvatar((prev) => (prev.confirmedRemote === currentAvatarRemote ? prev : { ...prev, confirmedRemote: currentAvatarRemote }));
    }
  }, [currentAvatarRemote, avatar.status]);

  useEffect(() => {
    if (cover.status === 'idle' || cover.status === 'confirmed') {
      setCover((prev) => (prev.confirmedRemote === currentCoverRemote ? prev : { ...prev, confirmedRemote: currentCoverRemote }));
    }
  }, [currentCoverRemote, cover.status]);

  const updateAvatarState = useCallback((patch: Partial<ProfileMediaState>) => {
    setAvatar((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateCoverState = useCallback((patch: Partial<ProfileMediaState>) => {
    setCover((prev) => ({ ...prev, ...patch }));
  }, []);

  const performUpload = useCallback(async (
    type: ProfileMediaType,
    asset: MediaUploadAsset,
    localUri: string,
    opId: number
  ): Promise<void> => {
    const updateState = type === 'avatar' ? updateAvatarState : updateCoverState;
    const onConfirmed = type === 'avatar' ? onAvatarConfirmed : onCoverConfirmed;
    const persistForUser = type === 'avatar'
      ? (url: string) => userId ? setStoredUserAvatarForUser(userId, url) : Promise.resolve()
      : (url: string) => userId ? setStoredUserCoverForUser(userId, url) : Promise.resolve();
    const persistGlobal = type === 'avatar' ? setStoredUserAvatar : setStoredUserCover;

    updateState({ status: 'uploading', error: null });

    try {
      const publicUrl = await uploadMedia(asset, type === 'avatar' ? 'avatars' : 'covers');
      await updateMyProfile(type === 'avatar' ? { avatar: publicUrl } : { coverPhoto: publicUrl });

      // Guard against stale operation
      if (opId !== opIdRef.current) return;

      onConfirmed(publicUrl);
      await Promise.all([
        persistGlobal(publicUrl),
        persistForUser(publicUrl),
      ]).catch(() => {});

      updateState({
        confirmedRemote: publicUrl,
        pendingLocal: null,
        status: 'confirmed',
        error: null,
      });
      pendingAssetRef.current[type] = undefined;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      updateState({ status: 'failed', error: message });
    }
  }, [updateAvatarState, updateCoverState, onAvatarConfirmed, onCoverConfirmed, userId]);

  const pickMedia = useCallback(async (type: ProfileMediaType): Promise<void> => {
    const isAvatar = type === 'avatar';
    const updateState = isAvatar ? updateAvatarState : updateCoverState;
    const previousRemote = isAvatar ? avatar.confirmedRemote : cover.confirmedRemote;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, // cover video not genuinely supported end-to-end
        allowsEditing: true,
        aspect: isAvatar ? [1, 1] : [3, 1],
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.[0]) return;

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const rawAsset = result.assets[0];
      const asset = convertPickerAsset(rawAsset);

      // Validate single asset conservatively
      const validation = validateMediaAssets([asset], [], {
        maxTotalCount: 1,
        maxImageSizeBytes: 20 * 1024 * 1024,
        maxVideoSizeBytes: 100 * 1024 * 1024,
      });

      if (!validation.valid) {
        const firstError = validation.errors[0];
        updateState({ status: 'failed', error: firstError?.message || 'Invalid media' });
        return;
      }

      const localUri = await persistProfileMediaUri(asset.uri, type);
      pendingAssetRef.current[type] = asset;
      const opId = ++opIdRef.current;

      updateState({
        pendingLocal: localUri,
        confirmedRemote: previousRemote,
        status: 'uploading',
        error: null,
      });

      await performUpload(type, asset, localUri, opId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not select photo';
      updateState({ status: 'failed', error: message });
    }
  }, [updateAvatarState, updateCoverState, performUpload, avatar.confirmedRemote, cover.confirmedRemote]);

  const retryMedia = useCallback(async (type: ProfileMediaType): Promise<void> => {
    const pending = pendingAssetRef.current[type];
    if (!pending) {
      const updateState = type === 'avatar' ? updateAvatarState : updateCoverState;
      updateState({ status: 'failed', error: 'No pending upload to retry' });
      return;
    }
    const localUri = pending.uri; // retry with original picked URI
    const opId = ++opIdRef.current;
    await performUpload(type, pending, localUri, opId);
  }, [performUpload, updateAvatarState, updateCoverState]);

  const revertMedia = useCallback((type: ProfileMediaType): void => {
    const previousRemote = type === 'avatar' ? avatar.confirmedRemote : cover.confirmedRemote;
    const updateState = type === 'avatar' ? updateAvatarState : updateCoverState;
    const onConfirmed = type === 'avatar' ? onAvatarConfirmed : onCoverConfirmed;

    pendingAssetRef.current[type] = undefined;
    if (previousRemote) onConfirmed(previousRemote);
    updateState({
      pendingLocal: null,
      status: 'idle',
      error: null,
    });
  }, [avatar.confirmedRemote, cover.confirmedRemote, updateAvatarState, updateCoverState, onAvatarConfirmed, onCoverConfirmed]);

  const hasUnsavedMedia = Boolean(avatar.pendingLocal) || Boolean(cover.pendingLocal);

  return {
    avatar,
    cover,
    pickAvatar: () => pickMedia('avatar'),
    pickCover: () => pickMedia('cover'),
    retryAvatar: () => retryMedia('avatar'),
    retryCover: () => retryMedia('cover'),
    revertAvatar: () => revertMedia('avatar'),
    revertCover: () => revertMedia('cover'),
    hasUnsavedMedia,
  };
}
