/**
 * SocialShare — Typed social share abstraction using react-native-share
 *
 * Enables direct sharing to Instagram Stories, TikTok, WhatsApp, Telegram,
 * and the system share sheet with pre-composed images and text.
 *
 * Design principles:
 *   - Every function checks if the target app is installed before attempting.
 *   - User cancellation resolves silently (no error thrown).
 *   - App-not-installed falls back to the system share sheet gracefully.
 *   - No `any` types — everything is strictly typed against react-native-share's
 *     exported interfaces.
 *
 * Psychology: For a social commerce app, the share-to-Instagram flow is a core
 * growth loop. Direct sharing to Instagram Story with a pre-composed image is
 * 1 tap vs. the system sheet's 3 taps (open sheet → select Instagram → select
 * Story). That friction difference is the difference between "I'll share this"
 * and "never mind."
 */

import { Platform, Linking } from 'react-native';
import Share, { Social } from 'react-native-share';
import type {
  ShareOptions,
  ShareSingleOptions,
  IsPackageInstalledResult,
} from 'react-native-share';
import type {
  InstagramStoryShareParams,
  TikTokShareParams,
  WhatsAppShareParams,
  TelegramShareParams,
  SystemSheetShareParams,
  ListingShareData,
  ShareResult,
} from './types';

// ============================================================================
// CONSTANTS — platform package names and URL schemes
// ============================================================================

/**
 * Android package names for app-installation checks.
 * Used with `Share.isPackageInstalled` on Android.
 */
const ANDROID_PACKAGES = {
  instagram: 'com.instagram.android',
  tiktok: 'com.zhiliaoapp.musically',
  whatsapp: 'com.whatsapp',
  telegram: 'org.telegram.messenger',
} as const;

/**
 * iOS URL schemes for app-installation checks.
 * Used with `Linking.canOpenURL` on iOS.
 */
const IOS_SCHEMES = {
  instagram: 'instagram://',
  tiktok: 'snssdk1233://',
  whatsapp: 'whatsapp://',
  telegram: 'tg://',
} as const;

/**
 * Facebook App ID placeholder for Instagram Stories sharing.
 * Instagram's Stories API requires a Facebook App ID. In production this
 * should come from app config / environment. The empty string fallback
 * works for basic background/sticker sharing on most installations.
 */
const FACEBOOK_APP_ID = '';

// ============================================================================
// APP INSTALLATION CHECKS
// ============================================================================

/**
 * Checks whether a target app is installed on the device.
 *
 * On Android, uses `Share.isPackageInstalled` which queries the package
 * manager. On iOS, uses `Linking.canOpenURL` against the app's URL scheme
 * (requires the scheme to be listed in LSApplicationQueriesSchemes).
 *
 * Returns `false` on any error — never throws.
 */
async function isAppInstalled(
  platform: 'instagram' | 'tiktok' | 'whatsapp' | 'telegram',
): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      const packageName = ANDROID_PACKAGES[platform];
      const result: IsPackageInstalledResult =
        await Share.isPackageInstalled(packageName);
      return result.isInstalled;
    }
    // iOS — canOpenURL is the standard check (requires queries schemes in Info.plist)
    const scheme = IOS_SCHEMES[platform];
    return await Linking.canOpenURL(scheme);
  } catch {
    return false;
  }
}

// ============================================================================
// ERROR HANDLING — cancellation is not an error
// ============================================================================

/**
 * Wraps a react-native-share call so that user cancellation resolves silently
 * rather than throwing. App-not-installed errors also resolve silently with
 * a fallback to the system sheet.
 *
 * react-native-share rejects with `error: "User did not share"` on cancel
 * and similar messages on failure. We normalise these into a `ShareResult`.
 */
async function executeShare(
  operation: () => Promise<unknown>,
  fallbackToSystem?: () => Promise<void>,
): Promise<ShareResult> {
  try {
    await operation();
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    // User cancelled — not an error
    if (
      message.includes('User did not share') ||
      message.includes('cancelled') ||
      message.includes('Canceled') ||
      message.includes('cancel')
    ) {
      return { success: false, reason: 'cancelled' };
    }

    // App not installed — try fallback
    if (
      message.includes('not installed') ||
      message.includes('not available') ||
      message.includes('cannot open') ||
      message.includes('Could not open')
    ) {
      if (fallbackToSystem) {
        await fallbackToSystem();
        return { success: false, reason: 'app-not-installed' };
      }
      return { success: false, reason: 'app-not-installed', message };
    }

    // Genuine error
    if (fallbackToSystem) {
      await fallbackToSystem();
    }
    return { success: false, reason: 'error', message };
  }
}

