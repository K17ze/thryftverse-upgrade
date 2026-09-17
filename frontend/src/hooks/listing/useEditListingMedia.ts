import { useState, useCallback, useEffect, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { MediaUploadQueue, type UploadQueueState } from '../../services/mediaUploadQueue';
import {
  convertPickerAsset,
  convertCaptureUri,
  validateMediaAssets,
  type ListingMediaDraftItem,
  type MediaUploadAsset,
} from '../../utils/mediaUploadAsset';
import { hydrateEditListingMedia } from '../../components/listing/editListingViewModels';
import type { ListingApiItem } from '../../services/listingsApi';
import { haptics } from '../../utils/haptics';
import { t } from '../../i18n';

const MAX_MEDIA_COUNT = 10;

/** Project a draft item onto the shape validateMediaAssets diff-checks. */
function toExistingAsset(m: ListingMediaDraftItem) {
  return {
    id: m.id,
    uri: m.uri,
    fileName: m.fileName ?? 'existing',
    mimeType: m.mimeType ?? 'image/jpeg',
    kind: m.kind,
    fileSize: m.fileSize,
    width: m.width,
    height: m.height,
    durationMs: m.durationMs };
}

/**
 * Owns the edit-listing media domain: the stable-ID draft items, the remote
 * attachment manifests (removed ids + order) needed by P0-09 patch semantics,
 * the MediaUploadQueue subscription, the flagship camera sheet, and every
 * picker/reorder/remove/retry/transform handler. Extracted verbatim from
 * EditListingScreen — the queue snapshot dies with the screen and is reset on
 * unmount so a later edit of the same listing starts clean.
 */
export function useEditListingMedia(
  itemId: string,
  setErrorMsg: (msg: string) => void,
) {
  const [mediaItems, setMediaItems] = useState<ListingMediaDraftItem[]>([]);
  // P0-09: Track remote media mutations so removals, reorders and cover
  // changes are detected and persisted. The API needs explicit
  // `attachmentOrder` and `removedAttachmentIds` manifests — without these
  // the patch is a no-op for remote media.
  const [removedRemoteIds, setRemovedRemoteIds] = useState<string[]>([]);
  const [remoteMediaOrder, setRemoteMediaOrder] = useState<string[]>([]);
  const [initialRemoteOrder, setInitialRemoteOrder] = useState<string[]>([]);
  const [cameraSheetVisible, setCameraSheetVisible] = useState(false);

  /* ── upload queue ── */
  const uploadQueueRef = useRef(new MediaUploadQueue());
  const [queueState, setQueueState] = useState<UploadQueueState>(uploadQueueRef.current.getState());
  useEffect(() => {
    const unsub = uploadQueueRef.current.subscribe((s) => setQueueState(s));
    return () => {
      unsub();
      // The snapshot dies with the screen — reset so a later edit of the
      // same listing starts from a clean queue.
      uploadQueueRef.current.reset();
    };
  }, []);

  /* ── hydration ── */
  const hydrate = useCallback((l: ListingApiItem) => {
    const { items, remoteIds } = hydrateEditListingMedia(l, itemId);
    setMediaItems(items);
    setRemoteMediaOrder(remoteIds);
    setInitialRemoteOrder(remoteIds);
    setRemovedRemoteIds([]);
  }, [itemId]);

  /* ── media handling ── */
  const appendPhotoAsset = useCallback((asset: MediaUploadAsset) => {
    setMediaItems((prev) => {
      if (prev.some((m) => m.uri === asset.uri)) return prev;
      const draftItem: ListingMediaDraftItem = {
        id: asset.id,
        uri: asset.uri,
        kind: asset.kind,
        source: 'local',
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
        status: 'draft' };
      return [...prev, draftItem].slice(0, MAX_MEDIA_COUNT);
    });
  }, []);

  const handlePickFromLibrary = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMsg(t('listing.edit.allowGallery'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        allowsEditing: false,
        quality: 0.9 });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const assets = result.assets.map(convertPickerAsset);
        const existing = mediaItems.map(toExistingAsset);
        const validation = validateMediaAssets(assets, existing, { maxTotalCount: MAX_MEDIA_COUNT });

        if (validation.errors.length > 0) {
          const skipped = validation.errors.map((e) => e.message).join('. ');
          if (skipped) setErrorMsg(skipped);
        }

        for (const asset of validation.assets) {
          appendPhotoAsset(asset);
        }
        if (validation.assets.length > 0) {
          haptics.success();
        }
      }
    } catch {
      setErrorMsg(t('listing.edit.couldNotOpenLibrary'));
    }
  }, [appendPhotoAsset, mediaItems, setErrorMsg]);

  const handlePickFromCamera = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setErrorMsg(t('listing.edit.allowCamera'));
        return;
      }
      setCameraSheetVisible(true);
    } catch {
      setErrorMsg(t('listing.edit.couldNotOpenCamera'));
    }
  }, [setErrorMsg]);

  const handleCameraCapture = useCallback((uris: string[]) => {
    if (uris.length === 0) return;
    const assets = uris.map(convertCaptureUri);
    const existing = mediaItems.map(toExistingAsset);
    const validation = validateMediaAssets(assets, existing, { maxTotalCount: MAX_MEDIA_COUNT });
    if (validation.errors.length > 0) {
      setErrorMsg(validation.errors.map((e) => e.message).join('. '));
    }
    for (const a of validation.assets) {
      appendPhotoAsset(a);
    }
    if (validation.assets.length > 0) {
      haptics.success();
    }
    setCameraSheetVisible(false);
  }, [appendPhotoAsset, mediaItems, setErrorMsg]);

  const handleRemoveItem = useCallback((id: string) => {
    const item = mediaItems.find((m) => m.id === id);
    if (!item) return;
    haptics.tap();
    if (item.source === 'remote') {
      const remoteId = item.mediaId ?? item.id;
      setRemovedRemoteIds((prev) => prev.includes(remoteId) ? prev : [...prev, remoteId]);
      setRemoteMediaOrder((prev) => prev.filter((rid) => rid !== remoteId));
    } else {
      uploadQueueRef.current.removeItem(id);
    }
    setMediaItems((prev) => prev.filter((m) => m.id !== id));
  }, [mediaItems]);

  const handleRetryItem = useCallback((id: string) => {
    const queue = uploadQueueRef.current;
    const ok = queue.retryItem(id);
    if (ok) {
      setMediaItems((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, status: 'pending', error: undefined } : m
        )
      );
      haptics.tap();
    } else {
      haptics.warning();
    }
  }, []);

  const handleReorder = useCallback((newOrderedIds: string[]) => {
    const itemMap = new Map(mediaItems.map((m) => [m.id, m]));
    const next = newOrderedIds.map((id) => itemMap.get(id)).filter(Boolean) as ListingMediaDraftItem[];
    setMediaItems(next);
    setRemoteMediaOrder(next.filter((m) => m.source === 'remote').map((m) => m.mediaId ?? m.id));
    haptics.tap();
  }, [mediaItems]);

  const canRemoveItem = useCallback((id: string) => {
    const item = mediaItems.find((m) => m.id === id);
    return !!item;
  }, [mediaItems]);

  // Transform item (crop/rotate/flip): a same-URI call is a focal-only
  // update — store the point without resetting upload state. Only a real
  // URI replacement re-queues the item.
  const handleTransformItem = useCallback((id: string, transformedUri: string, focalPoint?: { x: number; y: number }) => {
    setMediaItems((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const uriChanged = transformedUri !== m.uri;
        return {
          ...m,
          ...(uriChanged ? { uri: transformedUri, publicUrl: undefined, status: 'draft' as const } : {}),
          ...(focalPoint ? { focalPoint } : {}) };
      })
    );
  }, []);

  return {
    mediaItems,
    setMediaItems,
    removedRemoteIds,
    remoteMediaOrder,
    initialRemoteOrder,
    uploadQueueRef,
    queueState,
    cameraSheetVisible,
    setCameraSheetVisible,
    hydrate,
    handlePickFromLibrary,
    handlePickFromCamera,
    handleCameraCapture,
    handleRemoveItem,
    handleRetryItem,
    handleReorder,
    canRemoveItem,
    handleTransformItem };
}
