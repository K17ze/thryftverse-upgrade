/**
 * AWS Rekognition content moderation provider.
 *
 * Wraps `DetectModerationLabelsCommand` from `@aws-sdk/client-rekognition` to
 * evaluate images against Amazon's managed content-safety model. Best suited
 * for image moderation at ~$0.001 per image.
 *
 * The AWS SDK is lazy-loaded on first use so that the module can be imported in
 * environments without AWS credentials or the `@aws-sdk/client-rekognition`
 * package installed (e.g. local development with the mock provider). If the SDK
 * cannot be loaded or credentials are missing, every call returns a `failed`
 * result rather than throwing.
 *
 * Configuration is read from environment variables:
 * - `AWS_REGION` — AWS region hosting the Rekognition service.
 * - `AWS_ACCESS_KEY_ID` — IAM access key with `rekognition:DetectModerationLabels`.
 * - `AWS_SECRET_ACCESS_KEY` — IAM secret key.
 *
 * @packageDocumentation
 */

import { config } from '../../config.js';
import {
  classifyLabels,
  type ModerationLabel,
  type ModerationOptions,
  type ModerationProvider,
  type ModerationResult,
  resolveThresholds,
} from './moderationProvider.js';
import { fetchPinnedRemoteMedia } from '../safeRemoteMediaFetch.js';
import { sniffMimeType } from '../media/remoteImport.js';

/**
 * Rekognition category names mapped to ThryftVerse's coarse
 * {@link ModerationLabel["category"]} taxonomy.
 *
 * The mapping covers every top-level moderation label family returned by
 * `DetectModerationLabels` as of the Rekognition API (2024). Unknown names fall
 * back to `'other'`.
 */
const REKOGNITION_CATEGORY_MAP: ReadonlyMap<string, ModerationLabel['category']> = new Map([
  ['Explicit Nudity', 'nudity'],
  ['Suggestive', 'nudity'],
  ['Violence', 'violence'],
  ['Visually Disturbing', 'violence'],
  ['Hate Symbols', 'hate'],
  ['Drugs', 'drugs'],
  ['Tobacco', 'drugs'],
  ['Alcohol', 'alcohol'],
  ['Gambling', 'other'],
  ['Weapons', 'weapon'],
  ['Insults', 'hate'],
  ['Swastika', 'hate'],
  ['Middle Finger', 'other'],
]);

/**
 * Type describing the subset of the AWS SDK we depend on. Keeping this local
 * avoids importing the (optional) package at module load time.
 */
interface RekognitionClientLike {
  send(command: unknown): Promise<unknown>;
}

interface DetectModerationLabelsCommandLike {
  new (input: {
    // AWS Rekognition accepts ONLY Bytes (≤5MB blob) or S3Object — there is
    // no Image.Url member in the DetectModerationLabels API.
    Image:
      | { Bytes: Uint8Array }
      | { S3Object: { Bucket: string; Name: string; Version?: string } };
    MinConfidence?: number;
  }): unknown;
}

interface RekognitionSdk {
  RekognitionClient: new (config: {
    region: string;
    credentials: { accessKeyId: string; secretAccessKey: string };
  }) => RekognitionClientLike;
  DetectModerationLabelsCommand: DetectModerationLabelsCommandLike;
}

interface RekognitionModerationLabel {
  Name?: string;
  Confidence?: number;
  ParentName?: string;
  TaxonomyLevel?: string;
}

interface DetectModerationLabelsOutput {
  ModerationLabels?: RekognitionModerationLabel[];
  ModerationModelVersion?: string;
}

/** Cached lazy-loaded SDK module and client. */
let sdkCache: { sdk: RekognitionSdk; client: RekognitionClientLike } | null = null;
let sdkLoadAttempted = false;

/**
 * Test seam — injects a stub for the lazy-loaded SDK pair so unit tests can
 * assert the outgoing `DetectModerationLabels` request shape without AWS
 * credentials, the optional package, or network. Production code never
 * calls this. Pass `null` to restore lazy loading.
 *
 * @internal
 */
export function __setRekognitionSdkForTests(
  stub: { sdk: RekognitionSdk; client: RekognitionClientLike } | null,
): void {
  sdkCache = stub;
  sdkLoadAttempted = stub !== null;
}

/**
 * Attempt to dynamically import `@aws-sdk/client-rekognition` and build a
 * configured client. Returns `null` when the package is absent or credentials
 * are missing so that callers can degrade to a `failed` result.
 */
