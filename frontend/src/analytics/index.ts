/**
 * PostHog analytics + feature flags barrel export for ThryftVerse.
 *
 * Import everything analytics-related from this single entry point:
 *
 *   import {
 *     PostHogProvider,
 *     track,
 *     trackRaw,
 *     identifyUser,
 *     resetIdentity,
 *     useFeatureFlag,
 *     useFeatureFlagVariant,
 *     useFeatureFlagPayload,
 *     useScreenTracking,
 *     trackScreenChange,
 *   } from '@/analytics';
 */

// Provider — wraps the app, configures PostHog, session replay, bootstrapping.
export { PostHogProvider, getPostHogClient, isPostHogAvailable, getDeviceInfo, getPlatform } from './PostHogProvider';

// Tracking — typed track() and trackRaw() for dynamic event names.
export { track, trackRaw, trackFunnelStep } from './track';

// PII sanitization — value-based PII stripping for analytics payloads.
export { sanitizeValue, sanitizeEvent } from './piiSanitizer';

// Consent management — 2026 privacy-first opt-in consent state.
export {
  getConsentState,
  setConsentState,
  hasAnalyticsConsent,
  hasAnalyticsConsentSync,
  refreshConsentCache,
  updateConsentCache,
} from './analyticsConsent';
export type { ConsentState } from './analyticsConsent';

// Analytics gate — single source of truth for the analytics opt-out flag.
export {
  setAnalyticsOptOut,
  isAnalyticsOptOut,
  isAnalyticsEnabled,
  subscribeToAnalyticsOptOut,
} from './analyticsGate';

// Identification — identify and reset user identity.
export { identifyUser, resetIdentity } from './identify';

// Feature flags — typed boolean, variant, and payload hooks.
export {
  useFeatureFlag,
  useFeatureFlagVariant,
  useFeatureFlagPayload,
} from './useFeatureFlag';

// Screen tracking — React Navigation integration.
export {
  useScreenTracking,
  trackScreenChange,
  resetScreenTracking,
} from './useScreenTracking';

// Types — event taxonomy, feature flag keys, user identity.
export type {
  EventName,
  EventProperties,
  FeatureFlagKey,
  ScreenViewProperties,
  UserIdentity,
} from './types';

// Guardrails — experiment auto-kill thresholds.
export { GUARDRAIL_METRICS } from './guardrails';

// Impression lineage — impression_id generation, context, and tracking.
export {
  generateImpressionId,
  useImpressionId,
  ImpressionProvider,
  useImpressionContext,
  trackWithImpression,
  useImpressionTracking,
} from './impressions';
export type { ImpressionContextValue } from './impressions';

// Experiments — registry client, types, and hooks.
export {
  fetchExperiments,
  fetchExperiment,
  createExperiment,
  updateExperiment,
  checkExperimentGuardrails,
  useExperiment,
  useExperiments,
} from './experiments';
export type {
  Experiment,
  ExperimentStatus,
  ExperimentDecision,
  ExperimentVariant,
  GuardrailCheckResult,
  GuardrailCheckResponse,
  CreateExperimentInput,
  UpdateExperimentInput,
} from './experiments';
