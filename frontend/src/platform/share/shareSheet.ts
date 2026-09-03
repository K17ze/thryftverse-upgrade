/**
 * shareSheet — Core share utilities built on react-native-share
 *
 * A thin, defensive wrapper around `react-native-share` that adds:
 *   - Strictly-typed option and result contracts (`ShareOptions`, `ShareResult`).
 *   - Direct targeting of a specific social platform (`ShareSocialPlatform`).
 *   - Graceful degradation to React Native's built-in `Share.share()` when
 *     the `react-native-share` native module is not linked or not available.
 *   - Analytics instrumentation for every share attempt (lazy-loaded so a
 *     missing analytics module never crashes the share flow).
 *
 * Design principles:
 *   - `react-native-share` is `require()`d lazily — a missing or unlinked
 *     native module never crashes the app; the call falls back to RN Share.
 *   - User cancellation resolves as `{ success: false }`, never throws.
 *   - Every function is async and returns a Promise.
 *   - No `any` types — the library's own types are imported type-only.
 *
 * Psychology: For a social commerce app, sharing is the primary organic
 * growth loop. The share sheet is the last tap before a user becomes a
 * marketer for the platform. Reducing friction here (1-tap platform
 * targeting vs. the system sheet's 3-tap flow) directly moves acquisition.
 */

import { Share as RNShare } from 'react-native';

// Type-only imports — erased at runtime, so a missing native module does
// not break the bundle. These give us strict typing against the library's
// real exported interfaces.
import type {
  ShareOptions as RNSShareOptions,
  ShareSingleOptions,
  Social as RNSSocial,
} from 'react-native-share';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

/**
 * Social platforms that can be targeted directly (bypassing the system
 * share sheet) when `react-native-share` is available.
 *
 * `'instagramstories'` is the flagship target — it opens Instagram's story
 * composer with a pre-composed background + sticker (see `instagramStory.ts`).
 */
export type ShareSocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'instagramstories'
  | 'twitter'
  | 'tiktok'
  | 'whatsapp'
  | 'telegram'
  | 'email'
  | 'sms';

/**
 * Options for {@link openShareSheet}.
 *
 * Mirrors the subset of `react-native-share`'s `ShareOptions` that is
 * useful for ThryftVerse's share flows. When `social` is provided, the
 * share is dispatched directly to that platform via `Share.shareSingle`
 * (1-tap flow); otherwise the system share sheet is presented via
 * `Share.open`.
 */
export interface ShareOptions {
  /** Text body to share. */
  message?: string;
  /** URL or local file URI to share. */
  url?: string;
  /** Title for the share sheet (Android). */
  title?: string;
  /** Email subject (used when `social` is `'email'`). */
  subject?: string;
  /** An additional activity item (iOS). */
  activityItem?: string;
  /** Activity types to exclude from the system sheet (iOS). */
  excludedActivityTypes?: string[];
  /** Target a specific social platform directly (bypasses the system sheet). */
  social?: ShareSocialPlatform;
}

/**
 * Result of a share operation.
 *
 * `success: false` with a `message` indicates the share did not complete —
 * this may be user cancellation, app-not-installed, or a genuine error.
 * Callers should treat `success: false` as a non-fatal outcome and never
 * surface it as a crash or hard error.
 */
