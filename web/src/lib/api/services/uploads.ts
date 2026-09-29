/**
 * Web uploads service — mirrors the mobile mediaUpload flow
 * (frontend/src/services/mediaUpload.ts).
 *
 * The backend contract (backend/api/src/routes/uploads.ts):
 *
 *   POST /uploads/presign
 *     body:  { fileName, contentType, sizeBytes, folder }
 *     reply: { uploadIntentId, bucket, key, url, publicUrl, contentType,
 *              sizeBytes, maxSizeBytes, expiresInSeconds, expiresAt }
 *     `url` is the signed PUT target — the bytes go straight to storage.
 *
 *   POST /uploads/finalize
 *     body:  { objectKey, bucket, fileName, contentType, sizeBytes,
 *              publicUrl, folder, scope, scopeRefId?, metadata?, verifyObject }
 *     reply: { ok, finalization: { id, publicUrl, status, mediaAsset, … } }
 *     `finalization.id` is the durable receipt other surfaces reference
 *     (listing cover + /listing-images attachments require it).
 */

import { fetchJson } from '../http';

/** The backend `folder` enum — presign rejects anything outside it. */
export type UploadFolder =
  | 'uploads'
  | 'listings'
  | 'avatars'
  | 'covers'
  | 'posters'
  | 'looks'
  | 'moodboards'
  | 'evidence'
  | 'review'
  | 'smoke'
  | 'voice';

/** The backend finalize `scope` enum — what the upload will be used for. */
export type FinalizeScope =
  | 'general'
  | 'chat_attachment'
  | 'listing_media'
  | 'avatar'
  | 'cover'
  | 'poster'
  | 'look'
  | 'evidence'
  | 'review'
  | 'voice';

export interface PresignResponse {
  uploadIntentId: string;
  bucket: string;
  /** Object key the intent binds — finalize references it as `objectKey`. */
  key: string;
  /** Signed PUT target for the file bytes. */
  url: string;
  /** Public object URL once the PUT lands. */
  publicUrl: string;
  /** Server-normalized content type — the PUT must send it verbatim. */
  contentType: string;
  sizeBytes: number;
  maxSizeBytes: number;
  expiresInSeconds: number;
  expiresAt: string;
}

export async function presignUpload(input: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  folder?: UploadFolder;
  signal?: AbortSignal;
}): Promise<PresignResponse> {
  return fetchJson<PresignResponse>(
    '/uploads/presign',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        folder: input.folder ?? 'uploads',
      }),
    },
    { signal: input.signal },
  );
}

export interface FinalizeUploadInput {
  objectKey: string;
  bucket?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  publicUrl: string;
  folder?: UploadFolder;
  scope?: FinalizeScope;
  scopeRefId?: string;
  metadata?: Record<string, unknown>;
  /** Leave true — the backend HEAD-verifies the object before trusting it. */
  verifyObject?: boolean;
  signal?: AbortSignal;
}

export interface MediaAssetReceipt {
  id: string;
  status: string;
  mediaKind: 'image' | 'video' | 'audio' | 'document';
  canonicalUrl: string | null;
  publishable?: boolean;
  /** Processor-measured post-orientation geometry — populated once the
   *  media pipeline runs; may be absent on the finalize receipt itself. */
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  /** Decodable BlurHash computed by the pipeline. */
  blurhash?: string | null;
}

export interface UploadFinalization {
  /** The durable receipt id — listing cover + attachments reference this. */
  id: string;
  objectKey: string;
  bucket: string;
  folder: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  publicUrl: string;
  status: 'pending' | 'finalized' | 'failed';
  failureReason?: string | null;
  scope?: string;
  scopeRefId?: string | null;
  headCheckedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  mediaAsset?: MediaAssetReceipt | null;
}

/**
 * Confirm a presigned PUT actually landed in object storage and record the
 * durable finalization. Throws on a non-finalized outcome — callers must
 * not proceed with the publicUrl when verification failed.
 */
export async function finalizeUpload(
  input: FinalizeUploadInput,
): Promise<UploadFinalization> {
  const payload = await fetchJson<{
    ok: boolean;
    error?: string;
    finalization?: UploadFinalization;
    mediaAsset?: MediaAssetReceipt | null;
  }>(
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
    },
    { signal: input.signal },
  );
  const finalization = payload.finalization;
  if (!payload.ok || !finalization) {
    throw new Error(payload.error ?? 'Upload could not be finalized');
  }
  if (finalization.status !== 'finalized') {
    throw new Error(
      `Upload finalization ${finalization.status}: ${finalization.failureReason ?? 'verification failed'}`,
    );
  }
  // The finalize route mirrors the asset receipt both on
  // `finalization.mediaAsset` and top-level `mediaAsset`.
  if (!finalization.mediaAsset && payload.mediaAsset) {
    finalization.mediaAsset = payload.mediaAsset;
  }
  return finalization;
}

