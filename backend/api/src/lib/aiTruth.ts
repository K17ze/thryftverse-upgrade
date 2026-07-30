/**
 * P0-9: AI/ML truth.
 *
 * This module centralizes every claim the backend makes about AI/ML
 * capability so that:
 *
 *   1. deploy-time validation refuses to mark a deployment "ready" when
 *      the configured AI model is unreachable or the API key is missing;
 *   2. a public `/ai/health` route reports the honest capability level
 *      (heuristic baseline vs. provider-backed) without exposing secrets;
 *   3. the agent runtime enforces per-request rate-limit, cost and retry
 *      guards so a misconfigured model cannot silently drain the budget;
 *   4. image classification is gated off until a real provider is wired
 *      in — the endpoint returns 501 with an honest reason rather than
 *      pretending to classify.
 *
 * The labels here are the single source of truth for what the product
 * claims about AI/ML. The frontend reads `/ai/health` and
 * `/ai/capability` to decide whether to show "AI assistant" vs.
 * "Heuristic assistant" and whether to expose image-classification UI.
 */

import { config } from '../config.js';

export type AiCapabilityLevel = 'provider_backed' | 'heuristic_baseline' | 'unavailable';

export interface AiHealthCheck {
  capabilityLevel: AiCapabilityLevel;
  /** Human-readable label for UI. Never claims "trained ML" when false. */
  label: string;
  /** True when a real AI provider (OpenAI, etc.) is configured and reachable. */
  providerConfigured: boolean;
  /** True when the decision service is reachable. */
  decisionServiceReachable: boolean;
  /** True when image classification is available. Always false until a real provider is wired. */
  imageClassificationAvailable: boolean;
  /** Honest model identifier when a provider is configured, else null. */
  configuredModel: string | null;
  /** Honest capability flags the frontend may surface. */
  capabilities: {
    chatAgent: boolean;
    recommendations: boolean;
    priceForecast: boolean;
    imageClassification: boolean;
  };
  /** Rate-limit / cost guard configuration (non-secret). */
  guards: {
    perUserPerHourLimit: number;
    perConversationPerHourLimit: number;
    maxOutputTokens: number;
    timeoutMs: number;
    maxRetries: number;
  };
  checkedAt: string;
  error?: string;
}

/**
 * The configured AI provider model. Honest about what was configured —
 * returns null when no provider is wired so callers cannot accidentally
 * claim a model that does not exist.
 */
export function getConfiguredAiModel(): string | null {
  if (!config.openAiApiKey) return null;
  return config.openAiAgentDefaultModel || null;
}

/**
 * The honest capability level of this deployment. Used by the health
 * route and by deploy-time validation.
 */
export function resolveAiCapabilityLevel(
  providerConfigured: boolean,
  decisionServiceReachable: boolean,
): AiCapabilityLevel {
  if (providerConfigured) return 'provider_backed';
  if (decisionServiceReachable) return 'heuristic_baseline';
  return 'unavailable';
}

/**
 * Honest UI label. Never claims "trained ML" or "AI-powered" when the
 * deployment is on a heuristic baseline. The product must not market
 * heuristic baselines as trained ML (P0-9).
 */
export function aiCapabilityLabel(level: AiCapabilityLevel): string {
  switch (level) {
    case 'provider_backed':
      return 'AI assistant';
    case 'heuristic_baseline':
      return 'Heuristic assistant';
    case 'unavailable':
      return 'Assistant unavailable';
  }
}

/**
 * Probe the configured AI provider with a minimal request. Returns true
 * when the provider responds with 2xx. A 401/403 means the key is
 * wrong; a 404 means the model is wrong; a timeout means the provider
 * is down. The caller surfaces the honest reason.
 */
export async function probeAiProvider(): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
}> {
  if (!config.openAiApiKey) {
    return { ok: false, error: 'No AI provider API key configured' };
  }
  const baseUrl = config.openAiBaseUrl;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    // Hit the models endpoint — it is the cheapest way to validate the
    // key and base URL without spending tokens on a completion.
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.openAiApiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `AI provider responded ${response.status}`,
      };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'AI provider probe failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Probe the decision / ML service. Returns true when the service
 * responds with 2xx on /health.
 */
export async function probeDecisionService(): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${config.decisionServiceUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `Decision service responded ${response.status}`,
      };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Decision service probe failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Build the full AI health snapshot. Used by `/ai/health` and by
 * deploy-time validation. Probes are optional — pass `skipProbes` to
 * return the configured state without network calls (used at startup
 * before the provider is reachable).
 */
