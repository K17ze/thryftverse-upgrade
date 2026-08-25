/**
 * Platform Share — Barrel Export
 *
 * Typed social share abstraction for ThryftVerse, enabling direct sharing
 * to Instagram Stories, TikTok, WhatsApp, Telegram, and the system share
 * sheet with pre-composed images and text.
 *
 * Usage:
 *   import { openShareSheet, shareToInstagramStory, useShareListing } from '../platform/share';
 *
 * New core utilities (shareSheet.ts) and the flagship Instagram Story
 * sharing module (instagramStory.ts) are re-exported below. Where a name
 * clashes with a legacy export from ./SocialShare, the new symbol is
 * aliased so both remain available without a duplicate-export error.
 *
 * Note: the legacy `ShareSheet` UI component (./ShareSheet.tsx) is NOT
 * re-exported from this barrel. On case-insensitive filesystems (Windows,
 * default macOS APFS) `./ShareSheet` and `./shareSheet` resolve to the
 * same `.ts` file, so re-exporting the component here would shadow the
 * core utilities module. Import the component directly from
 * `./ShareSheet` where needed — no internal consumer imports it via the
 * barrel.
 */

// ── Social share functions (legacy) ──
export {
  shareToInstagramStory,
  shareToListingToInstagramStory,
  shareToTikTok,
  shareToWhatsApp,
  shareToTelegram,
  shareToSystemSheet,
  shareToListing,
} from './SocialShare';

// ── useShareListing hook ──
export { useShareListing } from './useShareListing';

// ── Types (legacy) ──
export type {
  SocialShareTarget,
  InstagramStoryShareParams,
  TikTokShareParams,
  WhatsAppShareParams,
  TelegramShareParams,
  SystemSheetShareParams,
  ListingShareData,
  ShareParamsByTarget,
  ShareSheetParams,
  ShareSheetProps,
  ShareResult,
} from './types';

// ── Core share utilities (shareSheet.ts) ──
export {
  openShareSheet,
  shareText,
  shareLink,
  shareImage,
} from './shareSheet';
export type {
  ShareOptions,
  ShareSocialPlatform,
  // Aliased to avoid a duplicate-export clash with the legacy ShareResult
  // from ./types. The new core result type is exported as ShareSheetResult.
  ShareResult as ShareSheetResult,
} from './shareSheet';

// ── Instagram Story sharing (instagramStory.ts) ──
// `shareToInstagramStory` is aliased to `shareToIGStory` here to avoid a
// duplicate-export clash with the legacy `shareToInstagramStory` exported
// from ./SocialShare above. The new module is the canonical flagship
// implementation; the legacy export is retained for backward compatibility.
export {
  shareToInstagramStory as shareToIGStory,
  shareProductToInstagramStory,
  shareLookToInstagramStory,
} from './instagramStory';
export type {
  InstagramStoryOptions,
  ProductStoryShareData,
  LookStoryShareData,
} from './instagramStory';
