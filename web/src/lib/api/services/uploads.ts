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
    xhr.open(presigned.method ?? 'PUT', presigned.uploadUrl);
    const headers = presigned.headers ?? { 'Content-Type': file.type };
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
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
 * Full single-file upload: presign → PUT bytes → finalize. Small images go
 * through this; large videos should use the multipart flow (out of scope
 * for the first sell-flow wiring pass).
 *
 * Pass `onProgress` for real byte-level progress (0..1 of the PUT body);
 * the callback may receive null when the presigned target doesn't report a
 * total — callers should render that as indeterminate, not 0%.
 */
export async function uploadImageFile(
  file: File,
  purpose = 'listing',
  onProgress?: (ratio: number | null) => void,
): Promise<string> {
  const presigned = await presignUpload({
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    purpose,
  });

  if (onProgress) {
    await putWithProgress(presigned, file, onProgress);
  } else {
    const put = await fetch(presigned.uploadUrl, {
      method: presigned.method ?? 'PUT',
      headers: presigned.headers ?? { 'Content-Type': file.type },
      body: file,
    });
    if (!put.ok) {
      throw new Error(`Upload failed (${put.status})`);
    }
  }

  const finalized = await finalizeUpload(presigned.uploadId);
  return finalized.url;
}
