import { MediaUploadQueue } from './mediaUploadQueue';
import { createListingOnApi, createListingImageOnApi, type ListingCreateBody } from './listingsApi';
import { ListingMediaDraftItem } from '../utils/mediaUploadAsset';
import { makeStableId } from '../utils/createStableId';
import { ApiRequestError, isRecord } from '../lib/apiClient';
import { OFFLINE_WRITE_QUEUED_CODE } from '../lib/offlineQueue';

export type PublicationStage =
  | 'uploading_media'
  | 'creating_listing'
  | 'attaching_media'
  | 'completed'
  | 'failed_recoverable';

export interface PublicationContext {
  clientPublicationId: string;
  mode: 'sell_now' | 'auction';
  stage: PublicationStage;
  /** Client-generated listing id. Reserved before the first create attempt so
   *  retries reuse it: the create body is byte-identical, the offline queue
   *  dedupes by url+method+body, and the backend upserts listings by id. */
  listingId?: string;
  /** Server confirmed the listing row exists. False after an offline-queued
   *  or failed create — the id is reserved but the listing is NOT created. */
  listingCreated: boolean;
  /** True when the latest failure was a write queued for offline replay. */
  offlineQueued: boolean;
  uploadedMediaByAssetId: Record<string, string>;
  uploadedFinalizationByAssetId: Record<string, string>;
  attachedAssetIds: string[];
  coverImageUrl?: string;
  lastError?: string;
}

export interface PublicationInput {
  mode: 'sell_now' | 'auction';
  mediaDraftItems: ListingMediaDraftItem[];
  title: string;
  description: string;
  priceGbp: number;
  category?: string;
  brand?: string;
  size?: string;
  condition?: string;
  originalPriceGbp?: number;
  shippingMethod?: string;
  shippingPayer?: string;
  sellerId: string;
  existingRecovery?: PublicationContext | null;
  onStageChange?: (stage: PublicationStage) => void;
}

export interface PublicationResult {
  ok: boolean;
  listingId?: string;
  error?: string;
  context: PublicationContext;
}

function generateClientPublicationId(): string {
  return makeStableId('pub');
}

function isLocalUri(uri: string): boolean {
  return (
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('ph://') ||
    uri.startsWith('assets-library://')
  );
}

function makeAttachmentId(listingId: string, assetId: string): string {
  return `${listingId}_att_${assetId}`;
}

function isOfflineQueuedError(e: unknown): boolean {
  return (
    e instanceof ApiRequestError &&
    isRecord(e.details) &&
    e.details.code === OFFLINE_WRITE_QUEUED_CODE
  );
}

/**
 * Build resolved media from the queue result map, reading live queue state
 * rather than stale React closures.
 */
function buildResolvedMedia(
  mediaDraftItems: ListingMediaDraftItem[],
  queue: MediaUploadQueue
): ListingMediaDraftItem[] {
  const resultMap = queue.getResultMap();
  return mediaDraftItems.map((m) => {
    if (m.source !== 'local') return m;
    const res = resultMap.get(m.id);
    if (!res) return m;
    return {
      ...m,
      status: res.state === 'uploaded' ? 'uploaded' : res.state === 'failed' ? 'failed' : m.status,
      publicUrl: res.publicUrl || m.publicUrl,
      error: res.error || m.error,
    };
  });
}

/**
 * Unified recoverable publication orchestrator for fixed-price and auction flows.
 *
 * Order of operations: upload ALL media first, then create the listing with
 * the verified cover, then attach the remaining media. A failure after the
 * listing was created is recoverable and idempotent — the caller retries with
 * the returned context, the listing is not recreated, and only the missing
 * attachments are sent.
 */