export interface ShareResult {
  success: boolean;
  /** Detail or error message when `success` is false. */
  message?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Lazy native-module access
// ──────────────────────────────────────────────────────────────────────────

/**
 * The lazily-loaded `react-native-share` module surface we depend on.
 * Captured as a structural type so we never import the module at top level.
 */
interface ReactNativeShareModule {
  open(options: RNSShareOptions): Promise<unknown>;
  shareSingle(options: ShareSingleOptions): Promise<unknown>;
  Social: typeof RNSSocial;
}

let _rnsCache: ReactNativeShareModule | null | undefined;

/**
 * Lazily requires `react-native-share`. Returns `null` when the native
 * module is not linked or cannot be loaded — callers then fall back to
 * React Native's built-in `Share.share()`.
 *
 * The result is cached after the first call so repeated share attempts do
 * not re-run the `require`.
 */
function getReactNativeShare(): ReactNativeShareModule | null {
  if (_rnsCache !== undefined) return _rnsCache;
  try {
    // Lazy require — never crashes if the native module isn't linked.
    const mod = require('react-native-share') as ReactNativeShareModule;
    // Guard against a partial/mock export that lacks the methods we need.
    if (mod && typeof mod.open === 'function') {
      _rnsCache = mod;
    } else {
      _rnsCache = null;
    }
  } catch {
    _rnsCache = null;
  }
  return _rnsCache;
}

// ──────────────────────────────────────────────────────────────────────────
// Analytics (lazy, never crashes)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Tracks a share event via the analytics layer. The analytics module is
 * lazy-required so a missing or uninitialised tracker never propagates an
 * exception into the share flow.
 *
 * The `track` function is strictly typed against a fixed event taxonomy,
 * so we call it through a minimal structural signature to avoid coupling
 * this module to the analytics event-name union.
 */
function trackShareEvent(
  platform: ShareSocialPlatform | 'system',
  outcome: 'success' | 'cancelled' | 'error',
  detail?: string,
): void {
  try {
    const analyticsModule = require('../../analytics/track') as {
      track?: (event: string, properties: Record<string, unknown>) => void;
    };
    const track = analyticsModule?.track;
    if (typeof track !== 'function') return;
    track('share_completed', {
      platform,
      content_type: 'generic',
      outcome,
    });
  } catch {
    // Analytics must never crash the share flow.
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Platform mapping
// ──────────────────────────────────────────────────────────────────────────

/**
 * The subset of the `Social` enum usable with `Share.shareSingle` for
 * non-story platforms. Story platforms (`InstagramStories`,
 * `FacebookStories`) use a dedicated options shape handled in
 * `instagramStory.ts`.
 */
type NonStoriesSocial = Exclude<
  RNSSocial,
  RNSSocial.FacebookStories | RNSSocial.InstagramStories
>;

/**
 * Maps a {@link ShareSocialPlatform} to the corresponding `react-native-share`
 * `Social` enum member. Returns `null` for platforms not supported by
 * `shareSingle` (e.g. TikTok, which has no dedicated Social enum value and
 * must go through the system sheet) and for story platforms (handled
 * separately via their own options shape).
 */
function socialToEnum(
  social: ShareSocialPlatform,
  enumObject: typeof RNSSocial,
): NonStoriesSocial | null {
  switch (social) {
    case 'facebook':
      return enumObject.Facebook;
    case 'instagram':
      return enumObject.Instagram;
    case 'instagramstories':
      // Story platforms use a dedicated options shape — not handled here.
      return null;
    case 'twitter':
      return enumObject.Twitter;
    case 'whatsapp':
      return enumObject.Whatsapp;
    case 'telegram':
      return enumObject.Telegram;
    case 'email':
      return enumObject.Email;
    case 'sms':
      return enumObject.Sms;
    case 'tiktok':
      // No dedicated Social enum member — route through the system sheet.
      return null;
    default:
      return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Error normalisation
// ──────────────────────────────────────────────────────────────────────────

/**
 * Error messages from `react-native-share` that indicate user cancellation
 * rather than a genuine failure. Cancellation is a normal outcome and must
 * never be surfaced as an error.
 */
const CANCEL_PATTERNS = [
  'User did not share',
  'cancelled',
  'Canceled',
  'cancel',
  'ABORTED',
] as const;

/**
 * Returns `true` when an error message indicates the user dismissed the
 * share sheet (a normal outcome, not a failure).
 */
function isCancellation(message: string): boolean {
  return CANCEL_PATTERNS.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase()),
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Fallback — React Native built-in Share
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fallback share using React Native's built-in `Share.share()`. Used when
 * `react-native-share` is unavailable. Returns a {@link ShareResult}.
 *
 * RN's `Share.share` takes `(content, options)` — `subject` and
 * `excludedActivityTypes` belong in the second `options` argument, not the
 * content object.
 */
async function fallbackShare(options: ShareOptions): Promise<ShareResult> {
  try {
    const result = await RNShare.share(
      {
        message: options.message ?? '',
        url: options.url,
        title: options.title,
      },
      {
        subject: options.subject,
        excludedActivityTypes: options.excludedActivityTypes,
      },
    );
    if (result.action === RNShare.dismissedAction) {
      trackShareEvent('system', 'cancelled');
      return { success: false, message: 'User dismissed the share sheet.' };
    }
    trackShareEvent('system', 'success');
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isCancellation(message)) {
      trackShareEvent('system', 'cancelled');
      return { success: false, message };
    }
    trackShareEvent('system', 'error', message);
    return { success: false, message };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Core API — openShareSheet
// ──────────────────────────────────────────────────────────────────────────

/**
 * Opens a share sheet with the given options, wrapping `Share.open()` from
 * `react-native-share`.
 *
 * When `options.social` is provided, the share is dispatched directly to
 * that platform via `Share.shareSingle()` (a 1-tap flow that bypasses the
 * system sheet). When `social` is omitted, the system share sheet is
 * presented via `Share.open()`.
 *
 * If `react-native-share` is not linked or unavailable, falls back to
 * React Native's built-in `Share.share()`. User cancellation resolves as
 * `{ success: false }` and never throws.
 *
 * @param options - Share content and optional platform target.
 * @returns A {@link ShareResult} indicating the outcome.
 */
export async function openShareSheet(
  options: ShareOptions,
): Promise<ShareResult> {
  const rns = getReactNativeShare();

  // ── Native module unavailable — fall back to RN Share ──
  if (!rns) {
    return fallbackShare(options);
  }

  const targetPlatform: ShareSocialPlatform | 'system' =
    options.social ?? 'system';

  try {
    // ── Direct platform targeting via shareSingle ──
    if (options.social) {
      const socialEnum = socialToEnum(options.social, rns.Social);
      if (socialEnum === null) {
        // No dedicated enum (e.g. TikTok, InstagramStories) — use the
        // system sheet. Story platforms are handled in instagramStory.ts.
        const openOptions: RNSShareOptions = {
          message: options.message,
          url: options.url,
          title: options.title,
          subject: options.subject,
          failOnCancel: false,
          excludedActivityTypes: options.excludedActivityTypes,
        };
        await rns.open(openOptions);
        trackShareEvent(targetPlatform, 'success');
        return { success: true };
      }

      const singleOptions: ShareSingleOptions = {
        social: socialEnum,
        message: options.message,
        url: options.url,
        subject: options.subject,
      };
      await rns.shareSingle(singleOptions);
      trackShareEvent(targetPlatform, 'success');
      return { success: true };
    }

    // ── System share sheet via Share.open ──
    const openOptions: RNSShareOptions = {
      message: options.message,
      url: options.url,
      title: options.title,
      subject: options.subject,
      failOnCancel: false,
      excludedActivityTypes: options.excludedActivityTypes,
    };
    await rns.open(openOptions);
    trackShareEvent('system', 'success');
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (isCancellation(message)) {
      trackShareEvent(targetPlatform, 'cancelled');
      return { success: false, message };
    }

    // App-not-installed or genuine error — try the system fallback once.
    trackShareEvent(targetPlatform, 'error', message);
    try {
      await rns.open({
        message: options.message,
        url: options.url,
        title: options.title,
        failOnCancel: false,
      });
      return { success: true };
    } catch {
      // Final fallback also failed — report the original error.
      return { success: false, message };
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Convenience helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Shares text-only content. When `social` is provided, targets that
 * platform directly; otherwise opens the system share sheet.
 *
 * @param text - The text body to share.
 * @param social - Optional platform to target directly.
 * @returns A {@link ShareResult} indicating the outcome.
 */
export async function shareText(
  text: string,
  social?: ShareSocialPlatform,
): Promise<ShareResult> {
  return openShareSheet({ message: text, social });
}

/**
 * Shares a URL with an optional accompanying message. When `social` is
 * provided, targets that platform directly; otherwise opens the system
 * share sheet.
 *
 * @param url - The URL to share.
 * @param message - Optional text accompanying the URL.
 * @param social - Optional platform to target directly.
 * @returns A {@link ShareResult} indicating the outcome.
 */
export async function shareLink(
  url: string,
  message?: string,
  social?: ShareSocialPlatform,
): Promise<ShareResult> {
  return openShareSheet({ url, message, social });
}

/**
 * Shares an image file with an optional accompanying message. The
 * `imagePath` should be a local `file://` URI — remote URLs must be
 * downloaded first by the caller.
 *
 * When `social` is provided, targets that platform directly; otherwise
 * opens the system share sheet.
 *
 * @param imagePath - Local file URI of the image to share.
 * @param message - Optional text accompanying the image.
 * @param social - Optional platform to target directly.
 * @returns A {@link ShareResult} indicating the outcome.
 */
export async function shareImage(
  imagePath: string,
  message?: string,
  social?: ShareSocialPlatform,
): Promise<ShareResult> {
  return openShareSheet({ url: imagePath, message, social });
}
