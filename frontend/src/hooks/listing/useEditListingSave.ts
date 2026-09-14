import { useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../platform/server/queryKeys';
import { useToast } from '../../context/ToastContext';
import { useBackendData } from '../../context/BackendDataContext';
import { patchListingOnApi, createListingImageOnApi } from '../../services/listingsApi';
import type { MediaUploadQueue } from '../../services/mediaUploadQueue';
import type { ListingMediaDraftItem } from '../../utils/mediaUploadAsset';
import { sanitizeDecimalInput } from '../../utils/currencyAuthoringFlows';
import { haptics } from '../../utils/haptics';
import { useStore } from '../../store/useStore';
import {
  buildEditAttachmentManifest,
  type EditListingFieldValues,
  type EditListingSaveStage,
} from '../../components/listing/editListingViewModels';
import { t } from '../../i18n';

interface UseEditListingSaveParams {
  itemId: string;
  isOwner: boolean;
  values: EditListingFieldValues;
  mediaItems: ListingMediaDraftItem[];
  removedRemoteIds: string[];
  uploadQueueRef: React.MutableRefObject<MediaUploadQueue>;
  setMediaItems: React.Dispatch<React.SetStateAction<ListingMediaDraftItem[]>>;
  setErrorMsg: (msg: string) => void;
  validate: () => string;
}

/**
 * Owns the edit-listing save pipeline: validate → upload new local media via
 * the queue → attach uploads with deterministic ids → build the attachment
 * manifest → patch listing metadata → invalidate caches → navigate back.
 * Manages `isSaving`/`saveStage` so the footer can render the staged
 * progress. Extracted verbatim from EditListingScreen's handleSave.
 */
export function useEditListingSave({
  itemId,
  isOwner,
  values,
  mediaItems,
  removedRemoteIds,
  uploadQueueRef,
  setMediaItems,
  setErrorMsg,
  validate,
}: UseEditListingSaveParams) {
  const navigation = useNavigation<any>();
  const { show: showToast } = useToast();
  const queryClient = useQueryClient();
  const { refreshListings } = useBackendData();
  const currentUser = useStore((s) => s.currentUser);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStage, setSaveStage] = useState<EditListingSaveStage>('idle');

  const { title, description, price, originalPrice, category, brand, size, condition, shippingMethod, shippingPayer } = values;

  const handleSave = useCallback(async () => {
    const error = validate();
    if (error) {
      setErrorMsg(error);
      setSaveStage('failed_recoverable');
      haptics.error();
      return;
    }
    if (!isOwner) {
      setErrorMsg(t('listing.edit.noPermission'));
      setSaveStage('failed_recoverable');
      return;
    }
    setErrorMsg('');
    setIsSaving(true);

    try {
      const existingRemotePhotos = mediaItems.filter((m) => m.source === 'remote').map((m) => m.publicUrl || m.uri);
      const newLocalItems = mediaItems.filter((m) => m.source === 'local');
      let queueItems: ReturnType<MediaUploadQueue['getItems']> = [];

      // 1. Upload new local media via queue (if any)
      if (newLocalItems.length > 0) {
        setSaveStage('uploading_media');
        const queue = uploadQueueRef.current;
        const assets = newLocalItems.map((m) => ({
          id: m.id,
          uri: m.uri,
          fileName: m.fileName ?? m.uri.split('/').pop() ?? 'photo.jpg',
          mimeType: m.mimeType ?? 'image/jpeg',
          kind: m.kind,
          fileSize: m.fileSize,
          width: m.width,
          height: m.height,
          durationMs: m.durationMs }));
        await queue.addAssets(assets);
        await queue.run();
        queueItems = queue.getItems();
        setMediaItems((prev) =>
          prev.map((m) => {
            const qi = queueItems.find((q) => q.id === m.id);
            if (!qi) return m;
            return {
              ...m,
              status: qi.state === 'uploaded' ? 'uploaded' : qi.state === 'failed' ? 'failed' : m.status,
              publicUrl: qi.publicUrl || m.publicUrl,
              error: qi.error || m.error };
          })
        );

        const failedItems = queueItems.filter((q) => q.state === 'failed');
        if (failedItems.length > 0) {
          setSaveStage('failed_recoverable');
          setErrorMsg(t('listing.edit.mediaFailedRetry'));
          haptics.error();
          return;
        }

        // 2. Attach uploaded images with deterministic IDs
        const uploadedItems = queueItems.filter(
          (q) => q.state === 'uploaded' && !!q.publicUrl && !!q.finalizationId,
        );
        for (let i = 0; i < uploadedItems.length; i++) {
          const qi = uploadedItems[i];
          const attachmentId = `${itemId}_media_${qi.id}`;
          const draftItem = mediaItems.find((m) => m.id === qi.id);
          await createListingImageOnApi({
            id: attachmentId,
            listingId: itemId,
            imageUrl: qi.publicUrl!,
            sortOrder: existingRemotePhotos.length + i,
            // Processor-measured geometry wins over the raw asset dims —
            // EXIF orientation is baked in server-side and can flip
            // portrait↔landscape relative to what the picker reported.
            mediaWidth: qi.mediaWidth ?? qi.asset.width,
            mediaHeight: qi.mediaHeight ?? qi.asset.height,
            mediaType: qi.asset.kind === 'video' ? 'video' : 'image',
            finalizationId: qi.finalizationId!,
            posterUrl: draftItem?.posterUrl ?? null,
            blurhash: qi.blurhash ?? draftItem?.blurhash ?? null,
            focalX: draftItem?.focalPoint?.x ?? null,
            focalY: draftItem?.focalPoint?.y ?? null,
          });
        }
      }

      // 3. Build the attachment manifest from the current mediaItems order.
      //    Remote items map to their backend mediaId; newly uploaded local
      //    items map to the deterministic attachment id used above. This is
      //    what tells the backend the final order, removals and cover.
      const { attachmentOrder, coverMediaId, coverItem, coverUri, coverFinalizationId } =
        buildEditAttachmentManifest(mediaItems, queueItems, removedRemoteIds, itemId);

      // 4. Patch listing metadata (text fields + attachment manifest + cover)
      setSaveStage('updating_listing');
      if (coverItem && !coverUri) {
        throw new Error(t('listing.edit.mediaFailedRetry'));
      }
      await patchListingOnApi(itemId, {
        title: title.trim(),
        description: description.trim(),
        priceGbp: Number(sanitizeDecimalInput(price)),
        category: category.toLowerCase(),
        brand: brand || undefined,
        size: size || undefined,
        condition: condition || undefined,
        originalPriceGbp: originalPrice ? Number(sanitizeDecimalInput(originalPrice)) : undefined,
        shippingMethod: shippingMethod || undefined,
        shippingPayer: shippingPayer || undefined,
        imageUrl: coverUri,
        coverFinalizationId,
        attachmentOrder,
        removedAttachmentIds: removedRemoteIds.length > 0 ? removedRemoteIds : undefined,
        coverMediaId: coverMediaId ?? null });

      // Results are synced into state and attachments are created — drop
      // the queue snapshot so nothing leaks into a future save.
      uploadQueueRef.current.reset();

      setSaveStage('completed');
      haptics.success();
      showToast(t('listing.edit.updated'), 'success');
      // Refresh feed + invalidate cached detail so the edit propagates
      // immediately when the user returns to the feed or profile.
      void refreshListings();
      void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(itemId) });
      if (currentUser?.id) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.user.listingsAll(currentUser.id) });
      }
      navigation.goBack();
    } catch (e) {
      setSaveStage('failed_recoverable');
      setErrorMsg(t('listing.edit.updateFailed'));
      showToast(t('listing.edit.updateFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  }, [validate, isOwner, itemId, title, description, price, brand, size, condition, category, originalPrice, shippingMethod, shippingPayer, mediaItems, removedRemoteIds, setErrorMsg, setMediaItems, uploadQueueRef, showToast, navigation, queryClient, refreshListings, currentUser?.id]);

  return { isSaving, saveStage, handleSave };
}
