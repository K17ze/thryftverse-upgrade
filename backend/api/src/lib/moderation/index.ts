/**
 * Content moderation provider barrel and factory.
 *
 * Exposes the provider contracts and a {@link createModerationProvider} factory
 * that selects an implementation based on the `MODERATION_PROVIDER` environment
 * variable. The factory never throws: an unknown or unset value yields the mock
 * provider so that development and CI remain fully functional without external
 * credentials.
 *
 * Supported `MODERATION_PROVIDER` values:
 * - `rekognition` — AWS Rekognition image moderation.
 * - `sightengine` — Sightengine image + text moderation.
 * - `mock` (or unset) — always-approve mock for development/testing.
 *
 * @packageDocumentation
 */

import type { ModerationProvider } from './moderationProvider.js';
import {
  MockModerationProvider,
  mockModerationProvider,
} from './mockProvider.js';
import { RekognitionModerationProvider } from './rekognitionProvider.js';
import { SightengineModerationProvider } from './sightengineProvider.js';

export type {
  ModerationLabel,
  ModerationOptions,
  ModerationProvider,
  ModerationResult,
  ModerationStatus,
} from './moderationProvider.js';
export {
  classifyLabels,
  DEFAULT_MODERATION_REVIEW_THRESHOLD,
  DEFAULT_MODERATION_THRESHOLD,
  resolveThresholds,
} from './moderationProvider.js';
export { MockModerationProvider, mockModerationProvider } from './mockProvider.js';
export { RekognitionModerationProvider } from './rekognitionProvider.js';
export { SightengineModerationProvider } from './sightengineProvider.js';

/**
 * Create a {@link MockModerationProvider} instance.
 *
 * @returns A provider that always approves. Used in development and tests.
 */
export function createMockModerationProvider(): ModerationProvider {
  return new MockModerationProvider();
}

/**
 * Create a {@link RekognitionModerationProvider} instance.
 *
 * The AWS SDK is lazy-loaded on first use, so construction never throws even
 * when credentials are absent.
 *
 * @returns A Rekognition-backed moderation provider.
 */
export function createRekognitionModerationProvider(): ModerationProvider {
  return new RekognitionModerationProvider();
}

/**
 * Create a {@link SightengineModerationProvider} instance.
 *
 * Credentials are read lazily on each call, so construction never throws.
 *
 * @returns A Sightengine-backed moderation provider.
 */
export function createSightengineModerationProvider(): ModerationProvider {
  return new SightengineModerationProvider();
}

/** Cached provider instance so the factory is idempotent across calls. */
let cachedProvider: ModerationProvider | null = null;

/**
 * Factory that returns the configured moderation provider.
 *
 * Reads `MODERATION_PROVIDER` from the environment. Unknown or unset values
 * fall back to the mock provider so that the application always boots and the
 * media lifecycle remains testable without external dependencies.
 *
 * The result is cached for the lifetime of the process; subsequent calls return
 * the same instance.
 *
 * @returns A {@link ModerationProvider} appropriate for the current environment.
 */
export function createModerationProvider(): ModerationProvider {
  if (cachedProvider) {
    return cachedProvider;
  }
  const requested = process.env.MODERATION_PROVIDER?.trim().toLowerCase();
  switch (requested) {
    case 'rekognition':
      cachedProvider = createRekognitionModerationProvider();
      break;
    case 'sightengine':
      cachedProvider = createSightengineModerationProvider();
      break;
    case 'mock':
    case '':
    case undefined:
      cachedProvider = createMockModerationProvider();
      break;
    default:
      cachedProvider = createMockModerationProvider();
      break;
  }
  return cachedProvider;
}

/**
 * Reset the cached provider. Intended for tests that reconfigure
 * `MODERATION_PROVIDER` between cases.
 *
 * @internal
 */
export function resetModerationProviderCache(): void {
  cachedProvider = null;
}
