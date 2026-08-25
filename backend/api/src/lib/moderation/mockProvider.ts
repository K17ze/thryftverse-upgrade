/**
 * Mock content moderation provider for development and testing.
 *
 * Always returns `approved` with no labels so that the media lifecycle can be
 * exercised end-to-end without provisioning any external moderation vendor.
 * Selected automatically when `MODERATION_PROVIDER` is unset or `mock`.
 *
 * @packageDocumentation
 */

import {
  type ModerationOptions,
  type ModerationProvider,
  type ModerationResult,
} from './moderationProvider.js';

/**
 * A {@link ModerationProvider} that unconditionally approves every input.
 *
 * Use in local development, CI, and integration tests where real content
 * moderation is neither available nor desirable. The provider is stateless and
 * safe to share as a singleton.
 */
export class MockModerationProvider implements ModerationProvider {
  readonly name = 'mock';

  /**
   * Approve the supplied image without inspection.
   *
   * @param _imageUrl - Ignored.
   * @param _options - Ignored.
   * @returns An `approved` result with empty labels.
   */
  moderateImage(_imageUrl: string, _options?: ModerationOptions): Promise<ModerationResult> {
    return Promise.resolve(this.approvedResult());
  }

  /**
   * Approve the supplied text without inspection.
   *
   * @param _text - Ignored.
   * @param _options - Ignored.
   * @returns An `approved` result with empty labels.
   */
  moderateText(_text: string, _options?: ModerationOptions): Promise<ModerationResult> {
    return Promise.resolve(this.approvedResult());
  }

  private approvedResult(): ModerationResult {
    return {
      status: 'approved',
      confidence: 0,
      labels: [],
      provider: this.name,
      modelVersion: 'mock-1.0',
      processingTimeMs: 0,
    };
  }
}

/**
 * Convenience singleton used by the factory and tests.
 */
export const mockModerationProvider: ModerationProvider = new MockModerationProvider();
