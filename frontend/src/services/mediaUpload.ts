import { fetchJson } from '../lib/apiClient';

export interface PresignResponse {
  bucket: string;
  key: string;
  url: string;
  publicUrl: string;
}

export async function presignUpload(
  fileName: string,
  contentType: string,
  folder = 'uploads'
): Promise<PresignResponse> {
  return fetchJson<PresignResponse>('/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, contentType, folder }),
  });
}

export async function uploadToPresignedUrl(
  presignedUrl: string,
  fileUri: string,
  contentType: string
): Promise<void> {
  // In React Native, we need to read the file as blob/arraybuffer and PUT it
  // For Expo, we'll use fetch with the file URI
  const response = await fetch(fileUri);
  const blob = await response.blob();

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

export async function uploadMedia(fileUri: string, folder = 'uploads'): Promise<string> {
  const ext = fileUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const contentType =
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

  const fileName = `media_${Date.now()}.${ext}`;
  const presign = await presignUpload(fileName, contentType, folder);
  await uploadToPresignedUrl(presign.url, fileUri, contentType);
  return presign.publicUrl;
}