// ============================================================================
// SYSTEM SHEET FALLBACK
// ============================================================================

/**
 * Opens the OS system share sheet with the given message, image, and/or URL.
 *
 * This is the universal fallback — it works on every platform and every
 * device. User cancellation resolves silently.
 */
export async function shareToSystemSheet(
  params: SystemSheetShareParams,
): Promise<void> {
  const options: ShareOptions = {
    message: params.message,
    url: params.url,
    failOnCancel: false,
  };

  // react-native-share's `open` accepts `urls` for file-based image sharing.
  // On iOS, a local file URI in `url` shares the file; on Android, `urls` is
  // the correct field for file attachments.
  if (params.imageUri) {
    if (Platform.OS === 'android') {
      options.urls = [params.imageUri];
    } else {
      // iOS — use `url` for a single file, but if we also have a web URL,
      // prefer the file for the image and put the URL in the message.
      if (!options.url) {
        options.url = params.imageUri;
      } else {
        options.urls = [params.imageUri];
      }
    }
  }

  await executeShare(() => Share.open(options));
}

// ============================================================================
// INSTAGRAM STORIES
// ============================================================================

/**
 * Shares an image (and optional sticker) directly to Instagram Stories.
 *
 * This bypasses the system share sheet and opens Instagram's story composer
 * with the background image pre-loaded — a 1-tap share flow.
 *
 * Requirements:
 *   - Instagram app must be installed (checked before attempting).
 *   - `backgroundImageUri` should be a local file URI (file://). Remote URLs
 *     must be downloaded first (see `useShareListing.prepareListingImage`).
 *   - Recommended background size: 1080x1920 (9:16).
 *   - Recommended sticker size: 640x480.
 *
 * If Instagram is not installed, falls back to the system share sheet.
 * User cancellation resolves silently.
 */
export async function shareToInstagramStory(
  params: InstagramStoryShareParams,
): Promise<void> {
  const installed = await isAppInstalled('instagram');
  if (!installed) {
    // Fallback to system sheet with the background image
    await shareToSystemSheet({
      message: params.attributionLink ?? '',
      imageUri: params.backgroundImageUri,
      url: params.attributionLink,
    });
    return;
  }

  // InstagramStoriesShareSingleOptions is not exported from the main
  // module, so we construct the options as ShareSingleOptions with the
  // Instagram Stories-specific fields. The runtime accepts these fields
  // when social is Social.InstagramStories.
  const options = {
    social: Social.InstagramStories,
    appId: FACEBOOK_APP_ID,
    backgroundImage: params.backgroundImageUri,
    stickerImage: params.stickerImageUri,
    attributionURL: params.attributionLink,
    backgroundTopColor: params.backgroundTopColor,
    backgroundBottomColor: params.backgroundBottomColor,
  } as ShareSingleOptions;

  const result = await executeShare(() => Share.shareSingle(options));
  // If the share failed for a non-cancellation reason, try the system sheet
  if (!result.success && result.reason === 'error') {
    await shareToSystemSheet({
      message: params.attributionLink ?? '',
      imageUri: params.backgroundImageUri,
      url: params.attributionLink,
    });
  }
}

/**
 * Alias for `shareToInstagramStory` — shares a listing to Instagram Stories.
 * Semantically identical; the alias exists for call-site readability when
 * the caller knows they are sharing a listing.
 */
export async function shareToListingToInstagramStory(
  params: InstagramStoryShareParams,
): Promise<void> {
  return shareToInstagramStory(params);
}

// ============================================================================
// TIKTOK
// ============================================================================

/**
 * Shares a video or image to TikTok.
 *
 * TikTok's share integration accepts a video or image file with an optional
 * caption. If TikTok is not installed, falls back to the system share sheet.
 * User cancellation resolves silently.
 */
