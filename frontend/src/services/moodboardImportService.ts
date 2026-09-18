/**
 * moodboardImportService — device-media → moodboard item orchestration.
 *
 * Pure orchestration, no React. For each picked asset:
 *   presign → PUT → finalize → POST /moodboards/:id/items { source: 'media' }
 *
 * `uploadMedia` does not expose `scopeRefId`, so the pipeline is composed
 * from the same primitives it uses (`presignUpload`, `uploadToPresignedUrl`,
 * `finalizePresignedMedia`) with folder 'moodboards' and scopeRefId = the
 * board id — the backend verifies the object through the finalization
 * receipt before the item can reference it.
 *
 * Stage reporting is honest (AGENTS.md §11): 'preparing' covers the
 * size/MIME probe, 'uploading' covers the PUT (real byte progress is
 * forwarded when the transport reports it), 'finalizing' covers backend
 * verification + the item add, 'added' is reported only after the server
 * has accepted the item. No fabricated percentages.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import {
  presignUpload,
  uploadToPresignedUrl,
  finalizePresignedMedia } from './mediaUpload';
import { addItemToMoodboard, type MoodboardItem } from './moodboardApi';
import { inferMimeTypeFromUri, resolveKind } from '../utils/mediaUploadAsset';
import { createStableId } from '../utils/createStableId';
import type { SelectedAsset } from '../creator/tools/MediaBrowser/mediaBrowserTypes';

/** Upload folder accepted by the backend for moodboard media. */
export const MOODBOARD_UPLOAD_FOLDER = 'moodboards';

/** Pipeline stages surfaced by the import tray — real work only. */
export type MoodboardImportStage = 'preparing' | 'uploading' | 'finalizing' | 'added';

/** Real byte progress during the 'uploading' stage — never synthesized. */
export interface MoodboardImportProgress {
  loadedBytes: number;
  totalBytes: number;
}

export type MoodboardImportStageHandler = (
  stage: MoodboardImportStage,
  progress?: MoodboardImportProgress,
) => void;

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

/**
 * Resolve the upload MIME type. inferMimeTypeFromUri falls back to
 * 'image/jpeg' when the extension is unrecognised — ph:// and content://
 * URIs often carry no extension at all — so its answer is trusted only
 * when it agrees with the picker's mediaType; otherwise a mediaType-correct
 * default is used.
 */
function resolveUploadMimeType(asset: SelectedAsset): string {
  const inferred = inferMimeTypeFromUri(asset.filename ?? asset.uri);
  if (resolveKind(inferred) === asset.mediaType) return inferred;
  return asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
}

/**
 * Resolve the real byte size for presign. Native uploads stream from disk
 * so only the byte count is needed; web must read a Blob to PUT one. The
 * Blob is returned when one was read so the PUT can reuse it. Throws when
 * no honest size can be determined — uploading unknown-size garbage is
 * worse than a clean failure.
 */
async function resolveUploadSize(
  fileUri: string,
): Promise<{ sizeBytes: number; blob?: Blob }> {
  if (Platform.OS === 'web') {
    const blob = await fetch(fileUri).then((response) => response.blob());
    return { sizeBytes: blob.size, blob };
  }
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists && typeof info.size === 'number' && info.size > 0) {
      return { sizeBytes: info.size };
    }
  } catch {
    // getInfoAsync may not support ph:// or content:// URIs — fall through
    // to the blob probe below.
  }
  try {
    const blob = await fetch(fileUri).then((response) => response.blob());
    if (blob.size > 0) {
      return { sizeBytes: blob.size, blob };
    }
  } catch {
    // fall through to the honest failure
  }
  throw new Error('Could not read this file. It may be inaccessible.');
}

/**
 * Upload one picked asset into the moodboards scope and add it to the
 * board as a media item. Throws on any failure so the caller can mark the
 * job failed — an unknown outcome is never reported as success.
 */
export async function importMoodboardAsset(
  moodboardId: string,
  asset: SelectedAsset,
  onStage?: MoodboardImportStageHandler,
): Promise<MoodboardItem | null> {
  if (!moodboardId) {
    throw new Error('The moodboard is not ready yet.');
  }
  if (!asset || (asset.mediaType !== 'image' && asset.mediaType !== 'video')) {
    throw new Error('Only image and video files can be added.');
  }
  if (!asset.uri || asset.uri.trim().length === 0) {
    throw new Error('This file has no readable source.');
  }

  onStage?.('preparing');
  const contentType = resolveUploadMimeType(asset);
  const { sizeBytes, blob } = await resolveUploadSize(asset.uri);
  const fileName =
    asset.filename ??
    `moodboard_${createStableId()}.${MIME_TO_EXT[contentType] ?? 'jpg'}`;

  const presign = await presignUpload(
    fileName,
    contentType,
    MOODBOARD_UPLOAD_FOLDER,
    sizeBytes,
  );

  onStage?.('uploading');
  await uploadToPresignedUrl(presign.url, asset.uri, contentType, blob, {
    // Forward the transport's real byte counters only — no fake percent.
    onProgress: (loadedBytes, totalBytes) =>
      onStage?.('uploading', { loadedBytes, totalBytes }),
  });

  onStage?.('finalizing');
  const uploaded = await finalizePresignedMedia({
    presign,
    fileName,
    folder: MOODBOARD_UPLOAD_FOLDER,
    scopeRefId: moodboardId,
  });

  const item = await addItemToMoodboard(moodboardId, {
    source: 'media',
    mediaFinalizationId: uploaded.finalizationId,
    mediaType: asset.mediaType,
    aspectRatio:
      asset.width != null && asset.height != null && asset.height > 0
        ? asset.width / asset.height
        : undefined,
    title: asset.filename,
  });

  onStage?.('added');
  return item;
}
