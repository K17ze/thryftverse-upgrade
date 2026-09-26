/**
 * Web uploads service — mirrors the mobile mediaUpload flow.
 * `/uploads/presign` hands back a signed PUT target; the file goes straight
 * to storage, then `/uploads/finalize` registers the asset.
 */

import { fetchJson } from '../http';

export interface PresignResponse {
  ok: boolean;
  uploadId: string;
  uploadUrl: string;
  method?: string;
  headers?: Record<string, string>;
  publicUrl?: string;
}

export async function presignUpload(input: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  purpose?: string;
}): Promise<PresignResponse> {
  return fetchJson<PresignResponse>('/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function finalizeUpload(uploadId: string): Promise<{ url: string }> {
  const res = await fetchJson<{ ok: boolean; url?: string; publicUrl?: string }>(
    '/uploads/finalize',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId }),
    },
  );
  const url = res.url ?? res.publicUrl;
  if (!url) throw new Error('Upload finalized without a URL');
  return { url };
}

/**
 * Full single-file upload: presign → PUT bytes → finalize. Small images go
 * through this; large videos should use the multipart flow (out of scope
 * for the first sell-flow wiring pass).
 */
export async function uploadImageFile(
  file: File,
  purpose = 'listing',
): Promise<string> {
  const presigned = await presignUpload({
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    purpose,
  });

  const put = await fetch(presigned.uploadUrl, {
    method: presigned.method ?? 'PUT',
    headers: presigned.headers ?? { 'Content-Type': file.type },
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status})`);
  }

  const finalized = await finalizeUpload(presigned.uploadId);
  return finalized.url;
}