export async function executePublication(
  input: PublicationInput,
  queue: MediaUploadQueue
): Promise<PublicationResult> {
  const ctx: PublicationContext = {
    clientPublicationId: input.existingRecovery?.clientPublicationId ?? generateClientPublicationId(),
    mode: input.mode,
    stage: 'uploading_media',
    listingId: input.existingRecovery?.listingId,
    listingCreated: input.existingRecovery?.listingCreated ?? false,
    offlineQueued: false,
    uploadedMediaByAssetId: { ...(input.existingRecovery?.uploadedMediaByAssetId ?? {}) },
    uploadedFinalizationByAssetId: {
      ...(input.existingRecovery?.uploadedFinalizationByAssetId ?? {}),
    },
    attachedAssetIds: [...(input.existingRecovery?.attachedAssetIds ?? [])],
    coverImageUrl: input.existingRecovery?.coverImageUrl,
    lastError: undefined,
  };

  const setStage = (s: PublicationStage) => {
    ctx.stage = s;
    input.onStageChange?.(s);
  };

  const fail = (error: string): PublicationResult => {
    ctx.lastError = error;
    setStage('failed_recoverable');
    return { ok: false, error, context: ctx };
  };

  try {
    // 1. Upload local media — all media is durably uploaded before the
    //    listing row is created, so a media failure never leaves an active
    //    listing behind.
    setStage('uploading_media');
    const itemsToUpload = input.mediaDraftItems.filter(
      (m) => m.source === 'local' && m.status !== 'uploaded' && !ctx.uploadedMediaByAssetId[m.id]
    );

    if (itemsToUpload.length > 0) {
      queue.addAssets(
        itemsToUpload.map((m) => ({
          id: m.id,
          uri: m.uri,
          fileName: m.fileName ?? 'unknown',
          mimeType: m.mimeType ?? 'image/jpeg',
          kind: m.kind,
          fileSize: m.fileSize,
          width: m.width,
          height: m.height,
          durationMs: m.durationMs,
        }))
      );
      await queue.run();
    }

    // Read resolved state directly from the queue — never from stale closures.
    const resolvedMedia = buildResolvedMedia(input.mediaDraftItems, queue);

    for (const m of resolvedMedia) {
      const uploadResult = queue.getResultMap().get(m.id);
      if (m.publicUrl && !isLocalUri(m.publicUrl)) {
        ctx.uploadedMediaByAssetId[m.id] = m.publicUrl;
      }
      if (uploadResult?.finalizationId) {
        ctx.uploadedFinalizationByAssetId[m.id] = uploadResult.finalizationId;
      }
    }

    const unresolvedLocals = resolvedMedia.filter(
      (m) => m.source === 'local' && !ctx.uploadedMediaByAssetId[m.id]
    );
    if (unresolvedLocals.length > 0) {
      return fail(`${unresolvedLocals.length} upload(s) failed. Tap Publish to retry.`);
    }

    const uploadedUrls: string[] = resolvedMedia
      .map((m) => ctx.uploadedMediaByAssetId[m.id] || m.publicUrl)
      .filter((u): u is string => !!u && !isLocalUri(u));

    if (uploadedUrls.length === 0) {
      return fail('No media uploaded successfully.');
    }

    const coverMedia = resolvedMedia.find((media) => media.kind === 'image');
    const coverImage = coverMedia
      ? ctx.uploadedMediaByAssetId[coverMedia.id] || coverMedia.publicUrl
      : undefined;
    const coverFinalizationId = coverMedia
      ? ctx.uploadedFinalizationByAssetId[coverMedia.id]
      : undefined;
    if (!coverImage || !coverFinalizationId) {
      return fail('A verified cover image is required to publish.');
    }
    ctx.coverImageUrl = coverImage;

    // 2. Create the listing — skipped entirely when a previous attempt
    //    already created it (idempotent resume).
    if (!ctx.listingCreated) {
      setStage('creating_listing');
      if (!ctx.listingId) {
        ctx.listingId = makeStableId('listing');
      }
      const listingBody: ListingCreateBody = {
        id: ctx.listingId,
        sellerId: input.sellerId,
        title: input.title.trim(),
        description: input.description.trim(),
        priceGbp: input.priceGbp,
        imageUrl: coverImage,
        coverFinalizationId,
        status: 'active',
        category: input.category,
        brand: input.brand,
        size: input.size,
        condition: input.condition,
        originalPriceGbp: input.originalPriceGbp,
        shippingMethod: input.shippingMethod,
        shippingPayer: input.shippingPayer,
      };

      try {
        await createListingOnApi(listingBody);
        ctx.listingCreated = true;
        ctx.offlineQueued = false;
      } catch (e) {
        if (isOfflineQueuedError(e)) {
          ctx.offlineQueued = true;
          return fail(
            'You are offline. Your listing has been saved and will be published when you reconnect.'
          );
        }
        throw e;
      }
    }

    // 3. Attach media, skipping already-attached assets.
    setStage('attaching_media');
    for (let i = 0; i < resolvedMedia.length; i++) {
      const m = resolvedMedia[i];
      const url = ctx.uploadedMediaByAssetId[m.id] || m.publicUrl;
      if (!url || isLocalUri(url)) continue;
      if (ctx.attachedAssetIds.includes(m.id)) continue;
      const finalizationId = ctx.uploadedFinalizationByAssetId[m.id];
      if (!finalizationId) {
        throw new Error('Media verification failed — re-upload to continue.');
      }

      try {
        await createListingImageOnApi({
          id: makeAttachmentId(ctx.listingId!, m.id),
          listingId: ctx.listingId!,
          imageUrl: url,
          sortOrder: i,
          mediaWidth: m.width,
          mediaHeight: m.height,
          mediaType: m.kind,
          finalizationId,
        });
        ctx.offlineQueued = false;
      } catch (e) {
        if (isOfflineQueuedError(e)) {
          ctx.offlineQueued = true;
          return fail(
            'You are offline. Your listing was created and remaining media will attach automatically when you reconnect.'
          );
        }
        throw e;
      }
      ctx.attachedAssetIds.push(m.id);
    }

    setStage('completed');
    return { ok: true, listingId: ctx.listingId, context: ctx };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Publishing failed — try again.';
    return fail(msg);
  }
}
