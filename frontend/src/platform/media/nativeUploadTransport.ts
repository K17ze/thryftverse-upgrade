import { Platform } from 'react-native';
import {
  createAbortError,
  isAbortError,
  xhrPutFile,
  type XhrPutOptions,
} from './xhrUploadTransport';

export { createAbortError, isAbortError } from './xhrUploadTransport';
export type { XhrPutOptions } from './xhrUploadTransport';

/**
 * Native upload transport — expo-file-system `File.createUploadTask`.
 *
 * Unlike the XHR transport, the native task runs on a URLSession
 * `sessionType: 'background'` (iOS default) / always-background Android
 * session, so a suspended app does not kill the transfer — the OS completes
 * it and the promise resolves on resume. Progress and cancellation keep the
 * same contract as `xhrPutFile` (real bytes, AbortSignal, ETag return).
 *
 * Falls back to XHR when the native File API is unavailable (web, Expo Go
 * without the module, or construction failures) so callers get a single
 * `putFile` dispatcher with identical semantics everywhere.
 */

let FileCtor: (typeof import('expo-file-system'))['File'] | null | undefined;
let UploadTypeEnum: (typeof import('expo-file-system'))['UploadType'] | undefined;

function loadNativeApi(): boolean {
  if (FileCtor !== undefined) return FileCtor != null;
  if (Platform.OS === 'web') {
    FileCtor = null;
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-file-system') as typeof import('expo-file-system');
    FileCtor = typeof mod.File === 'function' ? mod.File : null;
    UploadTypeEnum = mod.UploadType;
  } catch {
    FileCtor = null;
  }
  return FileCtor != null;
}

/** True when the native background-session transport is usable. */
export function isNativeUploadAvailable(): boolean {
  return loadNativeApi();
}

/**
 * PUT `fileUri` to `url`. Same contract as {@link xhrPutFile}: resolves the
 * response ETag (or null), throws on non-2xx/abort/timeout.
 */
export async function putFile(
  url: string,
  fileUri: string,
  mimeType: string,
  opts?: XhrPutOptions,
): Promise<string | null> {
  if (!loadNativeApi() || opts?.blob !== undefined) {
    return xhrPutFile(url, fileUri, mimeType, opts);
  }

  const timeoutMs = opts?.timeoutMs ?? 120_000;
  let file: InstanceType<NonNullable<typeof FileCtor>>;
  try {
    file = new FileCtor!(fileUri);
  } catch {
    // content://, ph://, or otherwise unsupported URI — XHR handles the
    // same locations via send({ uri }).
    return xhrPutFile(url, fileUri, mimeType, opts);
  }

  // The upload task's `signal` option handles user cancellation; a watchdog
  // preserves the XHR transport's stall-safety property (a hung socket must
  // fail the job so retry logic can run, not block the queue forever).
  const controller = new AbortController();
  let timedOut = false;
  const onUserAbort = () => controller.abort();
  if (opts?.signal?.aborted) throw createAbortError();
  opts?.signal?.addEventListener('abort', onUserAbort, { once: true });
  const watchdog = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const task = file.createUploadTask(url, {
      httpMethod: 'PUT',
      uploadType: UploadTypeEnum?.BINARY_CONTENT,
      mimeType,
      sessionType: 'background',
      signal: controller.signal,
      headers: opts?.headers,
      onProgress: ({ bytesSent, totalBytes }) => {
        opts?.onProgress?.(bytesSent, totalBytes);
      },
    });
    const result = await task.uploadAsync();
    if (result.status >= 200 && result.status < 300) {
      const etag = result.headers['ETag'] ?? result.headers['etag'] ?? null;
      return etag;
    }
    const error = new Error(`Upload PUT failed: HTTP ${result.status}`) as Error & { status?: number };
    error.status = result.status;
    throw error;
  } catch (err) {
    if (timedOut) throw new Error('Upload timed out');
    if (opts?.signal?.aborted || isAbortError(err)) throw createAbortError();
    throw err;
  } finally {
    clearTimeout(watchdog);
    opts?.signal?.removeEventListener('abort', onUserAbort);
  }
}
