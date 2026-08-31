import type { CreatorDocument, CreatorLayer } from './composition';
import {
  presignUpload,
  uploadToPresignedUrl,
  finalizePresignedMedia,
  type UploadedMedia,
} from '../services/mediaUpload';
import {
  validateMediaAssets,
  inferMimeTypeFromUri,
  resolveKind,
  type MediaUploadAsset,
  type MediaValidationOptions,
} from '../utils/mediaUploadAsset';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const LOCAL_URI_PREFIXES = [
  'file://',
  'ph://',
  'asset://',
  'data:',
  'content://',
  'assets-library://',
];

function isLocalUri(uri: string): boolean {
  return LOCAL_URI_PREFIXES.some((prefix) => uri.startsWith(prefix));
}

interface MediaLayerRef {
  layerId: string;
  field: string;
  currentUri: string;
  layerType: string;
}

function scanDocumentForLocalUris(doc: CreatorDocument): MediaLayerRef[] {
  const refs: MediaLayerRef[] = [];
  for (const page of doc.pages) {
    for (const layer of page.layers) {
      if (layer.type === 'media') {
        if (layer.payload.mediaUri && isLocalUri(layer.payload.mediaUri)) {
          refs.push({ layerId: layer.id, field: 'mediaUri', currentUri: layer.payload.mediaUri, layerType: 'media' });
        }
        if (layer.payload.thumbnailUri && isLocalUri(layer.payload.thumbnailUri)) {
          refs.push({ layerId: layer.id, field: 'thumbnailUri', currentUri: layer.payload.thumbnailUri, layerType: 'media' });
        }
      }
      if (layer.type === 'product' && layer.payload.snapshotImageUrl) {
        if (isLocalUri(layer.payload.snapshotImageUrl)) {
          refs.push({ layerId: layer.id, field: 'snapshotImageUrl', currentUri: layer.payload.snapshotImageUrl, layerType: 'product' });
        }
      }
      if (layer.type === 'look' && layer.payload.snapshotImageUrl) {
        if (isLocalUri(layer.payload.snapshotImageUrl)) {
          refs.push({ layerId: layer.id, field: 'snapshotImageUrl', currentUri: layer.payload.snapshotImageUrl, layerType: 'look' });
        }
      }
    }
  }
  return refs;
}

function replaceUriInDoc(
  doc: CreatorDocument,
  layerId: string,
  field: string,
  uploaded: UploadedMedia,
): CreatorDocument {
  const newUri = uploaded.publicUrl;
  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer): CreatorLayer => {
        if (layer.id !== layerId) return layer;
        if (layer.type === 'media' && (field === 'mediaUri' || field === 'thumbnailUri')) {
          const evidence = field === 'mediaUri'
            ? {
                mediaFinalizationId: uploaded.finalizationId,
                mediaAssetId: uploaded.mediaAssetId,
              }
            : {
                thumbnailFinalizationId: uploaded.finalizationId,
                thumbnailMediaAssetId: uploaded.mediaAssetId,
              };
          return { ...layer, payload: { ...layer.payload, [field]: newUri, ...evidence } };
        }
        if (layer.type === 'product' && field === 'snapshotImageUrl') {
          return {
            ...layer,
            payload: {
              ...layer.payload,
              snapshotImageUrl: newUri,
              snapshotMediaFinalizationId: uploaded.finalizationId,
              snapshotMediaAssetId: uploaded.mediaAssetId,
            },
          };
        }
        if (layer.type === 'look' && field === 'snapshotImageUrl') {
          return {
            ...layer,
            payload: {
              ...layer.payload,
              snapshotImageUrl: newUri,
              snapshotMediaFinalizationId: uploaded.finalizationId,
              snapshotMediaAssetId: uploaded.mediaAssetId,
            },
          };
        }
        return layer;
      }),
    })),
    updatedAt: new Date().toISOString(),
  };
}

export interface UploadProgress {
  completed: number;
  total: number;
  currentLayerId: string;
}

const MAX_RETRIES = 2;

// ── HEIC / HEIF / JPEG orientation normalization ────────────────────
//
// iOS captures portrait HEIC/HEIF images with an EXIF orientation tag
// rather than physically rotating the pixels. When these are uploaded
// raw, backends and CDNs that don't honour EXIF orientation serve them
// sideways. Re-encoding through expo-image-manipulator decodes the image
// (applying the EXIF rotation) and writes a clean JPEG with no rotation
// tag, guaranteeing correct orientation downstream.

const ORIENTATION_NORMALIZE_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/jpg',
]);

interface NormalizedImage {
  uri: string;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * Decode and re-encode an image through expo-image-manipulator to bake in
 * EXIF orientation. Returns the normalized image info, or `null` if
 * normalization was not applicable or failed (in which case the caller
 * proceeds with the original URI).
 */
async function normalizeOrientationIfNeeded(
  uri: string,
  mimeType: string,
): Promise<NormalizedImage | null> {
  if (!ORIENTATION_NORMALIZE_TYPES.has(mimeType)) return null;
  // data: URIs are not supported by expo-image-manipulator's native decoder.
  if (uri.startsWith('data:')) return null;
  try {
    const result = await manipulateAsync(uri, [], {
      compress: 1,
      format: SaveFormat.JPEG,
    });
    return {
      uri: result.uri,
      mimeType: 'image/jpeg',
      width: result.width,
      height: result.height,
    };
  } catch {
    // If the manipulator cannot handle the URI scheme or the image is
    // corrupt, fall back to the original — the upload may still succeed
    // and the backend can attempt its own orientation handling.
    return null;
  }
}

// ── MIME → file extension ────────────────────────────────────────────

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/mov': 'mov',
  'video/x-m4v': 'm4v',
};

