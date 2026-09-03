import { useState, useRef, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { haptics } from '../../utils/haptics';
import { sanitizeDecimalInput } from '../../utils/currencyAuthoringFlows';
import { buildPublishErrors } from '../../utils/sellScreenLogic';
import { buildCreateCoOwnPrefillFromSell } from '../../utils/syndicatePrefill';
import type { ListingMediaDraftItem } from '../../utils/mediaUploadAsset';
import type { MediaUploadQueue } from '../../services/mediaUploadQueue';
import {
  executePublication,
  type PublicationContext,
  type PublicationStage,
} from '../../services/listingPublication';
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
 * Owns the listing publication state and the publish flow: validation →
 * co-own redirect → executePublication (media-upload → create-listing →
 * attach-media). Manages isPublishing, publicationStage, and the recovery
 * context that makes retries idempotent (the listing is never recreated;
 * only missing media attachments are re-sent).
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
  const [publicationStage, setPublicationStage] = useState<PublicationStage | 'idle'>('idle');
  // Recovery context from the last failed attempt. Reused on retry so the
  // reserved listing id and completed uploads/attachments are not redone.
  const recoveryRef = useRef<PublicationContext | null>(null);

  const syncMediaFromQueue = useCallback((queue: MediaUploadQueue) => {
    const resultMap = queue.getResultMap();
    if (resultMap.size === 0) return;
    setMediaDraftItems((prev) =>
      prev.map((m) => {
        const res = resultMap.get(m.id);
        if (!res) return m;
        return {
          ...m,
          status: res.state === 'uploaded' ? 'uploaded' : res.state === 'failed' ? 'failed' : m.status,
          publicUrl: res.publicUrl || m.publicUrl,
          error: res.error || m.error,
        };
      })
    );
  }, [setMediaDraftItems]);

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

    if (!currentUser?.id) {
      setErrorMsg('Sign in to publish a listing.');
      haptics.error();
      return;
    }

    if (isPublishing || isPublishingRef.current) return;
    isPublishingRef.current = true;
    setIsPublishing(true);
    setErrorMsg(null);

    const queue = uploadQueueRef.current;
    const result = await executePublication(
      {
        mode: listingMode === 'auction' ? 'auction' : 'sell_now',
        mediaDraftItems,
        title: trimmedTitle,
        description: trimmedDescription,
        priceGbp: numericPrice,
        category,
        brand: brand || undefined,
        size,
        condition,
        originalPriceGbp: originalPrice ? Number(sanitizeDecimalInput(originalPrice)) : undefined,
        shippingMethod: shippingMethod || undefined,
        shippingPayer: shippingPayer || undefined,
        sellerId: currentUser.id,
        existingRecovery: recoveryRef.current,
        onStageChange: setPublicationStage,
      },
      queue
    );

    // Reflect live upload state in the draft items regardless of outcome.
    syncMediaFromQueue(queue);

    if (result.ok && result.listingId) {
      recoveryRef.current = null;
      setPublicationStage('completed');
      clearSellDraft();
      setMediaDraftItems([]);
      setPhotos([]);
      queue.reset();
      haptics.success();
      // Performance mark: listing creation complete.
      performance.mark('listing:create:complete');
      track('listing_published', { listing_id: result.listingId });
      if (result.context.mode === 'sell_now') {
        track('listing_created', { category, price_range: numericPrice <= 20 ? 'low' : numericPrice <= 50 ? 'mid' : numericPrice <= 100 ? 'high' : 'premium' });
        navigation.replace('ListingSuccess', {
          listingId: result.listingId,
          title: trimmedTitle,
          price: numericPrice,
          categoryId: category,
          photoUri: result.context.coverImageUrl,
        });
      } else {
        navigation.replace('CreateAuction', { listingId: result.listingId });
      }
    } else {
      // Recovery context is authoritative at failure time — no stale reads.
      recoveryRef.current = result.context;
      setPublicationStage('failed_recoverable');
      const rawMsg = result.error ?? 'Failed to publish. Try again.';
      let msg = rawMsg;
      if (result.context.offlineQueued) {
        msg = rawMsg;
      } else if (isOffline && !result.context.listingCreated) {
        msg = 'You appear to be offline. Check your connection and try again.';
      } else if (result.context.listingCreated) {
        msg = `${rawMsg} — your listing was created. Tap Publish to retry attaching media.`;
      }
      setErrorMsg(msg);
      haptics.error();
    }

    isPublishingRef.current = false;
    setIsPublishing(false);
  }, [isPublishing, listingMode, photos, mediaDraftItems, title, desc, price, startingBid, category, size, condition, shareCountInput, sharePriceInput, offeringWindowHours, authPhotos, clearSellDraft, navigation, currentUser, brand, originalPrice, shippingMethod, shippingPayer, isOffline, completeness, uploadQueueRef, setMediaDraftItems, setPhotos, setErrors, setErrorMsg, syncMediaFromQueue]);

  return {
    isPublishing,
    publicationStage,
    handlePublish,
  };
}