export async function buildAiHealth(
  skipProbes = false,
): Promise<AiHealthCheck> {
  const providerConfigured = Boolean(config.openAiApiKey);
  let providerReachable = providerConfigured;
  let decisionServiceReachable = false;
  let error: string | undefined;

  if (!skipProbes) {
    if (providerConfigured) {
      const probe = await probeAiProvider();
      providerReachable = probe.ok;
      if (!probe.ok) {
        error = probe.error;
      }
    }
    const decisionProbe = await probeDecisionService();
    decisionServiceReachable = decisionProbe.ok;
    if (!decisionProbe.ok && !error) {
      error = decisionProbe.error;
    }
  }

  const capabilityLevel = resolveAiCapabilityLevel(
    providerConfigured && providerReachable,
    decisionServiceReachable,
  );

  return {
    capabilityLevel,
    label: aiCapabilityLabel(capabilityLevel),
    providerConfigured: providerConfigured && providerReachable,
    decisionServiceReachable,
    // P0-9: image classification is NOT available. The decision baseline
    // service returns 501 on /classify-image. Until a real provider is
    // wired, this must remain false so the frontend does not expose
    // classification UI.
    imageClassificationAvailable: false,
    configuredModel: getConfiguredAiModel(),
    capabilities: {
      chatAgent: providerConfigured && providerReachable,
      recommendations: decisionServiceReachable,
      priceForecast: decisionServiceReachable,
      imageClassification: false,
    },
    guards: {
      perUserPerHourLimit: AI_RATE_LIMITS.perUserPerHour,
      perConversationPerHourLimit: AI_RATE_LIMITS.perConversationPerHour,
      maxOutputTokens: config.openAiAgentMaxOutputTokens,
      timeoutMs: config.openAiAgentTimeoutMs,
      maxRetries: AI_RATE_LIMITS.maxRetries,
    },
    checkedAt: new Date().toISOString(),
    error,
  };
}

/**
 * P0-9: Rate-limit / cost / retry guards for the agent runtime.
 *
 * The OpenAI agent previously had no per-user or per-conversation
 * rate-limit, no cost accounting, and a single attempt with no retry.
 * These guards cap usage so a misconfigured or runaway agent cannot
 * silently drain the provider budget.
 */
export const AI_RATE_LIMITS = {
  perUserPerHour: 30,
  perConversationPerHour: 60,
  maxRetries: 2,
  /** Base delay for exponential backoff, in ms. */
  retryBaseDelayMs: 750,
  /** Hard ceiling on output tokens per request, regardless of config. */
  hardMaxOutputTokens: 4_000,
} as const;

/**
 * Compute the backoff delay for a given retry attempt (0-indexed).
 * Exponential with jitter so concurrent retries do not synchronize.
 */
export function computeRetryDelayMs(attempt: number): number {
  const base = AI_RATE_LIMITS.retryBaseDelayMs * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

/**
 * P0-9: Deploy-time validation. Called at startup. Returns a list of
 * blocking errors that prevent the deployment from claiming AI
 * capability. An empty array means the deployment is honestly
 * configured — either a working provider, or an explicit heuristic
 * baseline with no false claims.
 *
 * This does NOT block startup — the API can still run with heuristic
 * baselines. It only blocks the `ai.provider_backed` capability claim.
 */
export async function validateAiDeployReadiness(
  options: { probeProviders?: boolean } = {},
): Promise<{
  ok: boolean;
  blockingErrors: string[];
  warnings: string[];
  health: AiHealthCheck;
}> {
  // The admin/deploy endpoint probes providers. Startup can opt out so a
  // provider outage never adds several seconds to API boot.
  const health = await buildAiHealth(options.probeProviders === false);
  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  if (config.nodeEnv === 'production') {
    // In production, if an API key is set, the provider must be reachable
    // and the model must be non-empty. Otherwise the deployment is
    // silently degraded.
    if (config.openAiApiKey && !config.openAiAgentDefaultModel) {
      blockingErrors.push(
        'OPENAI_API_KEY is set but OPENAI_AGENT_DEFAULT_MODEL is empty — the AI provider cannot be used.',
      );
    }
    if (config.openAiApiKey && config.openAiAgentMaxOutputTokens > AI_RATE_LIMITS.hardMaxOutputTokens) {
      blockingErrors.push(
        `OPENAI_AGENT_MAX_OUTPUT_TOKENS exceeds the hard ceiling of ${AI_RATE_LIMITS.hardMaxOutputTokens}.`,
      );
    }
    if (
      options.probeProviders !== false
      && config.openAiApiKey
      && !health.providerConfigured
    ) {
      blockingErrors.push(
        `The configured AI provider is not reachable${health.error ? `: ${health.error}` : '.'}`,
      );
    }
    if (
      config.openAiApiKey
      && (
        config.aiUsagePricingVersion === 'unconfigured'
        || config.openAiInputCostMicrousdPerMillionTokens <= 0
        || config.openAiOutputCostMicrousdPerMillionTokens <= 0
      )
    ) {
      blockingErrors.push(
        'AI usage pricing must be versioned and contain positive input/output rates before provider-backed AI can be deployment-ready.',
      );
    }
  }

  // Image classification must never be claimed. This is a hard guard
  // regardless of environment.
  if (health.imageClassificationAvailable) {
    blockingErrors.push(
      'Image classification is reported as available — no provider is wired. This is a false claim.',
    );
  }

  if (health.capabilityLevel === 'unavailable' && config.nodeEnv === 'production') {
    warnings.push(
      'No AI provider and no decision service are configured. The product must not claim AI capability.',
    );
  }

  return {
    ok: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    health,
  };
}
