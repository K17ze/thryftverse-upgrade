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

import {
  classifyLabels,
  type ModerationLabel,
  type ModerationOptions,
  type ModerationProvider,
  type ModerationResult,
  resolveThresholds,
} from './moderationProvider.js';

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
    Image: { S3Object?: { Bucket: string; Name: string }; Bytes?: never } | { Url?: string };
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
   * @param imageUrl - Public HTTPS or S3 pre-signed URL of the image.
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

    try {
      const command = new sdk.DetectModerationLabelsCommand({
        Image: { Url: imageUrl },
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
