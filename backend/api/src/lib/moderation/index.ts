/**
 * Content moderation provider barrel and factory.
 *
 * Exposes the provider contracts and a {@link createModerationProvider} factory
 * that selects an implementation based on the `MODERATION_PROVIDER` environment
 * variable. In production an unset or unknown value throws; in non-production
 * environments an unknown or unset value yields the mock provider so that
 * development and CI remain fully functional without external credentials.
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
 * Reads `MODERATION_PROVIDER` from the environment. In production, an unset,
 * empty, or unknown value throws — moderation must never silently degrade to
 * an allow-all mock. In non-production environments, unknown or unset values
 * fall back to the mock provider so that the application always boots and the
 * media lifecycle remains testable without external dependencies.
 *
 * The result is cached for the lifetime of the process; subsequent calls return
 * the same instance.
 *
 * @returns A {@link ModerationProvider} appropriate for the current environment.
 * @throws {Error} In production when `MODERATION_PROVIDER` is unset, empty, or
 *   not one of `rekognition` or `sightengine`.
 */
export function createModerationProvider(): ModerationProvider {
  if (cachedProvider) {
    return cachedProvider;
  }
  const rawValue = process.env.MODERATION_PROVIDER ?? '';
  const requested = rawValue.trim().toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';
  const knownProviders = ['rekognition', 'sightengine'];

  if (isProduction && !knownProviders.includes(requested)) {
    throw new Error(
      `MODERATION_PROVIDER must be set to 'rekognition' or 'sightengine' in production. Current value: '${rawValue}'`,
    );
  }

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
 * Assert that the moderation provider is not the mock in production.
 *
 * Intended for the production-readiness gate: if the resolved provider is the
 * always-approve mock while running in production, moderation is effectively
 * disabled and the process must not start.
 *
 * @throws {Error} When `NODE_ENV` is `production` and the configured provider
 *   resolves to the mock implementation.
 */
export function assertModerationProviderConfigured(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  const requested = (process.env.MODERATION_PROVIDER ?? '').trim().toLowerCase();
  if (requested === 'mock' || requested === '' || requested === undefined) {
    throw new Error(
      `MODERATION_PROVIDER must be set to 'rekognition' or 'sightengine' in production. Current value: '${process.env.MODERATION_PROVIDER ?? ''}'`,
    );
  }
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