async function loadRekognitionSdk(): Promise<{
  sdk: RekognitionSdk;
  client: RekognitionClientLike;
} | null> {
  if (sdkCache) {
    return sdkCache;
  }
  if (sdkLoadAttempted) {
    return null;
  }
  sdkLoadAttempted = true;

  const region = process.env.AWS_REGION?.trim();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

  if (!region || !accessKeyId || !secretAccessKey) {
    return null;
  }

  try {
    // Dynamic import keeps the optional peer dependency out of the module
    // graph when it is not installed. The specifier is intentionally
    // non-literal so TypeScript does not statically resolve (and fail on) a
    // package that may be absent in development.
    const specifier = '@aws-sdk/client-rekognition';
    const mod = (await import(specifier)) as Partial<RekognitionSdk>;
    if (!mod.RekognitionClient || !mod.DetectModerationLabelsCommand) {
      return null;
    }
    const sdk = mod as RekognitionSdk;
    const client = new sdk.RekognitionClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    sdkCache = { sdk, client };
    return sdkCache;
  } catch {
    return null;
  }
}

/**
 * Map a Rekognition label name to a ThryftVerse category.
 */
function mapCategory(name: string): ModerationLabel['category'] {
  const direct = REKOGNITION_CATEGORY_MAP.get(name);
  if (direct) {
    return direct;
  }
  const lower = name.toLowerCase();
  if (lower.includes('nud') || lower.includes('suggestiv')) {
    return 'nudity';
  }
  if (lower.includes('viol') || lower.includes('gore') || lower.includes('disturb')) {
    return 'violence';
  }
  if (lower.includes('hate') || lower.includes('swastika') || lower.includes('insult')) {
    return 'hate';
  }
  if (lower.includes('drug') || lower.includes('tobacco') || lower.includes('cannabis')) {
    return 'drugs';
  }
  if (lower.includes('alcohol') || lower.includes('drink')) {
    return 'alcohol';
  }
  if (lower.includes('weapon') || lower.includes('gun') || lower.includes('knife')) {
    return 'weapon';
  }
  if (lower.includes('self') && lower.includes('harm')) {
    return 'self_harm';
  }
  return 'other';
}

/**
 * Normalise Rekognition's raw label list into ThryftVerse {@link ModerationLabel}s.
 */
function normaliseLabels(
  raw: RekognitionModerationLabel[] | undefined,
): ModerationLabel[] {
  if (!raw || raw.length === 0) {
    return [];
  }
  const labels: ModerationLabel[] = [];
  for (const entry of raw) {
    const name = entry.Name?.trim();
    if (!name) {
      continue;
    }
    const confidence = entry.Confidence !== undefined ? entry.Confidence / 100 : 0;
    labels.push({
      name,
      confidence: Math.min(Math.max(confidence, 0), 1),
      category: mapCategory(name),
      parent: entry.ParentName?.trim() || undefined,
    });
  }
  return labels;
}

/**
 * Build a `failed` result with a consistent shape.
 */
function failedResult(error: string, processingTimeMs: number): ModerationResult {
  return {
    status: 'failed',
    confidence: 0,
    labels: [],
    provider: 'rekognition',
    modelVersion: 'unknown',
    processingTimeMs,
    error,
  };
}

// ---------------------------------------------------------------------------
// Image input resolution (B1)
// ---------------------------------------------------------------------------

/**
 * Rekognition `DetectModerationLabels` accepts image blobs up to 5 MB and
 * only JPEG/PNG encodings. Inputs outside that envelope are refused BEFORE
 * the API call with a classified `review` result — an input problem routes
 * to human triage, it is not a provider failure and must never retry-loop.
 */
const MAX_REKOGNITION_IMAGE_BYTES = 5 * 1024 * 1024;
const REKOGNITION_SUPPORTED_MIME: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
]);

/** Upper bound used when streaming an S3 object body to bytes. */
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

/**
 * A `review` result produced by input preflight — classified, not a
 * provider error, so callers route the asset to human review rather than
 * scheduling a pointless provider retry.
 */
function inputPreflightResult(reason: string, processingTimeMs: number): ModerationResult {
  return {
    status: 'review',
    confidence: 1,
    labels: [{ name: reason, confidence: 1, category: 'other' }],
    provider: 'rekognition',
    modelVersion: 'input-preflight',
    processingTimeMs,
  };
}

type ImageReference =
  | { kind: 's3object'; bucket: string; key: string }
  | { kind: 'bytes'; bytes: Buffer }
  | { kind: 'result'; result: ModerationResult };

