import { MediaUploadQueue, UploadQueueItemState } from './mediaUploadQueue';
import { createListingOnApi, createListingImageOnApi } from './listingsApi';
import { ListingMediaDraftItem } from '../utils/mediaUploadAsset';
import { ListingPublicationRecovery } from '../store/useStore';

export type PublicationStage =
  | 'validating'
  | 'uploading_media'
  | 'creating_listing'
  | 'attaching_media'
  | 'finalising'
  | 'completed'
  | 'failed_recoverable';

export interface PublicationContext {
  clientPublicationId: string;
  mode: 'sell_now' | 'auction';
  stage: PublicationStage;
  listingId?: string;
  uploadedMediaByAssetId: Record<string, string>;
  attachedAssetIds: string[];
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
  existingRecovery?: ListingPublicationRecovery | null;
  onStageChange?: (stage: PublicationStage) => void;
}

export interface PublicationResult {
  ok: boolean;
  listingId?: string;
  error?: string;
  context: PublicationContext;
}

function generateClientPublicationId(): string {
  return `pub_${Date.now()}_${Math.floor(Math.random() * 1_000_000).toString(36)}`;
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
 */
export async function executePublication(
  input: PublicationInput,
  queue: MediaUploadQueue
): Promise<PublicationResult> {
  const ctx: PublicationContext = {
    clientPublicationId: input.existingRecovery?.clientPublicationId ?? generateClientPublicationId(),
    mode: input.mode,
    stage: 'validating',
    listingId: input.existingRecovery?.listingId,
    uploadedMediaByAssetId: { ...(input.existingRecovery?.uploadedMediaByAssetId ?? {}) },
    attachedAssetIds: [...(input.existingRecovery?.attachedAssetIds ?? [])],
    lastError: undefined,
  };

  const setStage = (s: PublicationStage) => {
    ctx.stage = s;
    input.onStageChange?.(s);
  };

  try {
    // 1. Upload local media
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

    // Read resolved state directly from queue — never from stale React closures
    const resolvedMedia = buildResolvedMedia(input.mediaDraftItems, queue);

    // Merge uploaded URLs into context
    for (const m of resolvedMedia) {
      if (m.publicUrl) {
        ctx.uploadedMediaByAssetId[m.id] = m.publicUrl;
      }
    }

    // Guard: every required local item must have a public URL
    const unresolvedLocals = resolvedMedia.filter(
      (m) => m.source === 'local' && !ctx.uploadedMediaByAssetId[m.id]
    );
    if (unresolvedLocals.length > 0) {
      setStage('failed_recoverable');
      ctx.lastError = `${unresolvedLocals.length} media item(s) failed to upload. Tap Retry on failed items.`;
      return { ok: false, error: ctx.lastError, context: ctx };
    }

    // Build final ordered URL list from resolved media
    const uploadedUrls: string[] = resolvedMedia
      .map((m) => ctx.uploadedMediaByAssetId[m.id] || m.publicUrl || m.uri)
      .filter((u): u is string => !!u && !isLocalUri(u));

    if (uploadedUrls.length === 0) {
      setStage('failed_recoverable');
      ctx.lastError = 'No usable media URLs after upload.';
      return { ok: false, error: ctx.lastError, context: ctx };
    }

    const coverImage = uploadedUrls[0];

    // 2. Create listing if not already created
    setStage('creating_listing');
    let listingId = ctx.listingId;
    if (!listingId) {
      listingId = `listing_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      await createListingOnApi({
        id: listingId,
        sellerId: input.sellerId,
        title: input.title.trim(),
        description: input.description.trim(),
        priceGbp: input.priceGbp,
        imageUrl: coverImage,
        status: 'active',
        category: input.category,
        brand: input.brand,
        size: input.size,
        condition: input.condition,
        originalPriceGbp: input.originalPriceGbp,
        shippingMethod: input.shippingMethod,
        shippingPayer: input.shippingPayer,
      });
      ctx.listingId = listingId;
    }

    // 3. Attach media, skipping already-attached assets
    setStage('attaching_media');
    for (let i = 0; i < resolvedMedia.length; i++) {
      const m = resolvedMedia[i];
      const url = ctx.uploadedMediaByAssetId[m.id] || m.publicUrl;
      if (!url || isLocalUri(url)) continue;
      if (ctx.attachedAssetIds.includes(m.id)) continue;

      await createListingImageOnApi({
        id: makeAttachmentId(listingId, m.id),
        listingId,
        imageUrl: url,
        sortOrder: i,
      });
      ctx.attachedAssetIds.push(m.id);
    }

    setStage('finalising');
    setStage('completed');
    return { ok: true, listingId, context: ctx };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Publication failed. Please try again.';
    ctx.lastError = msg;
    setStage('failed_recoverable');
    return { ok: false, error: msg, context: ctx };
  }
}

export function buildRecoveryState(ctx: PublicationContext): ListingPublicationRecovery {
  return {
    clientPublicationId: ctx.clientPublicationId,
    mode: ctx.mode,
    stage: ctx.stage,
    listingId: ctx.listingId,
    uploadedMediaByAssetId: ctx.uploadedMediaByAssetId,
    attachedAssetIds: ctx.attachedAssetIds,
    lastError: ctx.lastError,
  };
}
