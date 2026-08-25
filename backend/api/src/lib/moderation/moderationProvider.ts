/**
 * Content moderation provider contracts.
 *
 * The ThryftVerse media lifecycle state machine (`mediaLifecycle.ts`) expects an
 * external processor to resolve `moderation_pending` assets into `publishable`
 * or `rejected`. These interfaces decouple the moderation decision from any
 * specific vendor so that image moderation (AWS Rekognition) and text
 * moderation (Sightengine) can be swapped or composed without touching the
 * processing pipeline.
 *
 * @packageDocumentation
 */

/**
 * The outcome category that drives the media lifecycle transition.
 *
 * - `approved` — no policy violations detected; asset may transition to `publishable`.
 * - `review` — ambiguous signals; asset stays in `moderation_pending` for human review.
 * - `rejected` — a policy violation was detected above the auto-reject threshold.
 * - `failed` — the provider could not produce a decision (network error, auth
 *   failure, rate limit). The asset transitions to `processing_failed` and the
 *   job is retried with exponential backoff.
 */
export type ModerationStatus = 'approved' | 'review' | 'rejected' | 'failed';

/**
 * A normalised content-safety label emitted by a moderation provider.
 */
export interface ModerationLabel {
  /** Human-readable label name as returned (or derived) by the provider. */
  name: string;
  /** Provider confidence in the range 0–1. */
  confidence: number;
  /** Coarse ThryftVerse category used for policy aggregation and dashboards. */
  category:
    | 'nudity'
    | 'violence'
    | 'hate'
    | 'spam'
    | 'drugs'
    | 'alcohol'
    | 'weapon'
    | 'self_harm'
    | 'other';
  /** Optional parent label name for hierarchical provider taxonomies. */
  parent?: string;
}

/**
 * The full result of a single moderation call.
 */
export interface ModerationResult {
  status: ModerationStatus;
  /** Highest label confidence in the range 0–1, or 0 when no labels were returned. */
  confidence: number;
  labels: ModerationLabel[];
  /** Name of the provider that produced the result (e.g. `rekognition`). */
  provider: string;
  /** Provider-reported model or API version used for auditability. */
  modelVersion: string;
  /** Wall-clock processing time in milliseconds. */
  processingTimeMs: number;
  /** Present when `status` is `failed`, describing the underlying error. */
  error?: string;
}

/**
 * Per-call moderation options. Providers apply sensible defaults so that the
 * processing pipeline can call them without bespoke configuration.
 */
export interface ModerationOptions {
  /**
   * Confidence threshold above which a label triggers an automatic rejection.
   * Defaults to `0.8`.
   */
  threshold?: number;
  /**
   * Confidence threshold above which a label is routed to human review but
   * below the auto-reject threshold. Defaults to `0.5`.
   */
  reviewThreshold?: number;
}

/**
 * A pluggable content moderation provider.
 *
 * Implementations must be safe to construct without network access (credentials
 * are read lazily) and must never throw synchronously. All failure modes are
 * surfaced as a `failed` {@link ModerationResult} so that the caller can record
 * the outcome and schedule a retry without a try/catch around every call site.
 */
export interface ModerationProvider {
  /** Stable provider identifier (e.g. `rekognition`, `sightengine`, `mock`). */
  readonly name: string;
  /**
   * Moderate an image accessible via a public or pre-signed URL.
   *
   * @param imageUrl - HTTPS (or S3 pre-signed) URL of the image to evaluate.
   * @param options - Optional thresholds overriding provider defaults.
   * @returns A {@link ModerationResult}. Never throws.
   */
  moderateImage(imageUrl: string, options?: ModerationOptions): Promise<ModerationResult>;
  /**
   * Moderate a piece of free-form text (listing title, description, chat message).
   *
   * @param text - The text to evaluate.
   * @param options - Optional thresholds overriding provider defaults.
   * @returns A {@link ModerationResult}. Never throws.
   */
  moderateText(text: string, options?: ModerationOptions): Promise<ModerationResult>;
  /**
   * Moderate a video. Optional: providers without a native video adapter leave
   * this undefined, and the gateway falls back to moderating a representative
   * poster frame (or fails closed when no frame is available).
   *
   * @param contentRef - Provider-specific video locator (URL, asset id, or
   *   `video_id:poster_url` compound ref).
   * @param options - Optional thresholds overriding provider defaults.
   * @returns A {@link ModerationResult}. Never throws.
   */
  moderateVideo?(contentRef: string, options?: ModerationOptions): Promise<ModerationResult>;
  /**
   * Moderate an audio clip. Optional: providers without a native audio adapter
   * leave this undefined, and the gateway fails closed rather than approving
   * unmoderated audio.
   *
   * @param contentRef - Provider-specific audio locator (URL or asset id).
   * @param options - Optional thresholds overriding provider defaults.
   * @returns A {@link ModerationResult}. Never throws.
   */
  moderateAudio?(contentRef: string, options?: ModerationOptions): Promise<ModerationResult>;
}

/**
 * Default auto-reject confidence threshold shared by all providers.
 */
export const DEFAULT_MODERATION_THRESHOLD = 0.8;

/**
 * Default human-review confidence threshold shared by all providers.
 */
export const DEFAULT_MODERATION_REVIEW_THRESHOLD = 0.5;

/**
 * Resolve effective thresholds from optional overrides.
 *
 * @internal
 */
export function resolveThresholds(
  options: ModerationOptions | undefined,
): { threshold: number; reviewThreshold: number } {
  return {
    threshold: options?.threshold ?? DEFAULT_MODERATION_THRESHOLD,
    reviewThreshold: options?.reviewThreshold ?? DEFAULT_MODERATION_REVIEW_THRESHOLD,
  };
}

/**
 * Derive the aggregate {@link ModerationStatus} from a set of labels.
 *
 * - If any label confidence exceeds `threshold` → `rejected`.
 * - Else if any label confidence meets `reviewThreshold` → `review`.
 * - Else → `approved`.
 *
 * @internal
 */
export function classifyLabels(
  labels: ModerationLabel[],
  threshold: number,
  reviewThreshold: number,
): ModerationStatus {
  let maxConfidence = 0;
  for (const label of labels) {
    if (label.confidence > maxConfidence) {
      maxConfidence = label.confidence;
    }
    if (label.confidence >= threshold) {
      return 'rejected';
    }
  }
  if (maxConfidence >= reviewThreshold) {
    return 'review';
  }
  return 'approved';
}