/**
 * Detect whether `imageUrl` points at an object in the app's own
 * S3-compatible store. Recognises the canonical public URL form
 * (`{s3CdnBaseUrl}/{bucket}/{key}` — see `publicObjectUrl` in lib/s3.ts)
 * plus path-style and virtual-hosted URLs against the configured S3
 * endpoints (pre-signed upload URLs).
 */
function resolveOwnS3Object(imageUrl: string): { bucket: string; key: string } | null {
  const bucket = config.s3Bucket;
  if (!bucket) {
    return null;
  }

  // 1. Canonical public URL: {cdnBase}/{bucket}/{key}. The key segment is
  //    taken raw — publicObjectUrl concatenates the unencoded key.
  const cdnBase = config.s3CdnBaseUrl.replace(/\/+$/, '');
  if (imageUrl.startsWith(`${cdnBase}/${bucket}/`)) {
    const key = imageUrl.slice(cdnBase.length + bucket.length + 2);
    return key.length > 0 ? { bucket, key } : null;
  }

  // 2. Endpoint URLs (e.g. pre-signed): match the configured S3 endpoints.
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return null;
  }
  for (const endpoint of [config.s3Endpoint, config.s3PublicEndpoint]) {
    let ep: URL;
    try {
      ep = new URL(endpoint);
    } catch {
      continue;
    }
    // Path-style: same host, path begins /{bucket}/{key}.
    if (parsed.host === ep.host && parsed.pathname.startsWith(`/${bucket}/`)) {
      const key = parsed.pathname.slice(bucket.length + 2);
      return key.length > 0 ? { bucket, key } : null;
    }
    // Virtual-hosted: {bucket}.{endpoint-host}/{key}.
    if (parsed.host === `${bucket}.${ep.host}`) {
      const key = parsed.pathname.replace(/^\/+/, '');
      return key.length > 0 ? { bucket, key } : null;
    }
  }
  return null;
}

/** Minimal structural subset of the S3 client used for preflight/fallback. */
interface S3Like {
  send(command: unknown): Promise<unknown>;
}

async function loadInternalS3(): Promise<S3Like | null> {
  try {
    const mod = (await import('../s3.js')) as { internalS3?: S3Like };
    return mod.internalS3 ?? null;
  } catch {
    return null;
  }
}

interface S3HeadOutput {
  ContentLength?: number;
  ContentType?: string;
}

/**
 * HeadObject preflight for own-store references. Returns an input-classified
 * `review` result when the object violates the Rekognition input envelope,
 * `null` when the object is verifiably acceptable for `Image.S3Object`, or
 * `'fetch_bytes'` when the envelope cannot be verified from headers —
 * unavailable S3, failed HeadObject, unknown Content-Length, or undeclared
 * Content-Type. The caller then reads the body itself (bounded at 5 MB) and
 * sniffs the type, so an unverifiable object is never passed to the
 * provider unchecked.
 */
async function preflightS3Object(
  bucket: string,
  key: string,
): Promise<ModerationResult | 'fetch_bytes' | null> {
  const s3 = await loadInternalS3();
  if (!s3) {
    return 'fetch_bytes';
  }
  try {
    const specifier = '@aws-sdk/client-s3';
    const { HeadObjectCommand } = (await import(specifier)) as {
      HeadObjectCommand: new (input: { Bucket: string; Key: string }) => unknown;
    };
    const head = (await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    )) as S3HeadOutput;
    if (
      typeof head.ContentLength === 'number'
      && head.ContentLength > MAX_REKOGNITION_IMAGE_BYTES
    ) {
      return inputPreflightResult('input_exceeds_5mb_limit', 0);
    }
    const declaredType = head.ContentType?.split(';')[0]?.trim().toLowerCase();
    if (declaredType && !REKOGNITION_SUPPORTED_MIME.has(declaredType)) {
      return inputPreflightResult('unsupported_media_type', 0);
    }
    if (
      typeof head.ContentLength !== 'number'
      || !declaredType
    ) {
      // Size or type unverifiable from headers — hold the S3Object path and
      // fall back to a bounded byte fetch + magic-byte sniff instead of
      // letting an unchecked object reach the provider.
      return 'fetch_bytes';
    }
    return null;
  } catch {
    return 'fetch_bytes';
  }
}

/**
 * Read an own-store object body into a bounded buffer. Used as a fallback
 * when Rekognition cannot consume `Image.S3Object` (e.g. the media store is
 * an S3-compatible service Rekognition has no network path to).
 */
