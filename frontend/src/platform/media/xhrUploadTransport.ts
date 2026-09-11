import { Platform } from 'react-native';

/**
 * Shared XHR PUT transport for presigned object-store uploads.
 *
 * Extracted from creator/core/upload/UploadManager.ts so the listing queue
 * and profile uploads get the same real byte progress and abortable
 * cancellation as the creator flow. `xhr.upload.onprogress` reports actual
 * transmitted bytes; an AbortSignal hard-cancels the in-flight request.
 */

export interface XhrPutOptions {
  signal?: AbortSignal;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
  headers?: Record<string, string>;
  /** Pre-resolved file bytes — sent directly, skipping file resolution. */
  blob?: Blob;
  /** PUT timeout in ms. A hung request must not block the queue forever. */
  timeoutMs?: number;
}

/** Match what fetch() throws on abort so callers can detect cancellation by name. */
export function createAbortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('Upload aborted', 'AbortError');
  }
  const error = new Error('Upload aborted');
  error.name = 'AbortError';
  return error;
}

export function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError';
}

export async function xhrPutFile(
  url: string,
  fileUri: string,
  mimeType: string,
  opts?: XhrPutOptions
): Promise<string | null> {
  const signal = opts?.signal;
  if (signal?.aborted) throw createAbortError();

  // A caller-provided blob always takes precedence. Otherwise native streams
  // the file from disk via `send({ uri })` with no JS-memory copy; web must
  // resolve the URI to a Blob before it can be sent.
  const blob = opts?.blob ?? (Platform.OS !== 'web'
    ? undefined
    : await fetch(fileUri, { signal }).then((response) => response.blob()));

  return new Promise<string | null>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = opts?.timeoutMs ?? 120_000;
    let settled = false;
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mimeType);
    for (const [name, value] of Object.entries(opts?.headers ?? {})) {
      // The mimeType parameter owns Content-Type; XHR would merge duplicates.
      if (name.toLowerCase() === 'content-type') continue;
      xhr.setRequestHeader(name, value);
    }

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      xhr.upload.onprogress = null;
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      // S3 returns the part ETag in the `ETag` response header. Multipart
      // completion requires every part's ETag, so capture it here. Single-PUT
      // callers ignore the resolved value.
      const etag = xhr.getResponseHeader('ETag') ?? xhr.getResponseHeader('etag');
      resolve(etag);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    // Real byte progress — actual transmitted bytes / total bytes. Some RN
    // XHR implementations report lengthComputable=false for send({ uri })
    // file streams, so the event is always forwarded; consumers guard
    // against a zero total.
    xhr.upload.onprogress = (event) => {
      opts?.onProgress?.(event.loaded, event.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        succeed();
      } else {
        const error = new Error(`Upload PUT failed: HTTP ${xhr.status}`);
        (error as Error & { status?: number }).status = xhr.status;
        fail(error);
      }
    };

    xhr.onerror = () => fail(new Error('Network error during upload'));
    xhr.ontimeout = () => fail(new Error('Upload timed out'));

    const onAbort = () => {
      xhr.abort();
      fail(createAbortError());
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    if (blob !== undefined) {
      xhr.send(blob);
    } else {
      // `xhr.send({ uri })` streams the file natively in React Native.
      xhr.send({ uri: fileUri });
    }
  });
}
