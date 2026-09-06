import { useState, useCallback, useRef, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useHaptic } from './useHaptic';
import { MediaUploadAsset, convertPickerAsset, validateMediaAssets } from '../utils/mediaUploadAsset';
import { uploadMedia } from '../services/mediaUpload';
import { updateMyProfile } from '../services/profileApi';
import { persistProfileMediaUri } from '../utils/profileMediaAsset';
import { parseApiError } from '../lib/apiClient';
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
  status: 'idle' | 'pending' | 'uploading' | 'failed' | 'confirmed';
  error: string | null;
  /** Real byte progress (0-1) while status is 'uploading'. */
  progress?: number;
}

export interface PendingMediaUpdate {
  avatarAssetId?: string;
  coverAssetId?: string;
}

export interface ProfileMediaUploadResult {
  avatar: ProfileMediaState;
  cover: ProfileMediaState;
  pickAvatar: () => Promise<void>;
  pickCover: () => Promise<void>;
  retryAvatar: () => Promise<boolean>;
  retryCover: () => Promise<boolean>;
  revertAvatar: () => void;
  revertCover: () => void;
  commitMedia: () => Promise<PendingMediaUpdate>;
  clearCommittedMedia: () => void;
  hasUnsavedMedia: boolean;
}

interface PendingAssetEntry {
  asset: MediaUploadAsset;
  localUri: string;
}