async function readOwnObjectBytes(
  bucket: string,
  key: string,
): Promise<Buffer | null> {
  const s3 = await loadInternalS3();
  if (!s3) {
    return null;
  }
  try {
    const specifier = '@aws-sdk/client-s3';
    const { GetObjectCommand } = (await import(specifier)) as {
      GetObjectCommand: new (input: { Bucket: string; Key: string }) => unknown;
    };
    const output = (await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    )) as { Body?: AsyncIterable<Uint8Array> | { transformToByteArray?: () => Promise<Uint8Array> } };
    const body = output.Body;
    if (!body) {
      return null;
    }
    // SDK v3 node runtime exposes transformToByteArray; fall back to manual
    // iteration for stream-like bodies.
    if (typeof (body as { transformToByteArray?: unknown }).transformToByteArray === 'function') {
      const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
      if (bytes.byteLength > MAX_REKOGNITION_IMAGE_BYTES) {
        return null;
      }
      return Buffer.from(bytes);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength;
      if (total > MAX_REKOGNITION_IMAGE_BYTES) {
        return null;
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, total);
  } catch {
    return null;
  }
}

/** Failure codes from the shared transport that are permanent input
 *  problems (classified review) rather than transient provider errors. */
const INPUT_FAILURE_CODES = new Set([
  'invalid_url',
  'blocked_scheme',
  'host_not_allowed',
  'url_credentials',
  'ssrf_blocked',
  'dns_unresolved',
  'too_many_redirects',
  'redirect_without_location',
  'content_too_large',
  'empty_body',
]);

/**
 * Resolve `imageUrl` into a Rekognition-compatible image reference.
 *
 * - Own-store objects → `Image.S3Object{Bucket, Name}` (real bucket/key).
 * - Everything else → bytes fetched through the shared SSRF-pinned
 *   transport, bounded at 5 MB, then `Image.Bytes`.
 *
 * Input violations (>5 MB, non-JPEG/PNG, unfetchable/SSRF-blocked sources)
 * return a classified `review` result instead of a provider error.
 */
async function resolveImageReference(
  imageUrl: string,
  startedAt: number,
): Promise<ImageReference> {
  const own = resolveOwnS3Object(imageUrl);
  if (own) {
    const preflight = await preflightS3Object(own.bucket, own.key);
    if (preflight === 'fetch_bytes') {
      // Envelope unverifiable from headers — read the body ourselves with
      // the same 5 MB bound and decide the type from magic bytes. Nothing
      // unverified is passed to the provider as S3Object.
      const bytes = await readOwnObjectBytes(own.bucket, own.key);
      if (!bytes || bytes.length === 0) {
        return {
          kind: 'result',
          result: inputPreflightResult(
            'unverifiable_own_store_object',
            Date.now() - startedAt,
          ),
        };
      }
      const sniffed = sniffMimeType(bytes);
      if (!sniffed || !REKOGNITION_SUPPORTED_MIME.has(sniffed)) {
        return {
          kind: 'result',
          result: inputPreflightResult(
            sniffed ? 'unsupported_media_type' : 'unverifiable_media_type',
            Date.now() - startedAt,
          ),
        };
      }
      return { kind: 'bytes', bytes };
    }
    if (preflight) {
      return { kind: 'result', result: preflight };
    }
    return { kind: 's3object', bucket: own.bucket, key: own.key };
  }

  // External URL — fetch the bytes ourselves through the pinned transport.
  // (The former Image.Url member does not exist in the Rekognition API.)
  const fetched = await fetchPinnedRemoteMedia({
    url: imageUrl,
    maxBytes: MAX_REKOGNITION_IMAGE_BYTES,
    timeoutMs: IMAGE_FETCH_TIMEOUT_MS,
  });
  if (!fetched.ok) {
    if (INPUT_FAILURE_CODES.has(fetched.code)) {
      return {
        kind: 'result',
        result: inputPreflightResult(
          `input_unfetchable:${fetched.code}`,
          Date.now() - startedAt,
        ),
      };
    }
    // Transient transport failure — surfaced as a provider failure so the
    // caller's retry path can re-attempt.
    return {
      kind: 'result',
      result: failedResult(
        `image fetch failed (${fetched.code}): ${fetched.message}`,
        Date.now() - startedAt,
      ),
    };
  }

  // Magic bytes are the ONLY trusted signal — a forged Content-Type header
  // must never substitute for an unverifiable body. When the sniff is
  // indecisive the input is held for review, not sent to the provider.
  const mime = fetched.sniffedContentType;
  if (!mime || !REKOGNITION_SUPPORTED_MIME.has(mime)) {
    return {
      kind: 'result',
      result: inputPreflightResult(
        mime ? 'unsupported_media_type' : 'unverifiable_media_type',
        Date.now() - startedAt,
      ),
    };
  }
  return { kind: 'bytes', bytes: fetched.buffer };
}

