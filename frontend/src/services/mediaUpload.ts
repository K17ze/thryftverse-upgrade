import { fetchJson } from '../lib/apiClient';
import { MediaUploadAsset } from '../utils/mediaUploadAsset';

export interface PresignResponse {
  uploadIntentId: string;
  bucket: string;
  key: string;
  url: string;
  publicUrl: string;
  contentType: string;
  sizeBytes: number;
  maxSizeBytes: number;
  expiresInSeconds: number;
  expiresAt: string;
}

export interface UploadFinalizationInput {
  objectKey: string;
  bucket?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  publicUrl: string;
  folder?: string;
  scope?:
    | 'general'
    | 'chat_attachment'
    | 'listing_media'
    | 'avatar'
    | 'cover'
    | 'poster'
    | 'look'
    | 'evidence'
    | 'review';
  scopeRefId?: string;
  metadata?: Record<string, unknown>;
  verifyObject?: boolean;
  signal?: AbortSignal;
}

export interface UploadFinalization {
  id: string;
  objectKey: string;
  bucket: string;
  folder: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  publicUrl: string;
  deliveryStatus?: 'unmoderated_source_object';
  publicationGateRequired?: boolean;
  status: 'pending' | 'finalized' | 'failed';
  scope: string;
  scopeRefId: string | null;
  headCheckedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  mediaAsset?: MediaAssetReceipt | null;
}

export type MediaAssetReceipt = {
  id: string;
  status:
    | 'integrity_verified'
    | 'scan_pending'
    | 'processing'
    | 'moderation_pending'
    | 'publishable'
    | 'published'
    | 'upload_expired'
    | 'integrity_failed'
    | 'quarantined'
    | 'rejected'
    | 'processing_failed'
    | 'revoked'
    | 'deleted';
  mediaKind: 'image' | 'video' | 'document';
  canonicalUrl: string | null;
  publishable: boolean;
  failureReason?: string | null;
  quarantineReason?: string | null;
};

export async function presignUpload(
  fileName: string,
  contentType: string,
  folder = 'uploads',
  sizeBytes: number
): Promise<PresignResponse> {
  return fetchJson<PresignResponse>('/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, contentType, folder, sizeBytes }),
  });
}

export async function uploadToPresignedUrl(
  presignedUrl: string,
  fileUri: string,
  contentType: string,
  preparedBlob?: Blob
): Promise<void> {
  const blob = preparedBlob ?? await fetch(fileUri).then((response) => response.blob());

  const uploadResponse = await fetch(presignedUrl, {
    method: 'PUT',
    body: blob,
    headers: {
      'Content-Type': contentType,
    },
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload failed: ${uploadResponse.status}`);
  }
}

/**
 * Finalize an upload with the backend so the object is verified in S3 and
 * recorded durably. Call this after `uploadToPresignedUrl` succeeds.
 *
 * Throws if the finalization fails or the server cannot verify the object.
 * Callers should treat a thrown finalize as "the upload did not land" and
 * surface an honest error — do not silently proceed with the publicUrl.
 */
export async function finalizeUpload(
  input: UploadFinalizationInput
): Promise<UploadFinalization> {
  const payload = await fetchJson<{ ok: true; finalization: UploadFinalization }>(
    '/uploads/finalize',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectKey: input.objectKey,
        bucket: input.bucket,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        publicUrl: input.publicUrl,
        folder: input.folder ?? 'uploads',
        scope: input.scope ?? 'general',
        scopeRefId: input.scopeRefId,
        metadata: input.metadata ?? {},
        verifyObject: input.verifyObject ?? true,
      }),
      signal: input.signal,
    }
  );
  return payload.finalization;
}

export interface UploadedMedia {
  publicUrl: string;
  objectKey: string;
  finalizationId: string;
  mediaAssetId?: string;
  sizeBytes: number;
  contentType: string;
}

const MEDIA_PROCESSING_TIMEOUT_MS = 90_000;
const MEDIA_PROCESSING_POLL_MS = 1_500;

function waitFor(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Upload cancelled'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Upload cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchMediaAsset(assetId: string, signal?: AbortSignal): Promise<MediaAssetReceipt> {
  const payload = await fetchJson<{ ok: true; asset: MediaAssetReceipt }>(
    `/media/assets/${encodeURIComponent(assetId)}`,
    { signal },
  );
  return payload.asset;
}

async function publishMediaAsset(assetId: string, signal?: AbortSignal): Promise<MediaAssetReceipt> {
  const payload = await fetchJson<{ ok: true; asset: MediaAssetReceipt }>(
    `/media/assets/${encodeURIComponent(assetId)}/publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal,
    },
  );
  return payload.asset;
}