export function useProfileMediaUpload(
  userId: string | undefined,
  currentAvatarRemote: string | null,
  currentCoverRemote: string | null,
  /** Legacy callbacks — when provided, uploads patch the profile immediately
   *  (backward compat for MyProfileScreen). When omitted, the new save-flow
   *  is used: upload happens on Save via commitMedia(). */
  onAvatarConfirmed?: (url: string) => void,
  onCoverConfirmed?: (url: string) => void,
): ProfileMediaUploadResult {
  const haptic = useHaptic();
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

  /** Asset IDs from successful standalone retries — included in the next save. */
  const [committedAssets, setCommittedAssets] = useState<{ avatar?: string; cover?: string }>({});

  const pendingAssetRef = useRef<{ avatar?: PendingAssetEntry; cover?: PendingAssetEntry }>({});
  const avatarOpIdRef = useRef(0);
  const coverOpIdRef = useRef(0);
  /** Last progress state-write per media type — XHR ticks far exceed render rate. */
  const lastProgressTickRef = useRef<{ avatar?: number; cover?: number }>({});
  /** In-flight upload abort controllers, keyed by media type (opId-guard companion). */
  const abortControllersRef = useRef<{ avatar?: AbortController; cover?: AbortController }>({});

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

  /** Abort any in-flight upload for a media type — superseded by a new pick or revert. */
  const abortInFlight = useCallback((type: ProfileMediaType): void => {
    abortControllersRef.current[type]?.abort();
    delete abortControllersRef.current[type];
  }, []);

  /** Best-effort deletion of a persisted local file to avoid leaking disk space. */
  const deleteLocalFile = useCallback(async (uri: string): Promise<void> => {
    try {
      const docDir = FileSystem.documentDirectory;
      if (docDir && uri.startsWith(`${docDir}profile-media/`)) {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        }
      }
    } catch {
      // Best-effort cleanup — don't block the flow
    }
  }, []);

  /**
   * Uploads the file to storage and returns the asset ID + public URL.
   *
   * New flow (no callbacks): does NOT call updateMyProfile — the caller is
   * responsible for patching the profile with the returned asset ID during
   * the save flow via commitMedia().
   *
   * Legacy flow (callbacks provided): patches the profile immediately with
   * avatarAssetId/coverAssetId and calls the callback with the public URL.
   */
  const performUpload = useCallback(async (
    type: ProfileMediaType,
    entry: PendingAssetEntry,
    opId: number
  ): Promise<{ assetId: string; publicUrl: string } | null> => {
    const updateState = type === 'avatar' ? updateAvatarState : updateCoverState;
    const opIdRef = type === 'avatar' ? avatarOpIdRef : coverOpIdRef;
    const onConfirmed = type === 'avatar' ? onAvatarConfirmed : onCoverConfirmed;
    const useLegacyPatch = Boolean(onConfirmed);

    // A new invocation supersedes any in-flight upload for this type.
    abortInFlight(type);
    const controller = new AbortController();
    abortControllersRef.current[type] = controller;

    updateState({ status: 'uploading', error: null, progress: 0 });

    try {
      // Use the persisted localUri, not the original picker temp URI (P0-4)
      const uploaded = await uploadMedia(entry.localUri, type === 'avatar' ? 'avatars' : 'covers', {
        signal: controller.signal,
        onProgress: (loadedBytes, totalBytes) => {
          if (opId !== opIdRef.current) return;
          const finished = totalBytes > 0 && loadedBytes >= totalBytes;
          const now = Date.now();
          if (!finished && now - (lastProgressTickRef.current[type] ?? 0) < 100) return;
          lastProgressTickRef.current[type] = now;
          updateState({ progress: totalBytes > 0 ? Math.min(1, loadedBytes / totalBytes) : 0 });
        },
      });

      // Guard against stale operation — revert or new pick cancelled this upload.
      // The request already finished; discard the result without aborting.
      if (opId !== opIdRef.current) return null;

      const assetId = uploaded.mediaAssetId;
      if (!assetId) {
        throw new Error('Upload did not return a media asset ID');
      }

      // Legacy flow: patch profile immediately with asset ID (P0-5) and call callback
      if (useLegacyPatch) {
        await updateMyProfile(
          type === 'avatar' ? { avatarAssetId: assetId } : { coverAssetId: assetId }
        );
        if (opId !== opIdRef.current) return null;
        onConfirmed!(uploaded.publicUrl);
      }

      updateState({
        confirmedRemote: uploaded.publicUrl,
        pendingLocal: null,
        status: 'confirmed',
        error: null,
        progress: 1,
      });
      pendingAssetRef.current[type] = undefined;

      // Track the committed asset ID for the new save flow (P0-5: use asset ID, not URL)
      if (!useLegacyPatch) {
        setCommittedAssets((prev) => ({ ...prev, [type]: assetId }));
      }

      // Persist for offline use
      const persistGlobal = type === 'avatar' ? setStoredUserAvatar : setStoredUserCover;
      const persistForUser = type === 'avatar'
        ? (url: string) => userId ? setStoredUserAvatarForUser(userId, url) : Promise.resolve()
        : (url: string) => userId ? setStoredUserCoverForUser(userId, url) : Promise.resolve();
      await Promise.all([persistGlobal(uploaded.publicUrl), persistForUser(uploaded.publicUrl)]).catch(() => {});

      return { assetId, publicUrl: uploaded.publicUrl };
    } catch (err: unknown) {
      // Stale operation — don't update state, silently ignore
      if (opId !== opIdRef.current) return null;

      const parsed = parseApiError(err, 'Profile media could not be uploaded');
      const message =
        parsed.status === 401
          ? 'Sign in again to upload profile media'
          : parsed.isNetworkError
            ? 'Upload service is unreachable'
            : parsed.message;
      updateState({ status: 'failed', error: message });
      throw err;
    } finally {
      if (abortControllersRef.current[type] === controller) {
        delete abortControllersRef.current[type];
      }
    }
  }, [updateAvatarState, updateCoverState, userId, onAvatarConfirmed, onCoverConfirmed, abortInFlight]);

  const pickMedia = useCallback(async (type: ProfileMediaType): Promise<void> => {
    const isAvatar = type === 'avatar';
    const updateState = isAvatar ? updateAvatarState : updateCoverState;
    const previousRemote = isAvatar ? avatar.confirmedRemote : cover.confirmedRemote;
    const onConfirmed = isAvatar ? onAvatarConfirmed : onCoverConfirmed;
    const useLegacyFlow = Boolean(onConfirmed);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], // cover video is not genuinely supported end-to-end
        allowsEditing: true,
        aspect: isAvatar ? [1, 1] : [3, 1],
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.[0]) return;

      haptic.medium();
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

      // A new pick supersedes any in-flight upload for this media type.
      // Invalidate the old op BEFORE aborting so the aborted upload's
      // AbortError always lands on its stale guard, never on 'failed'.
      const opIdRef = type === 'avatar' ? avatarOpIdRef : coverOpIdRef;
      opIdRef.current++;
      abortInFlight(type);

      // Clean up previous local file before overwriting (P1-12)
      const previousEntry = pendingAssetRef.current[type];
      if (previousEntry) {
        await deleteLocalFile(previousEntry.localUri);
      }

      const localUri = await persistProfileMediaUri(asset.uri, type);
      pendingAssetRef.current[type] = { asset, localUri };

      // Clear any previously committed asset ID for this type
      setCommittedAssets((prev) => ({ ...prev, [type]: undefined }));

      if (useLegacyFlow) {
        // Legacy: upload immediately on pick
        const opId = ++opIdRef.current;
        updateState({
          pendingLocal: localUri,
          confirmedRemote: previousRemote,
          status: 'uploading',
          error: null,
          progress: undefined,
        });
        await performUpload(type, { asset, localUri }, opId);
      } else {
        // New flow: show local preview immediately, upload happens on Save (P0-2)
        updateState({
          pendingLocal: localUri,
          confirmedRemote: previousRemote,
          status: 'pending',
          error: null,
          progress: undefined,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not select photo';
      updateState({ status: 'failed', error: message });
    }
  }, [updateAvatarState, updateCoverState, avatar.confirmedRemote, cover.confirmedRemote, haptic, deleteLocalFile, onAvatarConfirmed, onCoverConfirmed, performUpload, abortInFlight]);

  const retryMedia = useCallback(async (type: ProfileMediaType): Promise<boolean> => {
    const pending = pendingAssetRef.current[type];
    if (!pending) {
      const updateState = type === 'avatar' ? updateAvatarState : updateCoverState;
      updateState({ status: 'failed', error: 'No pending upload to retry' });
      return false;
    }
    const opIdRef = type === 'avatar' ? avatarOpIdRef : coverOpIdRef;
    const opId = ++opIdRef.current;
    try {
      await performUpload(type, pending, opId);
      return true;
    } catch {
      return false;
    }
  }, [performUpload, updateAvatarState, updateCoverState]);

  const revertMedia = useCallback((type: ProfileMediaType): void => {
    // Cancel any in-flight upload by incrementing the op ID (P0-3)
    const opIdRef = type === 'avatar' ? avatarOpIdRef : coverOpIdRef;
    opIdRef.current++;
    abortInFlight(type);

    const updateState = type === 'avatar' ? updateAvatarState : updateCoverState;
    const previousRemote = type === 'avatar' ? avatar.confirmedRemote : cover.confirmedRemote;
    const onConfirmed = type === 'avatar' ? onAvatarConfirmed : onCoverConfirmed;

    // Clean up local file
    const entry = pendingAssetRef.current[type];
    if (entry) {
      void deleteLocalFile(entry.localUri);
    }
    pendingAssetRef.current[type] = undefined;

    // Clear committed asset ID for this type
    setCommittedAssets((prev) => ({ ...prev, [type]: undefined }));

    // Legacy flow: restore the previous remote URL via callback
    if (onConfirmed && previousRemote) {
      onConfirmed(previousRemote);
    }

    updateState({
      pendingLocal: null,
      confirmedRemote: previousRemote,
      status: 'idle',
      error: null,
      progress: undefined,
    });
  }, [avatar.confirmedRemote, cover.confirmedRemote, updateAvatarState, updateCoverState, deleteLocalFile, onAvatarConfirmed, onCoverConfirmed, abortInFlight]);

  /**
   * Uploads all pending media and returns asset IDs for the profile patch.
   * Called by the screen's handleSave before updateMyProfile.
   * Throws if any upload fails (error state is already set per-media).
   */
  const commitMedia = useCallback(async (): Promise<PendingMediaUpdate> => {
    const result: PendingMediaUpdate = {};
    const errors: string[] = [];
    const tasks: Promise<void>[] = [];

    const avatarEntry = pendingAssetRef.current.avatar;
    if (avatarEntry && avatar.pendingLocal) {
      const opId = ++avatarOpIdRef.current;
      tasks.push(
        performUpload('avatar', avatarEntry, opId)
          .then((r) => { if (r?.assetId) result.avatarAssetId = r.assetId; })
          .catch((err) => { errors.push(err instanceof Error ? err.message : 'Avatar upload failed'); })
      );
    }

    const coverEntry = pendingAssetRef.current.cover;
    if (coverEntry && cover.pendingLocal) {
      const opId = ++coverOpIdRef.current;
      tasks.push(
        performUpload('cover', coverEntry, opId)
          .then((r) => { if (r?.assetId) result.coverAssetId = r.assetId; })
          .catch((err) => { errors.push(err instanceof Error ? err.message : 'Cover upload failed'); })
      );
    }

    await Promise.all(tasks);

    // Include asset IDs from successful standalone retries
    if (!result.avatarAssetId && committedAssets.avatar) {
      result.avatarAssetId = committedAssets.avatar;
    }
    if (!result.coverAssetId && committedAssets.cover) {
      result.coverAssetId = committedAssets.cover;
    }

    if (errors.length > 0) {
      throw new Error(errors[0]);
    }

    return result;
  }, [performUpload, avatar.pendingLocal, cover.pendingLocal, committedAssets]);

  const clearCommittedMedia = useCallback(() => {
    setCommittedAssets({});
  }, []);

  const hasUnsavedMedia =
    Boolean(avatar.pendingLocal) ||
    Boolean(cover.pendingLocal) ||
    Boolean(committedAssets.avatar) ||
    Boolean(committedAssets.cover);

  return {
    avatar,
    cover,
    pickAvatar: () => pickMedia('avatar'),
    pickCover: () => pickMedia('cover'),
    retryAvatar: () => retryMedia('avatar'),
    retryCover: () => retryMedia('cover'),
    revertAvatar: () => revertMedia('avatar'),
    revertCover: () => revertMedia('cover'),
    commitMedia,
    clearCommittedMedia,
    hasUnsavedMedia,
  };
}
