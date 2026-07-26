import { fetchJson } from '../lib/apiClient';
import { MediaUploadAsset } from '../utils/mediaUploadAsset';

export interface PresignResponse {
  bucket: string;
  key: string;
  url: string;
  publicUrl: string;
  contentType: string;
  sizeBytes: number;
  maxSizeBytes: number;
  expiresInSeconds: number;
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
  status: 'pending' | 'finalized' | 'failed';
  scope: string;
  scopeRefId: string | null;
  headCheckedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

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
    }
  );
  return payload.finalization;
}

export interface UploadedMedia {
  publicUrl: string;
  objectKey: string;
  finalizationId: string;
  sizeBytes: number;
  contentType: string;
}

export async function uploadMedia(fileUri: string, folder?: string): Promise<UploadedMedia>;
export async function uploadMedia(asset: MediaUploadAsset, folder?: string): Promise<UploadedMedia>;
export async function uploadMedia(
  source: string | MediaUploadAsset,
  folder = 'uploads'
): Promise<UploadedMedia> {
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
  const finalization = await finalizeUpload({
    objectKey: presign.key,
    bucket: presign.bucket,
    fileName,
    contentType,
    sizeBytes: blob.size,
    publicUrl: presign.publicUrl,
    folder,
  });

  if (finalization.status !== 'finalized') {
    throw new Error(
      `Upload finalization ${finalization.status}: ${finalization.failureReason ?? 'unknown'}`
    );
  }

  return {
    publicUrl: presign.publicUrl,
    objectKey: presign.key,
    finalizationId: finalization.id,
    sizeBytes: blob.size,
    contentType,
  };
}