async function waitForPublishableMedia(
  assetId: string,
  signal?: AbortSignal,
): Promise<MediaAssetReceipt> {
  const deadline = Date.now() + MEDIA_PROCESSING_TIMEOUT_MS;
  const terminalFailureStatuses = new Set<MediaAssetReceipt['status']>([
    'upload_expired',
    'integrity_failed',
    'quarantined',
    'rejected',
    'revoked',
    'deleted',
  ]);

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Upload cancelled');
    const asset = await fetchMediaAsset(assetId, signal);
    if (asset.status === 'published') {
      return asset;
    }
    if (asset.status === 'publishable') {
      return publishMediaAsset(assetId, signal);
    }
    if (terminalFailureStatuses.has(asset.status)) {
      throw new Error(
        asset.failureReason
        ?? asset.quarantineReason
        ?? `Media processing ended with status ${asset.status}`,
      );
    }
    await waitFor(MEDIA_PROCESSING_POLL_MS, signal);
  }

  throw new Error(
    'Media is still being checked. Keep this draft and try publishing again shortly.',
  );
}

function creatorScopeForFolder(folder: string): UploadFinalizationInput['scope'] {
  if (folder === 'looks') return 'look';
  if (folder === 'posters') return 'poster';
  if (folder === 'listings') return 'listing_media';
  if (folder === 'avatars') return 'avatar';
  if (folder === 'covers') return 'cover';
  if (folder === 'evidence') return 'evidence';
  if (folder === 'review') return 'review';
  return 'general';
}

export interface FinalizePresignedMediaInput {
  presign: PresignResponse;
  fileName: string;
  folder: string;
  scopeRefId?: string;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

/**
 * Convert an object-store PUT into a trusted creator asset. A successful PUT
 * is not publication: the backend must verify the object, create the durable
 * media-asset receipt and, when enabled, complete scanning/processing before
 * returning a canonical delivery URL.
 */
export async function finalizePresignedMedia(
  input: FinalizePresignedMediaInput,
): Promise<UploadedMedia> {
  const { presign, fileName, folder, signal } = input;
  const finalization = await finalizeUpload({
    objectKey: presign.key,
    bucket: presign.bucket,
    fileName,
    contentType: presign.contentType,
    sizeBytes: presign.sizeBytes,
    publicUrl: presign.publicUrl,
    folder,
    scope: creatorScopeForFolder(folder),
    scopeRefId: input.scopeRefId,
    metadata: input.metadata,
    signal,
  });

  if (finalization.status !== 'finalized') {
    throw new Error(
      `Upload finalization ${finalization.status}: ${finalization.failureReason ?? 'unknown'}`,
    );
  }

  let resolvedPublicUrl = presign.publicUrl;
  if (finalization.publicationGateRequired) {
    if (!finalization.mediaAsset?.id) {
      throw new Error('The media processor did not return a canonical asset reference');
    }
    const publishedAsset = await waitForPublishableMedia(finalization.mediaAsset.id, signal);
    if (!publishedAsset.canonicalUrl) {
      throw new Error('The published media asset has no canonical delivery URL');
    }
    resolvedPublicUrl = publishedAsset.canonicalUrl;
  }

  return {
    publicUrl: resolvedPublicUrl,
    objectKey: presign.key,
    finalizationId: finalization.id,
    mediaAssetId: finalization.mediaAsset?.id,
    sizeBytes: presign.sizeBytes,
    contentType: presign.contentType,
  };
}

export async function uploadMedia(fileUri: string, folder?: string): Promise<UploadedMedia>;
export async function uploadMedia(asset: MediaUploadAsset, folder?: string): Promise<UploadedMedia>;
export async function uploadMedia(
  source: string | MediaUploadAsset,
  folder = 'uploads'
): Promise<UploadedMedia> {
  // Performance mark: image/media upload start.
  performance.mark('upload:start');

  let fileUri: string;
  let fileName: string;
  let contentType: string;

  if (typeof source === 'string') {
    fileUri = source;
    const ext = fileUri.split('.').pop()?.toLowerCase() ?? 'jpg';
    contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'gif'
        ? 'image/gif'
        : ext === 'webp'
        ? 'image/webp'
        : ext === 'mp4'
        ? 'video/mp4'
        : ext === 'mov'
        ? 'video/quicktime'
        : 'image/jpeg';
    fileName = `media_${Date.now()}_${Math.floor(Math.random() * 1_000_000).toString(36)}.${ext}`;
  } else {
    fileUri = source.uri;
    fileName = source.fileName;
    contentType = source.mimeType;
  }

  const blob = await fetch(fileUri).then((response) => response.blob());
  const presign = await presignUpload(fileName, contentType, folder, blob.size);
  await uploadToPresignedUrl(presign.url, fileUri, contentType, blob);

  // Finalize with the backend so the object is verified in S3 and recorded
  // durably. If this throws, the caller must surface an honest error — the
  // upload may have landed but the backend cannot vouch for it.
  const uploaded = await finalizePresignedMedia({ presign, fileName, folder });

  // Performance mark: image/media upload complete (finalized + published).
  performance.mark('upload:complete');

  return uploaded;
}
