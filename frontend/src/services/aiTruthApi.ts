import { fetchJson } from '../lib/apiClient';

/**
 * P0-9: AI/ML truth — frontend client.
 *
 * The frontend reads these endpoints to decide how to label the
 * assistant ("AI assistant" vs. "Heuristic assistant" vs.
 * "Assistant unavailable") and whether to expose image-classification
 * UI. The product must never market heuristic baselines as trained ML.
 */

export type AiCapabilityLevel = 'provider_backed' | 'heuristic_baseline' | 'unavailable';

export interface AiCapabilitySummary {
  capabilityLevel: AiCapabilityLevel;
  label: string;
  capabilities: {
    chatAgent: boolean;
    recommendations: boolean;
    priceForecast: boolean;
    imageClassification: boolean;
  };
  imageClassificationAvailable: boolean;
  configuredModel: string | null;
}

export interface AiHealthCheck {
  capabilityLevel: AiCapabilityLevel;
  label: string;
  providerConfigured: boolean;
  decisionServiceReachable: boolean;
  imageClassificationAvailable: boolean;
  configuredModel: string | null;
  capabilities: {
    chatAgent: boolean;
    recommendations: boolean;
    priceForecast: boolean;
    imageClassification: boolean;
  };
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

export interface AiLabels {
  provider_backed: string;
  heuristic_baseline: string;
  unavailable: string;
  forbiddenForHeuristicBaseline: string[];
}

let cachedCapability: AiCapabilitySummary | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Lightweight capability summary — no network probes. Safe to call on
 * cold-start. Cached for 60s to avoid blocking the launch screen.
 */
export async function fetchAiCapability(): Promise<AiCapabilitySummary> {
  if (cachedCapability && Date.now() < cacheExpiresAt) {
    return cachedCapability;
  }
  const payload = await fetchJson<{ ok: true; capabilityLevel: AiCapabilityLevel; label: string; capabilities: AiCapabilitySummary['capabilities']; imageClassificationAvailable: boolean; configuredModel: string | null }>(
    '/ai/capability'
  );
  cachedCapability = {
    capabilityLevel: payload.capabilityLevel,
    label: payload.label,
    capabilities: payload.capabilities,
    imageClassificationAvailable: payload.imageClassificationAvailable,
    configuredModel: payload.configuredModel,
  };
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cachedCapability;
}

/**
 * Full health snapshot — probes the provider and decision service.
 * Use this when the user opens a conversation or the assistant settings
 * screen, where fresh data is worth the network cost.
 */
export async function fetchAiHealth(): Promise<AiHealthCheck> {
  const payload = await fetchJson<{ ok: true; health: AiHealthCheck }>('/ai/health');
  return payload.health;
}

/**
 * Honest UI labels for each capability level. Use this to label the
 * assistant in the chat composer, bot directory and settings so the
 * product never claims "AI-powered" when running on a heuristic
 * baseline.
 */
export async function fetchAiLabels(): Promise<AiLabels> {
  const payload = await fetchJson<{
    ok: true;
    labels: AiLabels;
  }>('/ai/labels');
  return payload.labels;
}

/**
 * Reset the capability cache. Used after a settings change that might
 * affect AI configuration (e.g. toggling a feature flag).
 */
export function resetAiCapabilityCache(): void {
  cachedCapability = null;
  cacheExpiresAt = 0;
}