export async function shareToTikTok(params: TikTokShareParams): Promise<void> {
  const installed = await isAppInstalled('tiktok');
  if (!installed) {
    await shareToSystemSheet({
      message: params.caption ?? '',
      imageUri: params.imageUri,
      url: params.videoUri,
    });
    return;
  }

  // react-native-share does not have a dedicated TikTok social enum, so we
  // use the system sheet filtered toward TikTok via the package name on
  // Android, or the generic open on iOS. The `shareSingle` with Social
  // requires a supported social — TikTok is not in the Social enum, so we
  // use `Share.open` which presents the system sheet (the user selects TikTok).
  // This is still better than the raw RN Share API because we pre-attach the
  // media file.
  const assetUri = params.videoUri ?? params.imageUri;
  const options: ShareOptions = {
    message: params.caption ?? '',
    failOnCancel: false,
    title: 'Share to TikTok',
  };

  if (assetUri) {
    if (Platform.OS === 'android') {
      options.urls = [assetUri];
    } else {
      options.url = assetUri;
    }
  }

  const result = await executeShare(() => Share.open(options));
  if (!result.success && result.reason === 'error') {
    await shareToSystemSheet({
      message: params.caption ?? '',
      imageUri: params.imageUri,
      url: params.videoUri,
    });
  }
}

// ============================================================================
// WHATSAPP
// ============================================================================

/**
 * Shares a text message (and optional image) directly to WhatsApp.
 *
 * If WhatsApp is not installed, falls back to the system share sheet.
 * User cancellation resolves silently.
 */
export async function shareToWhatsApp(
  params: WhatsAppShareParams,
): Promise<void> {
  const installed = await isAppInstalled('whatsapp');
  if (!installed) {
    await shareToSystemSheet({
      message: params.message,
      imageUri: params.imageUri,
    });
    return;
  }

  // Use shareSingle for direct-to-WhatsApp (bypasses the system sheet)
  const options: ShareSingleOptions = {
    social: Social.Whatsapp,
    message: params.message,
  };

  // Attach image if provided — WhatsApp on Android uses `urls`, iOS uses `url`
  if (params.imageUri) {
    if (Platform.OS === 'android') {
      // ShareSingleOptions does not have `urls` in the base type, but the
      // runtime accepts it. We cast through ShareOptions which does.
      (options as ShareOptions).urls = [params.imageUri];
    } else {
      (options as ShareOptions).url = params.imageUri;
    }
  }

  const result = await executeShare(() => Share.shareSingle(options), () =>
    shareToSystemSheet({ message: params.message, imageUri: params.imageUri }),
  );
  void result;
}

// ============================================================================
// TELEGRAM
// ============================================================================

/**
 * Shares a text message (and optional image) directly to Telegram.
 *
 * If Telegram is not installed, falls back to the system share sheet.
 * User cancellation resolves silently.
 */
export async function shareToTelegram(
  params: TelegramShareParams,
): Promise<void> {
  const installed = await isAppInstalled('telegram');
  if (!installed) {
    await shareToSystemSheet({
      message: params.message,
      imageUri: params.imageUri,
    });
    return;
  }

  const options: ShareSingleOptions = {
    social: Social.Telegram,
    message: params.message,
  };

  if (params.imageUri) {
    if (Platform.OS === 'android') {
      (options as ShareOptions).urls = [params.imageUri];
    } else {
      (options as ShareOptions).url = params.imageUri;
    }
  }

  const result = await executeShare(() => Share.shareSingle(options), () =>
    shareToSystemSheet({ message: params.message, imageUri: params.imageUri }),
  );
  void result;
}

// ============================================================================
// HIGH-LEVEL LISTING SHARE
// ============================================================================

/**
 * High-level convenience: shares a listing via the system share sheet with
 * a composed message containing the listing title, price, and deep link.
 *
 * This is the simplest share path — no image composition, no platform
 * targeting. Use `useShareListing.shareToListingStory` for the Instagram
 * Story flow, or render `ShareSheet` for the platform-picker UI.
 */
export async function shareToListing(
  params: ListingShareData,
): Promise<void> {
  const priceFormatted = formatPrice(params.priceGbp);
  const brandPart = params.brand ? ` ${params.brand}` : '';
  const message = `Check out "${params.title}"${brandPart} — ${priceFormatted} on Thryftverse\n${params.deepLink}`;

  await shareToSystemSheet({
    message,
    imageUri: params.imageUri,
    url: params.deepLink,
  });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Formats a GBP price for share text.
 * Kept local to avoid importing the full price-formatting utility (which
 * may pull in i18n dependencies unnecessary for the share module).
 */
function formatPrice(priceGbp: number): string {
  return `\u00A3${priceGbp.toFixed(2)}`;
}
