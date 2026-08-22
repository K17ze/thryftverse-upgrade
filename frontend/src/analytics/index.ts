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
export { track, trackRaw } from './track';

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
