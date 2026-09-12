/**
 * uploadRemoteGroupPreset — turns a curated remote aesthetic preset into a
 * real persisted upload.
 *
 * The group create/edit API requires a `finalizationId` receipt for avatar
 * and cover-photo strings, so a bare remote URL can never be persisted.
 * This helper downloads the remote image to the cache directory, runs it
 * through the standard `uploadMedia` pipeline (which returns the receipt),
 * then deletes the cache copy.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { uploadMedia, type UploadedMedia } from '../../services/mediaUpload';

export async function uploadRemoteGroupPreset(
  remoteUri: string,
  target: 'avatar' | 'cover',
): Promise<UploadedMedia> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('Temporary storage is unavailable on this device.');
  }
  const destination = `${cacheDir}group-preset-${target}-${Date.now()}.jpg`;
  const downloaded = await FileSystem.downloadAsync(remoteUri, destination);
  try {
    return await uploadMedia(
      downloaded.uri,
      target === 'avatar' ? 'avatars' : 'covers',
    );
  } finally {
    FileSystem.deleteAsync(downloaded.uri, { idempotent: true }).catch(
      () => undefined,
    );
  }
}