/** What callers need once an upload has been verified server-side. */
export interface UploadedMedia {
  /** Canonical object URL — safe to store on listings/messages. */
  publicUrl: string;
  objectKey: string;
  /** Durable receipt id — required by /listings cover + /listing-images. */
  finalizationId: string;
  mediaAssetId: string | null;
  mediaKind: 'image' | 'video' | 'audio' | 'document' | null;
  /** Pipeline-measured geometry/blurhash when the receipt carries it. */
  width: number | null;
  height: number | null;
  blurhash: string | null;
  contentType: string;
  sizeBytes: number;
}

/** Call-site purpose → the backend's folder/scope pair. `listing` media
 *  must land in the 'listings' folder with scope 'listing_media' — the
 *  attach endpoints verify the finalization chain on those semantics. */
const PURPOSE_TARGETS: Record<string, { folder: UploadFolder; scope: FinalizeScope }> = {
  listing: { folder: 'listings', scope: 'listing_media' },
  listings: { folder: 'listings', scope: 'listing_media' },
  chat: { folder: 'uploads', scope: 'chat_attachment' },
  avatar: { folder: 'avatars', scope: 'avatar' },
  avatars: { folder: 'avatars', scope: 'avatar' },
  cover: { folder: 'covers', scope: 'cover' },
  covers: { folder: 'covers', scope: 'cover' },
  poster: { folder: 'posters', scope: 'poster' },
  posters: { folder: 'posters', scope: 'poster' },
  look: { folder: 'looks', scope: 'look' },
  looks: { folder: 'looks', scope: 'look' },
  evidence: { folder: 'evidence', scope: 'evidence' },
  review: { folder: 'review', scope: 'review' },
  voice: { folder: 'voice', scope: 'voice' },
};

function targetForPurpose(purpose: string): { folder: UploadFolder; scope: FinalizeScope } {
  return PURPOSE_TARGETS[purpose] ?? { folder: 'uploads', scope: 'general' };
}

/**
 * PUT the file bytes to the presigned target over XHR — the only transport
 * that exposes real upload byte progress. `onProgress` receives the
 * transmitted fraction 0..1, or null while the total is unknown (the caller
 * falls back to an indeterminate state — never a fabricated percentage).
 */
function putWithProgress(
  presigned: PresignResponse,
  file: File,
  onProgress: (ratio: number | null) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presigned.url);
    // Content-Type is a signed header — it must match the value the backend
    // signed (its normalized contentType), not necessarily file.type.
    xhr.setRequestHeader('Content-Type', presigned.contentType || file.type);
    xhr.upload.onprogress = (e) => {
      onProgress(e.lengthComputable && e.total > 0 ? e.loaded / e.total : null);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(file);
  });
}

/**
 * Full single-file upload: presign → PUT bytes → finalize. Mirrors mobile
 * `uploadMedia`. Resolves the durable upload receipt — the caller needs
 * `finalizationId` to reference the media from listing rows. Large videos
 * belong on the multipart flow (not yet ported) — the backend's per-type
 * size cap rejects them honestly at presign.
 *
 * Pass `onProgress` for real byte-level progress (0..1 of the PUT body);
 * the callback may receive null when the presigned target doesn't report a
 * total — callers should render that as indeterminate, not 0%.
 */
export async function uploadMediaFile(
  file: File,
  purpose = 'uploads',
  onProgress?: (ratio: number | null) => void,
  signal?: AbortSignal,
): Promise<UploadedMedia> {
  const target = targetForPurpose(purpose);
  const presigned = await presignUpload({
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    folder: target.folder,
    signal,
  });

  if (onProgress) {
    await putWithProgress(presigned, file, onProgress);
  } else {
    const put = await fetch(presigned.url, {
      method: 'PUT',
      headers: { 'Content-Type': presigned.contentType || file.type },
      body: file,
      signal,
    });
    if (!put.ok) {
      throw new Error(`Upload failed (${put.status})`);
    }
  }

  const finalization = await finalizeUpload({
    objectKey: presigned.key,
    bucket: presigned.bucket,
    fileName: file.name,
    contentType: presigned.contentType,
    sizeBytes: presigned.sizeBytes,
    publicUrl: presigned.publicUrl,
    folder: target.folder,
    scope: target.scope,
    verifyObject: true,
    signal,
  });

  return {
    publicUrl: finalization.publicUrl,
    objectKey: presigned.key,
    finalizationId: finalization.id,
    mediaAssetId: finalization.mediaAsset?.id ?? null,
    mediaKind: finalization.mediaAsset?.mediaKind ?? null,
    width: finalization.mediaAsset?.width ?? null,
    height: finalization.mediaAsset?.height ?? null,
    blurhash: finalization.mediaAsset?.blurhash ?? null,
    contentType: presigned.contentType,
    sizeBytes: presigned.sizeBytes,
  };
}

/**
 * Back-compat name kept for existing call sites — now resolves the full
 * {@link UploadedMedia} receipt instead of a bare URL so publishers can
 * chain the finalization id into listing writes.
 */
export const uploadImageFile = uploadMediaFile;
