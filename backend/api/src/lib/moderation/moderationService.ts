/**
 * Moderation service — thin orchestration layer over the provider abstraction.
 *
 * Bridges the raw {@link ModerationResult} emitted by a provider into the
 * media lifecycle state machine (`mediaLifecycle.ts`) and provides audit
 * logging for every decision. All public functions catch every error and
 * return a `failed` outcome so that moderation can never crash the request
 * path or the background processing pipeline.
 *
 * @packageDocumentation
 */

import { config } from '../../config.js';
import {
  createModerationProvider,
  type ModerationOptions,
  type ModerationResult,
  type ModerationStatus,
} from './index.js';
import type { MediaAssetStatus } from '../mediaLifecycle.js';

/**
 * The lifecycle status that a moderation outcome maps to.
 * `review` keeps the asset in `moderation_pending` (no transition).
 */
export type ModerationLifecycleOutcome = {
  status: MediaAssetStatus;
  moderationStatus: ModerationStatus;
  result: ModerationResult;
};

/**
 * Map a provider {@link ModerationStatus} to a media lifecycle
 * {@link MediaAssetStatus}.
 *
 * - `approved` → `publishable`
 * - `rejected` → `quarantined`
 * - `review`   → `moderation_pending` (stays pending for human review)
 * - `failed`   → `processing_failed`
 */
export function moderationStatusToLifecycleStatus(
  status: ModerationStatus,
): MediaAssetStatus {
  switch (status) {
    case 'approved':
      return 'publishable';
    case 'rejected':
      return 'quarantined';
    case 'review':
      return 'moderation_pending';
    case 'failed':
    default:
      return 'processing_failed';
  }
}

function buildOptions(): ModerationOptions {
  return {
    threshold: config.moderationThreshold,
    reviewThreshold: config.moderationReviewThreshold,
  };
}

function logResult(
  scope: string,
  refId: string,
  result: ModerationResult,
): void {
  const labels = result.labels.map((label) => ({
    name: label.name,
    confidence: label.confidence,
    category: label.category,
  }));
  if (result.status === 'failed') {
    console.warn(
      `[moderation] ${scope} ref=${refId} provider=${result.provider} status=failed error=${result.error ?? 'unknown'} durationMs=${result.processingTimeMs}`,
    );
    return;
  }
  console.info(
    `[moderation] ${scope} ref=${refId} provider=${result.provider} status=${result.status} confidence=${result.confidence} durationMs=${result.processingTimeMs} labels=${JSON.stringify(labels)}`,
  );
}

/**
 * Moderate an image asset and return the lifecycle outcome.
 *
 * Calls the configured provider's `moderateImage` method, logs the result for
 * the audit trail, and maps the status to a media lifecycle status. Never
 * throws — on any error a `failed` outcome is returned so the caller can
 * transition the asset to `processing_failed` and schedule a retry.
 *
 * @param assetId - The media asset identifier (for logging/audit).
 * @param imageUrl - Public or pre-signed URL of the image to moderate.
 * @returns A {@link ModerationLifecycleOutcome} with the lifecycle status and
 *   the raw provider result.
 */
export async function moderateImageAsset(
  assetId: string,
  imageUrl: string,
): Promise<ModerationLifecycleOutcome> {
  let result: ModerationResult;
  try {
    const provider = createModerationProvider();
    result = await provider.moderateImage(imageUrl, buildOptions());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected moderation error';
    result = {
      status: 'failed',
      confidence: 0,
      labels: [],
      provider: 'unknown',
      modelVersion: 'unknown',
      processingTimeMs: 0,
      error: message,
    };
  }
  logResult('image', assetId, result);
  return {
    status: moderationStatusToLifecycleStatus(result.status),
    moderationStatus: result.status,
    result,
  };
}

/**
 * Moderate listing text (title + description) and return the raw result.
 *
 * The caller is responsible for acting on the status: rejecting creation on
 * `rejected`, flagging for human review on `review`, or proceeding on
 * `approved`. Never throws.
 *
 * @param listingId - The listing identifier (for logging/audit).
 * @param text - The concatenated text to evaluate.
 * @returns A {@link ModerationResult}. Never throws.
 */
export async function moderateListingText(
  listingId: string,
  text: string,
): Promise<ModerationResult> {
  let result: ModerationResult;
  try {
    const provider = createModerationProvider();
    result = await provider.moderateText(text, buildOptions());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected moderation error';
    result = {
      status: 'failed',
      confidence: 0,
      labels: [],
      provider: 'unknown',
      modelVersion: 'unknown',
      processingTimeMs: 0,
      error: message,
    };
  }
  logResult('listing_text', listingId, result);
  return result;
}

/**
 * Moderate user profile text fields (bio and display name).
 *
 * Concatenates the fields and runs a single text moderation pass. Never
 * throws.
 *
 * @param userId - The user identifier (for logging/audit).
 * @param bio - The user's bio text, or empty string.
 * @param displayName - The user's display name, or empty string.
 * @returns A {@link ModerationResult}. Never throws.
 */
export async function moderateUserProfile(
  userId: string,
  bio: string,
  displayName: string,
): Promise<ModerationResult> {
  const text = [displayName, bio].filter((part) => part.trim().length > 0).join('\n');
  let result: ModerationResult;
  try {
    const provider = createModerationProvider();
    result = text.trim().length > 0
      ? await provider.moderateText(text, buildOptions())
      : {
          status: 'approved',
          confidence: 0,
          labels: [],
          provider: provider.name,
          modelVersion: 'skipped-empty',
          processingTimeMs: 0,
        };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected moderation error';
    result = {
      status: 'failed',
      confidence: 0,
      labels: [],
      provider: 'unknown',
      modelVersion: 'unknown',
      processingTimeMs: 0,
      error: message,
    };
  }
  logResult('user_profile', userId, result);
  return result;
}
