/**
 * Sightengine content moderation provider.
 *
 * Wraps the Sightengine REST API (`https://api.sightengine.com/1.0/check.json`)
 * to evaluate both images and text against Sightengine's managed models. Best
 * suited for text moderation (120+ classes) and complements AWS Rekognition for
 * image moderation.
 *
 * Uses the global `fetch` available in Node 22+. Configuration is read from
 * environment variables:
 * - `SIGHTENGINE_API_KEY` — Sightengine API key.
 * - `SIGHTENGINE_API_USER` — Sightengine API user (worker) id.
 *
 * The provider is safe to construct without credentials; calls return a
 * `failed` result when configuration is missing so the caller can retry without
 * a try/catch.
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

/** Sightengine REST endpoint for the check operation. */
const SIGHTENGINE_ENDPOINT = 'https://api.sightengine.com/1.0/check.json';

/** Request timeout for Sightengine API calls. */
const SIGHTENGINE_TIMEOUT_MS = 15_000;

/** Image moderation models requested from Sightengine. */
const IMAGE_MODELS = [
  'nudity-2.1',
  'violence',
  'weapon',
  'gore-2.0',
  'offensive-2.0',
  'recreational_drug',
  'alcohol',
  'genai',
] as const;

/** Text moderation models requested from Sightengine. */
const TEXT_MODELS = [
  'profanity',
  'identity-attack',
  'insult',
  'threat',
  'toxic',
] as const;

/**
 * Sightengine response shape (subset relevant to moderation decisions).
 * Sightengine returns probabilities in the 0–1 range.
 */
interface SightengineResponse {
  status?: 'success' | 'failure';
  request?: { id?: string };
  error?: { message?: string; code?: string };
  // Image models
  nudity?: { none?: number; safe?: number; suggestive?: number; explicit?: number };
  violence?: { prob?: number };
  weapon?: { prob?: number };
  gore?: { prob?: number };
  offensive?: { prob?: number };
  recreational_drug?: { prob?: number };
  alcohol?: { prob?: number };
  genai?: { prob?: number };
  // Text models
  profanity?: { matches?: Array<{ type?: string; match?: string; start?: number }> };
  'identity-attack'?: { prob?: number };
  insult?: { prob?: number };
  threat?: { prob?: number };
  toxic?: { prob?: number };
}

/**
 * Read Sightengine credentials from the environment. Returns `null` when either
 * value is missing so callers can degrade gracefully.
 */
function readCredentials(): { apiKey: string; apiUser: string } | null {
  const apiKey = process.env.SIGHTENGINE_API_KEY?.trim();
  const apiUser = process.env.SIGHTENGINE_API_USER?.trim();
  if (!apiKey || !apiUser) {
    return null;
  }
  return { apiKey, apiUser };
}

/**
 * Clamp a probability into the 0–1 range, defaulting to 0 when undefined.
 */