function extForMime(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? 'jpg';
}

function generateUploadFileName(mimeType: string): string {
  const ext = extForMime(mimeType);
  return `media_${Date.now()}_${Math.floor(Math.random() * 1_000_000).toString(36)}.${ext}`;
}

// ── Probe + validate + prepare ───────────────────────────────────────

/**
 * Probe a local URI for its MIME type and byte size by fetching it as a
 * blob. `blob.type` is more reliable than extension parsing for `ph://`
 * and `content://` URIs which typically lack file extensions.
 */
async function probeBlob(
  uri: string,
): Promise<{ blob: Blob; mimeType: string }> {
  const blob = await fetch(uri).then((response) => response.blob());
  // Prefer blob.type when the platform provides a non-empty value;
  // otherwise fall back to extension-based inference.
  const mimeType = blob.type && blob.type.length > 0
    ? blob.type
    : inferMimeTypeFromUri(uri);
  return { blob, mimeType };
}

interface PreparedUpload {
  uploadUri: string;
  blob: Blob;
  asset: MediaUploadAsset;
}

/**
 * Prepare a single media reference for upload: probe MIME/size, normalise
 * EXIF orientation for HEIC/HEIF/JPEG images, then run full validation
 * (MIME, file size, min dimensions, max video duration). Throws a
 * descriptive error if validation fails.
 */
async function prepareAndValidateRef(
  ref: MediaLayerRef,
  options: MediaValidationOptions,
): Promise<PreparedUpload> {
  // 1. Probe the original URI for MIME + size.
  const { blob: originalBlob, mimeType: originalMime } = await probeBlob(ref.currentUri);
  const kind = resolveKind(originalMime);

  let uploadUri = ref.currentUri;
  let blob = originalBlob;
  let mimeType = originalMime;
  let width: number | undefined;
  let height: number | undefined;

  // 2. Orientation normalization for images (HEIC/HEIF/JPEG).
  if (kind === 'image') {
    const normalized = await normalizeOrientationIfNeeded(ref.currentUri, originalMime);
    if (normalized) {
      uploadUri = normalized.uri;
      mimeType = normalized.mimeType;
      width = normalized.width;
      height = normalized.height;
      // Re-fetch the normalized image as a blob for upload.
      blob = await fetch(uploadUri).then((response) => response.blob());
    }
  }

  // 3. Build a MediaUploadAsset for validation.
  const asset: MediaUploadAsset = {
    id: ref.layerId,
    uri: uploadUri,
    fileName: generateUploadFileName(mimeType),
    mimeType,
    fileSize: blob.size,
    width,
    height,
    kind,
  };

  // 4. Validate — checks supported MIME, max file size, min dimensions,
  //    and max video duration (when the relevant fields are present).
  const result = validateMediaAssets([asset], [], options);
  if (!result.valid) {
    const messages = result.errors.map((e) => e.message).join('; ');
    throw new Error(
      `Media validation failed for layer ${ref.layerId} (${ref.field}): ${messages}`,
    );
  }

  return { uploadUri, blob, asset };
}

/**
 * Upload a prepared blob to the object store via presigned PUT, then
 * finalize with the backend so the object is verified and recorded.
 */
async function uploadPrepared(
  prepared: PreparedUpload,
  folder: string,
): Promise<UploadedMedia> {
  const { uploadUri, blob, asset } = prepared;
  const presign = await presignUpload(
    asset.fileName,
    asset.mimeType,
    folder,
    blob.size,
  );
  await uploadToPresignedUrl(presign.url, uploadUri, asset.mimeType, blob);
  return finalizePresignedMedia({
    presign,
    fileName: asset.fileName,
    folder,
  });
}

// ── Public API ────────────────────────────────────────────────────────

export async function uploadAllLocalMedia(
  doc: CreatorDocument,
  onProgress?: (progress: UploadProgress) => void,
  validationOptions?: MediaValidationOptions,
): Promise<CreatorDocument> {
  const refs = scanDocumentForLocalUris(doc);
  if (refs.length === 0) return doc;

  let workingDoc = doc;
  const cache = new Map<string, UploadedMedia>();
  const folder = doc.type === 'look' ? 'looks' : 'posters';

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    onProgress?.({ completed: i, total: refs.length, currentLayerId: ref.layerId });

    let uploaded: UploadedMedia;
    if (cache.has(ref.currentUri)) {
      uploaded = cache.get(ref.currentUri)!;
    } else {
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          // Validate + normalize orientation + upload in one pass.
          // Validation errors are not retryable — they will throw on
          // the first attempt and propagate immediately.
          const prepared = await prepareAndValidateRef(ref, validationOptions ?? {});
          uploaded = await uploadPrepared(prepared, folder);
          cache.set(ref.currentUri, uploaded);
          lastError = null;
          break;
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));
          // Validation failures are deterministic — do not retry.
          if (lastError.message.startsWith('Media validation failed')) {
            break;
          }
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          }
        }
      }
      if (lastError) {
        throw new Error(
          `Failed to upload media for layer ${ref.layerId} after ${MAX_RETRIES + 1} attempts: ${lastError.message}`,
        );
      }
      uploaded = cache.get(ref.currentUri)!;
    }

    workingDoc = replaceUriInDoc(workingDoc, ref.layerId, ref.field, uploaded);
  }

  onProgress?.({ completed: refs.length, total: refs.length, currentLayerId: '' });
  return workingDoc;
}

export function hasLocalUris(doc: CreatorDocument): boolean {
  return scanDocumentForLocalUris(doc).length > 0;
}
