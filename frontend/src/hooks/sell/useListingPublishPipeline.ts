import { useState, useRef, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { haptics } from '../../utils/haptics';
import { makeStableId } from '../../utils/createStableId';
import { sanitizeDecimalInput } from '../../utils/currencyAuthoringFlows';
import {
  resolvePublishedMedia,
  buildPublishErrors,
} from '../../utils/sellScreenLogic';
import { buildCreateCoOwnPrefillFromSell } from '../../utils/syndicatePrefill';
import type { ListingMediaDraftItem } from '../../utils/mediaUploadAsset';
import { createListingOnApi, createListingImageOnApi } from '../../services/listingsApi';
import type { MediaUploadQueue } from '../../services/mediaUploadQueue';
import type { ListingMode } from '../../components/listing/ListingModeSelector';
import type { ListingCompletenessResult } from '../../contracts/listingCategoryPolicy';
import { track, trackFunnelStep } from '../../analytics';

interface ListingPublishPipelineParams {
  listingMode: ListingMode;
  title: string;
  desc: string;
  price: string;
  originalPrice: string;
  category: string;
  brand: string;
  size: string;
  condition: string;
  startingBid: string;
  shareCountInput: string;
  sharePriceInput: string;
  offeringWindowHours: number;
  authPhotos: string[];
  shippingMethod: 'standard' | 'express' | null;
  shippingPayer: 'buyer' | 'seller' | null;
  photos: string[];
  mediaDraftItems: ListingMediaDraftItem[];
  completeness: ListingCompletenessResult;
  isOffline: boolean;
  currentUser: { id: string } | null;
  navigation: any;
  uploadQueueRef: React.MutableRefObject<MediaUploadQueue>;
  setMediaDraftItems: React.Dispatch<React.SetStateAction<ListingMediaDraftItem[]>>;
  setPhotos: React.Dispatch<React.SetStateAction<string[]>>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setErrorMsg: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Owns the listing publication state and the publish effect chain:
 * media-upload → create-listing → attach-media. Manages isPublishing,
 * publicationStage, and ref guards for recoverable failure handling.
 */
export function useListingPublishPipeline(params: ListingPublishPipelineParams) {
  const {
    listingMode,
    title,
    desc,
    price,
    originalPrice,
    category,
    brand,
    size,
    condition,
    startingBid,
    shareCountInput,
    sharePriceInput,
    offeringWindowHours,
    authPhotos,
    shippingMethod,
    shippingPayer,
    photos,
    mediaDraftItems,
    completeness,
    isOffline,
    currentUser,
    navigation,
    uploadQueueRef,
    setMediaDraftItems,
    setPhotos,
    setErrors,
    setErrorMsg,
  } = params;

  const clearSellDraft = useStore((s) => s.clearSellDraft);

  const [isPublishing, setIsPublishing] = useState(false);
  // Ref guard prevents double-tap publish before state update propagates (§13).
  const isPublishingRef = useRef(false);
  const [publicationStage, setPublicationStage] = useState<'idle' | 'uploading_media' | 'creating_listing' | 'attaching_media' | 'completed' | 'failed_recoverable'>('idle');
  const publishedListingIdRef = useRef<string | null>(null);
  const uploadedUrlsRef = useRef<string[]>([]);

  const handlePublish = useCallback(async () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = desc.trim();
    const numericPrice = Number(sanitizeDecimalInput(price));

    const nextErrors = buildPublishErrors({
      missingRequired: completeness.missingRequired,
      listingMode,
      trimmedDescription,
      numericPrice,
      shareCountInput,
      sharePriceInput,
      authPhotosLength: authPhotos.length,
      startingBid,
    });

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setErrorMsg('Fix the errors above before publishing.');
      haptics.error();
      return;
    }

    setErrors({});
    trackFunnelStep('listing_creation', 'listing_submitted', { mode: listingMode });

    // Performance mark: listing creation flow start (validation passed).
    performance.mark('listing:create:start');

    if (listingMode === 'co_own') {
      const prefillResult = buildCreateCoOwnPrefillFromSell({
        shareCountInput,
        sharePriceInput,
        offeringWindowHours,
        authPhotos,
      });

      if (!prefillResult.ok) {
        setErrorMsg(prefillResult.error ?? 'Unable to prepare co-own listing.');
        haptics.error();
        return;
      }

      setErrorMsg(null);
      haptics.success();
      navigation.replace('CreateCoOwn', prefillResult.params);
      return;
    }

    if (listingMode === 'auction') {
      if (!currentUser?.id) {
        setErrorMsg('Sign in to publish a listing.');
        haptics.error();
        return;
      }
      setErrorMsg(null);
      setIsPublishing(true);
      try {
        const queue = uploadQueueRef.current;
        const itemsToUpload = mediaDraftItems.filter((m) => m.source === 'local' && m.status !== 'uploaded');
        if (itemsToUpload.length > 0) {
          queue.addAssets(
            itemsToUpload.map((m) => ({
              id: m.id,
              uri: m.uri,
              fileName: m.fileName || m.uri.split('/').pop() || 'photo.jpg',
              mimeType: m.mimeType || 'image/jpeg',
              kind: m.kind,
              width: m.width,
              height: m.height,
            }))
          );
          await queue.run();
          const queueItems = queue.getItems();
          setMediaDraftItems((prev) =>
            prev.map((m) => {
              const qi = queueItems.find((q) => q.id === m.id);
              if (!qi) return m;
              return { ...m, status: qi.state === 'uploaded' ? 'uploaded' : qi.state === 'failed' ? 'failed' : m.status, publicUrl: qi.publicUrl || m.publicUrl, error: qi.error || m.error };
            })
          );
        }
        const uploadedMedia = resolvePublishedMedia(mediaDraftItems, queue);
        const uploadedUrls = uploadedMedia.map((item) => item.url);
        const verifiedQueueItems = queue.getItems();
        const coverUpload = verifiedQueueItems.find(
          (item) => item.state === 'uploaded'
            && item.asset.kind === 'image'
            && item.publicUrl
            && item.finalizationId,
        );
        if (!coverUpload) {
          throw new Error('A verified cover image is required before creating an auction.');
        }
        const coverImage = coverUpload.publicUrl!;
        const listingId = makeStableId('listing');
        await createListingOnApi({
          id: listingId,
          sellerId: currentUser.id,
          title: trimmedTitle,
          description: trimmedDescription,
          priceGbp: numericPrice,
          imageUrl: coverImage,
          coverFinalizationId: coverUpload.finalizationId!,
          status: 'active',
          category,
          brand: brand || undefined,
          size,
          condition,
          originalPriceGbp: originalPrice ? Number(sanitizeDecimalInput(originalPrice)) : undefined,
          shippingMethod: shippingMethod || undefined,
          shippingPayer: shippingPayer || undefined,
        });
        for (let i = 0; i < uploadedUrls.length; i++) {
          const verifiedUpload = verifiedQueueItems.find(
            (item) => item.publicUrl === uploadedUrls[i] && item.finalizationId,
          );
          if (!verifiedUpload) {
            throw new Error('Every auction media item must be verified before attachment.');
          }
          await createListingImageOnApi({
            id: `${listingId}_img_${i}`,
            listingId,
            imageUrl: uploadedUrls[i],
            sortOrder: i,
            mediaWidth: uploadedMedia[i]?.width,
            mediaHeight: uploadedMedia[i]?.height,
            finalizationId: verifiedUpload.finalizationId!,
          });
        }
        clearSellDraft();
        setMediaDraftItems([]);
        queue.reset();
        haptics.success();
        // Performance mark: listing creation complete (auction path).
        performance.mark('listing:create:complete');
        navigation.replace('CreateAuction', { listingId });
      } catch (e: unknown) {
        const msg = typeof e === 'object' && e && 'message' in e && typeof (e as Error).message === 'string' ? (e as Error).message : 'Failed to prepare auction. Try again.';
        setErrorMsg(msg);
        haptics.error();
      } finally {
        isPublishingRef.current = false;
        setIsPublishing(false);
      }
      return;
    }

    if (!currentUser?.id) {
      setErrorMsg('Sign in to publish a listing.');
      haptics.error();
      return;
    }

    if (isPublishing || isPublishingRef.current) return;
    isPublishingRef.current = true;
    setIsPublishing(true);
    setErrorMsg(null);
    setPublicationStage('uploading_media');

    try {
      const queue = uploadQueueRef.current;
      const itemsToUpload = mediaDraftItems.filter((m) => m.source === 'local' && m.status !== 'uploaded');
      if (itemsToUpload.length > 0) {
        const assets = itemsToUpload.map((m) => ({
          id: m.id,
          uri: m.uri,
          fileName: m.fileName || m.uri.split('/').pop() || 'photo.jpg',
          mimeType: m.mimeType || 'image/jpeg',
          kind: m.kind,
          width: m.width,
          height: m.height,
        }));
        queue.addAssets(assets);
        await queue.run();
        const queueItems = queue.getItems();
        setMediaDraftItems((prev) =>
          prev.map((m) => {
            const qi = queueItems.find((q) => q.id === m.id);
            if (!qi) return m;
            return {
              ...m,
              status: qi.state === 'uploaded' ? 'uploaded' : qi.state === 'failed' ? 'failed' : m.status,
              publicUrl: qi.publicUrl || m.publicUrl,
              error: qi.error || m.error,
            };
          })
        );
      }

      const uploadedMedia = resolvePublishedMedia(mediaDraftItems, queue);
      const uploadedUrls = uploadedMedia.map((item) => item.url);
      const verifiedQueueItems = queue.getItems();
      const coverUpload = verifiedQueueItems.find(
        (item) => item.state === 'uploaded'
          && item.asset.kind === 'image'
          && item.publicUrl
          && item.finalizationId,
      );
      if (!coverUpload) {
        throw new Error('A verified cover image is required before publishing.');
      }
      const coverImage = coverUpload.publicUrl!;
      let listingId = publishedListingIdRef.current;

      if (!listingId) {
        setPublicationStage('creating_listing');
        listingId = makeStableId('listing');
        await createListingOnApi({
          id: listingId,
          sellerId: currentUser.id,
          title: trimmedTitle,
          description: trimmedDescription,
          priceGbp: numericPrice,
          imageUrl: coverImage,
          coverFinalizationId: coverUpload.finalizationId!,
          status: 'active',
          category,
          brand: brand || undefined,
          size,
          condition,
          originalPriceGbp: originalPrice ? Number(sanitizeDecimalInput(originalPrice)) : undefined,
          shippingMethod: shippingMethod || undefined,
          shippingPayer: shippingPayer || undefined,
        });
        publishedListingIdRef.current = listingId;
      }

      setPublicationStage('attaching_media');
      for (let i = 0; i < uploadedUrls.length; i++) {
        const verifiedUpload = verifiedQueueItems.find(
          (item) => item.publicUrl === uploadedUrls[i] && item.finalizationId,
        );
        if (!verifiedUpload) {
          throw new Error('Every listing media item must be verified before attachment.');
        }
        await createListingImageOnApi({
          id: `${listingId}_img_${i}`,
          listingId,
          imageUrl: uploadedUrls[i],
          sortOrder: i,
          mediaWidth: uploadedMedia[i]?.width,
          mediaHeight: uploadedMedia[i]?.height,
          finalizationId: verifiedUpload.finalizationId!,
        });
      }

      setPublicationStage('completed');
      clearSellDraft();
      setMediaDraftItems([]);
      queue.reset();
      publishedListingIdRef.current = null;
      haptics.success();
      // Performance mark: listing creation complete (standard path).
      performance.mark('listing:create:complete');
      track('listing_created', { category, price_range: numericPrice <= 20 ? 'low' : numericPrice <= 50 ? 'mid' : numericPrice <= 100 ? 'high' : 'premium' });
      navigation.replace('ListingSuccess', {
        listingId,
        title: trimmedTitle,
        price: numericPrice,
        categoryId: category,
        photoUri: coverImage,
      });
    } catch (e: unknown) {
      const isNetworkError = isOffline || (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'NETWORK_ERROR');
      const rawMsg = typeof e === 'object' && e && 'message' in e && typeof (e as Error).message === 'string' ? (e as Error).message : 'Failed to publish. Try again.';
      const msg = isNetworkError ? 'You appear to be offline. Check your connection and try again.' : rawMsg;
      const hasListing = !!publishedListingIdRef.current;
      const hasMedia = mediaDraftItems.some((m) => m.status === 'uploaded');
      setPublicationStage('failed_recoverable');
      setErrorMsg(hasListing ? `${msg} -- your listing was created. Tap Publish to retry attaching media.` : hasMedia ? `${msg} -- some media uploaded. Tap Publish to retry.` : msg);
      haptics.error();
    } finally {
      isPublishingRef.current = false;
      setIsPublishing(false);
    }
  }, [isPublishing, listingMode, photos, mediaDraftItems, title, desc, price, startingBid, category, size, condition, shareCountInput, sharePriceInput, offeringWindowHours, authPhotos, clearSellDraft, navigation, currentUser, brand, originalPrice, shippingMethod, shippingPayer, isOffline, completeness, uploadQueueRef, setMediaDraftItems, setPhotos, setErrors, setErrorMsg]);

  return {
    isPublishing,
    publicationStage,
    handlePublish,
  };
}