function clampProb(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Build a `failed` result with a consistent shape.
 */
function failedResult(error: string, processingTimeMs: number): ModerationResult {
  return {
    status: 'failed',
    confidence: 0,
    labels: [],
    provider: 'sightengine',
    modelVersion: '1.0',
    processingTimeMs,
    error,
  };
}

/**
 * Normalise Sightengine image-model output into {@link ModerationLabel}s.
 *
 * Each model contributes at most one label whose confidence is the highest
 * violation probability reported by that model.
 */
function labelsFromImageResponse(response: SightengineResponse): ModerationLabel[] {
  const labels: ModerationLabel[] = [];

  const nudity = response.nudity;
  if (nudity) {
    const suggestive = clampProb(nudity.suggestive);
    const explicit = clampProb(nudity.explicit);
    const maxNudity = Math.max(suggestive, explicit);
    if (maxNudity > 0) {
      labels.push({
        name: explicit >= suggestive ? 'Explicit Nudity' : 'Suggestive Nudity',
        confidence: maxNudity,
        category: 'nudity',
      });
    }
  }

  const violenceProb = clampProb(response.violence?.prob);
  if (violenceProb > 0) {
    labels.push({ name: 'Violence', confidence: violenceProb, category: 'violence' });
  }

  const weaponProb = clampProb(response.weapon?.prob);
  if (weaponProb > 0) {
    labels.push({ name: 'Weapon', confidence: weaponProb, category: 'weapon' });
  }

  const goreProb = clampProb(response.gore?.prob);
  if (goreProb > 0) {
    labels.push({ name: 'Gore', confidence: goreProb, category: 'violence' });
  }

  const offensiveProb = clampProb(response.offensive?.prob);
  if (offensiveProb > 0) {
    labels.push({ name: 'Offensive', confidence: offensiveProb, category: 'hate' });
  }

  const drugProb = clampProb(response.recreational_drug?.prob);
  if (drugProb > 0) {
    labels.push({ name: 'Recreational Drug', confidence: drugProb, category: 'drugs' });
  }

  const alcoholProb = clampProb(response.alcohol?.prob);
  if (alcoholProb > 0) {
    labels.push({ name: 'Alcohol', confidence: alcoholProb, category: 'alcohol' });
  }

  const genaiProb = clampProb(response.genai?.prob);
  if (genaiProb > 0) {
    labels.push({ name: 'Generated AI', confidence: genaiProb, category: 'other' });
  }

  return labels;
}

/**
 * Normalise Sightengine text-model output into {@link ModerationLabel}s.
 */
function labelsFromTextResponse(response: SightengineResponse): ModerationLabel[] {
  const labels: ModerationLabel[] = [];

  const profanityMatches = response.profanity?.matches;
  if (profanityMatches && profanityMatches.length > 0) {
    labels.push({
      name: 'Profanity',
      confidence: 1,
      category: 'hate',
    });
  }

  const identityAttack = clampProb(response['identity-attack']?.prob);
  if (identityAttack > 0) {
    labels.push({ name: 'Identity Attack', confidence: identityAttack, category: 'hate' });
  }

  const insult = clampProb(response.insult?.prob);
  if (insult > 0) {
    labels.push({ name: 'Insult', confidence: insult, category: 'hate' });
  }

  const threat = clampProb(response.threat?.prob);
  if (threat > 0) {
    labels.push({ name: 'Threat', confidence: threat, category: 'violence' });
  }

  const toxic = clampProb(response.toxic?.prob);
  if (toxic > 0) {
    labels.push({ name: 'Toxic', confidence: toxic, category: 'spam' });
  }

  return labels;
}

/**
 * Execute a Sightengine `check.json` request with timeout handling.
 *
 * @param params - Query parameters to send.
 * @returns Parsed response or throws on network/HTTP error.
 */
async function callSightengine(
  params: Record<string, string>,
): Promise<SightengineResponse> {
  const url = new URL(SIGHTENGINE_ENDPOINT);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SIGHTENGINE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Sightengine HTTP ${response.status}: ${response.statusText}`);
    }
    const body = (await response.json()) as SightengineResponse;
    if (body.status === 'failure') {
      const message = body.error?.message ?? 'Sightengine returned a failure status';
      throw new Error(message);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sightengine implementation of {@link ModerationProvider}.
 *
 * Supports both image and text moderation. When credentials are missing, every
 * call returns a `failed` result so the media processing job can be retried
 * with backoff rather than crashing the worker.
 */
export class SightengineModerationProvider implements ModerationProvider {
  readonly name = 'sightengine';

  /**
   * Moderate an image via Sightengine image models.
   *
   * @param imageUrl - Public HTTPS URL of the image to evaluate.
   * @param options - Optional threshold overrides.
   * @returns A {@link ModerationResult}. Returns `failed` when credentials are
   *   missing or the API call errors (network, timeout, rate limit).
   */
  async moderateImage(
    imageUrl: string,
    options?: ModerationOptions,
  ): Promise<ModerationResult> {
    const startedAt = Date.now();
    const credentials = readCredentials();
    if (!credentials) {
      return failedResult(
        'Sightengine credentials are not configured (SIGHTENGINE_API_KEY / SIGHTENGINE_API_USER)',
        Date.now() - startedAt,
      );
    }
    const { threshold, reviewThreshold } = resolveThresholds(options);

    try {
      const body = await callSightengine({
        url: imageUrl,
        models: IMAGE_MODELS.join(','),
        api_user: credentials.apiUser,
        api_secret: credentials.apiKey,
      });
      const labels = labelsFromImageResponse(body);
      const status = classifyLabels(labels, threshold, reviewThreshold);
      const maxConfidence = labels.reduce((max, label) => Math.max(max, label.confidence), 0);
      return {
        status,
        confidence: maxConfidence,
        labels,
        provider: this.name,
        modelVersion: '1.0',
        processingTimeMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sightengine API call failed';
      return failedResult(message, Date.now() - startedAt);
    }
  }

  /**
   * Moderate text via Sightengine text models.
   *
   * @param text - The text to evaluate.
   * @param options - Optional threshold overrides.
   * @returns A {@link ModerationResult}. Returns `failed` when credentials are
   *   missing or the API call errors (network, timeout, rate limit).
   */
  async moderateText(
    text: string,
    options?: ModerationOptions,
  ): Promise<ModerationResult> {
    const startedAt = Date.now();
    const credentials = readCredentials();
    if (!credentials) {
      return failedResult(
        'Sightengine credentials are not configured (SIGHTENGINE_API_KEY / SIGHTENGINE_API_USER)',
        Date.now() - startedAt,
      );
    }
    const { threshold, reviewThreshold } = resolveThresholds(options);

    try {
      const body = await callSightengine({
        text,
        models: TEXT_MODELS.join(','),
        api_user: credentials.apiUser,
        api_secret: credentials.apiKey,
      });
      const labels = labelsFromTextResponse(body);
      const status = classifyLabels(labels, threshold, reviewThreshold);
      const maxConfidence = labels.reduce((max, label) => Math.max(max, label.confidence), 0);
      return {
        status,
        confidence: maxConfidence,
        labels,
        provider: this.name,
        modelVersion: '1.0',
        processingTimeMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sightengine API call failed';
      return failedResult(message, Date.now() - startedAt);
    }
  }
}
