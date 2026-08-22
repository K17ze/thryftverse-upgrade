/**
 * Social Share Types — Thryftverse Platform Share Abstraction
 *
 * Typed contracts for direct sharing to social platforms (Instagram Stories,
 * TikTok, WhatsApp, Telegram) and the system share sheet fallback.
 *
 * Psychology: Sharing is the #1 growth loop for social commerce. Every share
 * is a free user acquisition with social proof. These types model the data
 * needed to compose a shareable asset (image + text + deep link) and dispatch
 * it to a specific platform with minimal friction.
 */

// ============================================================================
// SHARE TARGETS
// ============================================================================

/**
 * The social platforms we can target directly (bypassing the system sheet).
 * `'system'` is the fallback to the OS share sheet.
 */
export type SocialShareTarget =
  | 'instagram-story'
  | 'tiktok'
  | 'whatsapp'
  | 'telegram'
  | 'system';

// ============================================================================
// LOW-LEVEL SHARE PARAMS (per-platform)
// ============================================================================

/**
 * Parameters for sharing to Instagram Stories.
 *
 * Instagram's story composer has two layers:
 *   - Background layer: a full-bleed image (recommended 1080x1920, 9:16).
 *   - Sticker layer: a smaller image overlaid on the background (recommended
 *     640x480) — typically used for branding, price, or a call-to-action.
 *
 * At least one of `backgroundImageUri` or `stickerImageUri` must be provided.
 * The `attributionLink` becomes a tappable link in the story when the user
 * taps the sticker.
 */
export interface InstagramStoryShareParams {
  /** Full-resolution listing image for the story background (1080x1920 ideal). */
  backgroundImageUri: string;
  /** Optional sticker image (listing title + price overlay). ~640x480. */
  stickerImageUri?: string;
  /** Deep link back to the listing — tappable from the story sticker. */
  attributionLink?: string;
  /** Optional background gradient colors (top → bottom). */
  backgroundTopColor?: string;
  backgroundBottomColor?: string;
}

/**
 * Parameters for sharing to TikTok.
 *
 * TikTok accepts a video or an image with an optional caption.
 * If both are provided, video takes precedence on platforms that support it.
 */
export interface TikTokShareParams {
  /** Local file URI of a video to share. */
  videoUri?: string;
  /** Local file URI of an image to share. */
  imageUri?: string;
  /** Caption text to pre-fill in the TikTok composer. */
  caption?: string;
}

/**
 * Parameters for sharing to WhatsApp.
 *
 * WhatsApp accepts a text message and optionally an image attachment.
 */
export interface WhatsAppShareParams {
  /** Text message body. */
  message: string;
  /** Local file URI of an image to attach. */
  imageUri?: string;
}

/**
 * Parameters for sharing to Telegram.
 *
 * Telegram accepts a text message and optionally an image attachment.
 */
export interface TelegramShareParams {
  /** Text message body. */
  message: string;
  /** Local file URI of an image to attach. */
  imageUri?: string;
}

/**
 * Parameters for the system share sheet fallback.
 */
export interface SystemSheetShareParams {
  /** Text message body. */
  message: string;
  /** Local file URI or remote URL to share. */
  imageUri?: string;
  /** URL to share (e.g., listing deep link). */
  url?: string;
}

// ============================================================================
// HIGH-LEVEL LISTING SHARE DATA
// ============================================================================

/**
 * High-level listing data for the `shareToListing` convenience function.
 * This is the shape a screen passes when it wants to share a listing without
 * worrying about platform-specific composition.
 */
export interface ListingShareData {
  /** Stable listing id. */
  listingId: string;
  /** Listing title. */
  title: string;
  /** Price in GBP (the app's primary currency). */
  priceGbp: number;
  /** Primary image URI (remote URL or local file). */
  imageUri: string;
  /** Deep link back to the listing. */
  deepLink: string;
  /** Optional brand name for richer share text. */
  brand?: string | null;
}

/**
 * Union of all share parameter types, keyed by target.
 * Used by the ShareSheet component to dispatch to the correct function.
 */
export type ShareParamsByTarget = {
  'instagram-story': InstagramStoryShareParams;
  tiktok: TikTokShareParams;
  whatsapp: WhatsAppShareParams;
  telegram: TelegramShareParams;
  system: SystemSheetShareParams;
};

// ============================================================================
// SHARE SHEET PROPS
// ============================================================================

/**
 * Parameters passed to the ShareSheet bottom sheet.
 *
 * The sheet uses `ListingShareData` to compose platform-specific payloads
 * internally. If a pre-composed background image is available (from
 * `useShareListing.prepareListingImage`), pass it via `composedImageUri`
 * so the Instagram Story target can use it directly without recomposing.
 */
export interface ShareSheetParams {
  /** Listing data for composing share payloads. */
  listing: ListingShareData;
  /** Pre-composed 1080x1920 image for Instagram Story background. */
  composedImageUri?: string;
  /** Pre-composed sticker image (title + price overlay). */
  stickerImageUri?: string;
}

/**
 * Props for the ShareSheet component.
 */
export interface ShareSheetProps {
  /** Whether the sheet is visible. */
  visible: boolean;
  /** Called when the sheet is dismissed (by user or after a share action). */
  onClose: () => void;
  /** Share parameters — listing data + optional pre-composed images. */
  shareParams: ShareSheetParams | null;
}

// ============================================================================
// SHARE RESULT
// ============================================================================

/**
 * Result of a share operation.
 * `success: false` with `reason: 'cancelled'` means the user dismissed the
 * share sheet — this is NOT an error and should not be surfaced as one.
 */
export interface ShareResult {
  success: boolean;
  /** When `success` is false, explains why (cancelled, app-not-installed, error). */
  reason?: 'cancelled' | 'app-not-installed' | 'error';
  /** Error message when `reason` is 'error'. */
  message?: string;
}