/** True when a provider error suggests S3Object is unreadable and a
 *  byte-fetch fallback is worth one retry. */
function isS3ObjectAccessError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /s3object|s3 object|accessdenied|nosuchkey|invalids3/i.test(text);
}

/**
 * AWS Rekognition implementation of {@link ModerationProvider}.
 *
 * Image moderation uses `DetectModerationLabels`. Text moderation is not
 * supported by Rekognition's content-safety API, so `moderateText` returns a
 * `failed` result directing callers to a text-capable provider (Sightengine).
 */
export class RekognitionModerationProvider implements ModerationProvider {
  readonly name = 'rekognition';

  /**
   * Moderate an image via Rekognition `DetectModerationLabels`.
   *
   * The request carries `Image.S3Object` when the URL resolves to the app's
   * own S3-compatible store, otherwise `Image.Bytes` fetched through the
   * SSRF-pinned transport (bounded at the 5 MB Rekognition blob limit).
   * Inputs outside the supported envelope (>5 MB, non-JPEG/PNG, unfetchable)
   * are refused before the API call with a classified `review` result.
   *
   * @param imageUrl - Public HTTPS or S3 URL of the image.
   * @param options - Optional threshold overrides.
   * @returns A {@link ModerationResult}. Returns `failed` when the SDK is
   *   unavailable, credentials are missing, or the API call errors.
   */
  async moderateImage(
    imageUrl: string,
    options?: ModerationOptions,
  ): Promise<ModerationResult> {
    const startedAt = Date.now();
    const { threshold, reviewThreshold } = resolveThresholds(options);

    const loaded = await loadRekognitionSdk();
    if (!loaded) {
      return failedResult(
        'AWS Rekognition SDK is not installed or AWS credentials are not configured',
        Date.now() - startedAt,
      );
    }
    const { sdk, client } = loaded;

    const reference = await resolveImageReference(imageUrl, startedAt);
    if (reference.kind === 'result') {
      return reference.result;
    }

    const sendDetection = async (
      image:
        | { Bytes: Uint8Array }
        | { S3Object: { Bucket: string; Name: string; Version?: string } },
    ): Promise<ModerationResult> => {
      const command = new sdk.DetectModerationLabelsCommand({
        Image: image,
        MinConfidence: Math.round(reviewThreshold * 100),
      });
      const output = (await client.send(command)) as DetectModerationLabelsOutput;
      const labels = normaliseLabels(output.ModerationLabels);
      const status = classifyLabels(labels, threshold, reviewThreshold);
      const maxConfidence = labels.reduce((max, label) => Math.max(max, label.confidence), 0);
      return {
        status,
        confidence: maxConfidence,
        labels,
        provider: this.name,
        modelVersion: output.ModerationModelVersion ?? 'unknown',
        processingTimeMs: Date.now() - startedAt,
      };
    };

    try {
      if (reference.kind === 's3object') {
        try {
          return await sendDetection({
            S3Object: { Bucket: reference.bucket, Name: reference.key },
          });
        } catch (error) {
          // Rekognition can only read real AWS S3. When the media store is
          // S3-compatible but unreachable for AWS (e.g. MinIO), fall back to
          // fetching the bytes ourselves and resubmitting as Image.Bytes.
          if (!isS3ObjectAccessError(error)) {
            throw error;
          }
          const bytes = await readOwnObjectBytes(reference.bucket, reference.key);
          if (!bytes || bytes.length === 0) {
            return inputPreflightResult(
              'unfetchable_own_store_object',
              Date.now() - startedAt,
            );
          }
          const mime = sniffMimeType(bytes);
          if (!mime || !REKOGNITION_SUPPORTED_MIME.has(mime)) {
            return inputPreflightResult('unsupported_media_type', Date.now() - startedAt);
          }
          return await sendDetection({ Bytes: bytes });
        }
      }
      return await sendDetection({ Bytes: reference.bytes });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Rekognition API call failed';
      return failedResult(message, Date.now() - startedAt);
    }
  }

  /**
   * Rekognition does not provide text moderation.
   *
   * @returns A `failed` result indicating text moderation is unsupported.
   */
  moderateText(_text: string, _options?: ModerationOptions): Promise<ModerationResult> {
    return Promise.resolve(
      failedResult(
        'AWS Rekognition does not support text moderation; use the Sightengine provider',
        0,
      ),
    );
  }
}
