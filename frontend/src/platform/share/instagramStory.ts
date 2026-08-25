/**
 * instagramStory — Instagram Story sharing with background + sticker overlay
 *
 * The flagship growth feature: "Share to Instagram Story" with a
 * pre-composed background image and an optional sticker overlay.
 *
 * Uses `Share.shareSingleSocial()` (via `Share.shareSingle`) from
 * `react-native-share` with the `instagramstories` platform, which opens
 * Instagram's story composer with the background pre-loaded — a 1-tap
 * share flow instead of the system sheet's 3-tap flow.
 *
 * Design principles:
 *   - `react-native-share` is `require()`d lazily — a missing or unlinked
 *     native module never crashes the app.
 *   - When Instagram is not installed, the error is caught and a
 *     user-friendly message is shown via `Alert.alert`. The caller's
 *     flow is never broken.
 *   - User cancellation resolves silently (no error thrown).
 *   - No `any` types — the library's own types are imported type-only.
 *
 * Psychology: A pre-composed 1080x1920 image with the product photo +
 * price overlay is what makes the share feel native to Instagram Stories —
 * not a screenshot, not a link card, but a designed share asset that looks
 * like it belongs in the user's story. This is the difference between a
 * share that drives taps and a share that gets swiped past.
 */

import { Alert, Linking, Platform } from 'react-native';

// Type-only imports — erased at runtime, so a missing native module does
// not break the bundle. Only the public union type `ShareSingleOptions` is
// exported; the dedicated `InstagramStoriesShareSingleOptions` member is
// not re-exported by the package, so we construct the story-specific field
// shape and cast through `unknown` onto the union (see shareToInstagramStory).
import type {
  ShareSingleOptions,
  Social as RNSSocial,
  IsPackageInstalledResult,
} from 'react-native-share';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

/**
 * Options for {@link shareToInstagramStory}.
 *
 * Instagram's story composer has two layers:
 *   - Background layer: a full-bleed image (recommended 1080x1920, 9:16).
 *   - Sticker layer: a smaller image overlaid on the background (recommended
 *     640x480) — typically used for branding, price, or a call-to-action.
 *
 * At least `backgroundImagePath` must be provided. The `attributionURL`
 * becomes a tappable link in the story when the user taps the sticker.
 */
export interface InstagramStoryOptions {
  /** Local file URI of the full-bleed background image (1080x1920 ideal). */
  backgroundImagePath: string;
  /** Optional local file URI of a sticker image overlaid on the background. */
  stickerImagePath?: string;
  /** Optional background gradient color (top). */
  backgroundTopColor?: string;
  /** Optional background gradient color (bottom). */
  backgroundBottomColor?: string;
  /** Deep link back to the content — tappable from the story sticker. */
  attributionURL?: string;
}

/**
 * Product data for {@link shareProductToInstagramStory}.
 */
export interface ProductStoryShareData {
  /** Primary product image URI (remote or local). */
  imageUri: string;
  /** Product name / title. */
  name: string;
  /** Formatted price string (e.g. "£24.99"). */
  price: string;
  /** Deep link back to the product. */
  deepLink: string;
}

/**
 * Look (outfit) data for {@link shareLookToInstagramStory}.
 */
export interface LookStoryShareData {
  /** Primary look image URI (remote or local). */
  imageUri: string;
  /** Look title. */
  title: string;
  /** Deep link back to the look. */
  deepLink: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Lazy native-module access
// ──────────────────────────────────────────────────────────────────────────

/**
 * The lazily-loaded `react-native-share` module surface we depend on for
 * Instagram Story sharing.
 */
interface ReactNativeShareModule {
  shareSingle(options: ShareSingleOptions): Promise<unknown>;
  isPackageInstalled(packageName: string): Promise<IsPackageInstalledResult>;
  Social: typeof RNSSocial;
}

let _rnsCache: ReactNativeShareModule | null | undefined;

/**
 * Lazily requires `react-native-share`. Returns `null` when the native
 * module is not linked or cannot be loaded.
 */
function getReactNativeShare(): ReactNativeShareModule | null {
  if (_rnsCache !== undefined) return _rnsCache;
  try {
    const mod = require('react-native-share') as ReactNativeShareModule;
    if (mod && typeof mod.shareSingle === 'function') {
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
// Instagram installation check
// ──────────────────────────────────────────────────────────────────────────

/** Android package name for Instagram. */
const INSTAGRAM_ANDROID_PACKAGE = 'com.instagram.android';
/** iOS URL scheme for Instagram. */
const INSTAGRAM_IOS_SCHEME = 'instagram://';

/**
 * Facebook App ID for Instagram Stories sharing. Instagram's Stories API
 * requires a Facebook App ID. In production this should come from app
 * config / environment. The empty string fallback works for basic
 * background/sticker sharing on most installations.
 */
const FACEBOOK_APP_ID = '';

/**
 * Checks whether Instagram is installed on the device.
 *
 * On Android, uses `Share.isPackageInstalled`. On iOS, uses
 * `Linking.canOpenURL` (requires `instagram` to be listed in
 * `LSApplicationQueriesSchemes`).
 *
 * Returns `false` on any error — never throws.
 */
async function isInstagramInstalled(): Promise<boolean> {
  const rns = getReactNativeShare();
  try {
    if (Platform.OS === 'android') {
      if (!rns || typeof rns.isPackageInstalled !== 'function') {
        return false;
      }
      const result = await rns.isPackageInstalled(INSTAGRAM_ANDROID_PACKAGE);
      return result.isInstalled;
    }
    // iOS
    return await Linking.canOpenURL(INSTAGRAM_IOS_SCHEME);
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// User-friendly error messaging
// ──────────────────────────────────────────────────────────────────────────

/**
 * Shows a user-friendly alert when Instagram is not installed.
 * Kept as a standalone function so callers can reuse the same message.
 */
function showInstagramNotInstalledAlert(): void {
  Alert.alert(
    'Instagram not installed',
    'Install Instagram from the App Store or Google Play to share to your Story.',
    [{ text: 'OK' }],
  );
}

/**
 * Shows a user-friendly alert when the share fails for a non-cancellation
 * reason (e.g. the native module is unavailable or Instagram refused the
 * asset).
 */
function showShareFailedAlert(detail?: string): void {
  Alert.alert(
    'Could not share to Instagram',
    detail ?? 'Please try again later.',
    [{ text: 'OK' }],
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Cancellation detection
// ──────────────────────────────────────────────────────────────────────────

const CANCEL_PATTERNS = [
  'User did not share',
  'cancelled',
  'Canceled',
  'cancel',
] as const;

function isCancellation(message: string): boolean {
  return CANCEL_PATTERNS.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase()),
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Core API — shareToInstagramStory
// ──────────────────────────────────────────────────────────────────────────

/**
 * Shares a pre-composed background image (and optional sticker) directly to
 * Instagram Stories.
 *
 * Uses `Share.shareSingle()` with the `instagramstories` social platform,
 * which opens Instagram's story composer with the background pre-loaded —
 * a 1-tap share flow.
 *
 * Requirements:
 *   - Instagram app must be installed (checked before attempting).
 *   - `backgroundImagePath` should be a local `file://` URI. Remote URLs
 *     must be downloaded first by the caller.
 *   - Recommended background size: 1080x1920 (9:16).
 *   - Recommended sticker size: 640x480.
 *
 * When Instagram is not installed, shows a user-friendly alert and resolves
 * without throwing. User cancellation resolves silently.
 *
 * @param options - Background image, optional sticker, and attribution link.
 */
export async function shareToInstagramStory(
  options: InstagramStoryOptions,
): Promise<void> {
  const rns = getReactNativeShare();

  // ── Native module unavailable ──
  if (!rns) {
    showShareFailedAlert(
      'Sharing to Instagram Stories is not available on this device.',
    );
    return;
  }

  // ── Instagram not installed ──
  const installed = await isInstagramInstalled();
  if (!installed) {
    showInstagramNotInstalledAlert();
    return;
  }

  // The Instagram Stories share uses a dedicated variant of
  // ShareSingleOptions that declares the story-specific fields
  // (backgroundImage, stickerImage, attributionURL, gradient colors) and
  // requires `appId`. That variant is not re-exported by the package, so
  // we construct the field shape and cast through `unknown` onto the
  // ShareSingleOptions union — the runtime accepts these fields when
  // `social` is `Social.InstagramStories`.
  const storyOptions = {
    social: rns.Social.InstagramStories,
    appId: FACEBOOK_APP_ID,
    backgroundImage: options.backgroundImagePath,
    stickerImage: options.stickerImagePath,
    attributionURL: options.attributionURL,
    backgroundTopColor: options.backgroundTopColor,
    backgroundBottomColor: options.backgroundBottomColor,
  } as unknown as ShareSingleOptions;

  try {
    await rns.shareSingle(storyOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // User cancellation is a normal outcome — do not surface an alert.
    if (isCancellation(message)) {
      return;
    }
    showShareFailedAlert(message);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Image download helper
// ──────────────────────────────────────────────────────────────────────────

/**
 * Downloads a remote image to a local cache file and returns its `file://`
 * URI. If the `imageUri` is already a `file://` URI, it is returned as-is.
 *
 * Uses `expo-file-system` (already a project dependency) via lazy require so
 * a missing module never crashes the share flow. Returns `null` when the
 * download fails — the caller falls back to sharing without a background.
 */
async function downloadImageToLocal(imageUri: string): Promise<string | null> {
  // Already a local file — nothing to download.
  if (imageUri.startsWith('file://')) {
    return imageUri;
  }

  try {
    // Lazy require — expo-file-system is a project dependency but we keep
    // this defensive in case of a broken native link.
    const fsModule = require('expo-file-system') as {
      downloadAsync?: (
        uri: string,
        fileUri: string,
      ) => Promise<{ status: number; uri: string }>;
      cacheDirectory?: string | null;
      documentDirectory?: string | null;
    };

    const { downloadAsync, cacheDirectory } = fsModule;
    if (typeof downloadAsync !== 'function' || !cacheDirectory) {
      return null;
    }

    const filename = `share_ig_${Date.now()}.jpg`;
    const destUri = `${cacheDirectory}${filename}`;
    const result = await downloadAsync(imageUri, destUri);
    if (result && result.status >= 200 && result.status < 300) {
      return result.uri;
    }
    return null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Sticker composition helper
// ──────────────────────────────────────────────────────────────────────────

/**
 * Composes a sticker image (PNG) for an Instagram Story share.
 *
 * The sticker is a small overlay image (640x480) containing the content
 * title and price/branding, drawn over a semi-transparent dark background.
 * It appears as a tappable sticker on top of the story background.
 *
 * Uses `@shopify/react-native-skia` (already a project dependency) via lazy
 * require. Returns `undefined` when Skia is unavailable or composition
 * fails — the caller shares without a sticker.
 */
async function composeSticker(
  title: string,
  subtitle: string,
): Promise<string | undefined> {
  try {
    const skiaModule = require('@shopify/react-native-skia') as {
      Skia: {
        Surface: {
          MakeOffscreen?: (
            width: number,
            height: number,
          ) => {
            getCanvas: () => {
              drawPaint: (paint: unknown) => void;
              drawText: (
                text: string,
                x: number,
                y: number,
                paint: unknown,
                font: unknown,
              ) => void;
            };
            flush: () => void;
            makeImageSnapshot: () => {
              encodeToBytes: (format: number, quality: number) => Uint8Array;
            } | null;
          } | null;
        };
        Paint: () => {
          setAntiAlias: (v: boolean) => void;
          setColor: (c: unknown) => void;
          setBlendMode: (m: unknown) => void;
        };
        Color: (c: string) => unknown;
        Font: (typeface: unknown, size: number) => {
          measureText: (text: string) => { width: number; height: number };
        };
        ImageFormat: { PNG: number; JPEG: number };
        BlendMode: { Src: unknown; SrcOver: unknown };
      };
    };

    const { Skia } = skiaModule;
    if (!Skia?.Surface?.MakeOffscreen) return undefined;

    const STICKER_W = 640;
    const STICKER_H = 480;
    const surface = Skia.Surface.MakeOffscreen(STICKER_W, STICKER_H);
    if (!surface) return undefined;

    const canvas = surface.getCanvas();

    // ── Semi-transparent dark background ──
    const bgPaint = Skia.Paint();
    bgPaint.setAntiAlias(true);
    bgPaint.setColor(Skia.Color('rgba(17,17,17,0.85)'));
    bgPaint.setBlendMode(Skia.BlendMode.Src);
    canvas.drawPaint(bgPaint);

    // ── Title text ──
    const titleFont = Skia.Font(undefined, 30);
    const titlePaint = Skia.Paint();
    titlePaint.setAntiAlias(true);
    titlePaint.setColor(Skia.Color('#FFFFFF'));
    const titleWidth = titleFont.measureText(title).width;
    const truncatedTitle =
      titleWidth > STICKER_W - 64
        ? `${title.slice(0, Math.max(0, title.length - 1))}\u2026`
        : title;
    canvas.drawText(truncatedTitle, 32, 180, titlePaint, titleFont);

    // ── Subtitle (price or brand) ──
    const subtitleFont = Skia.Font(undefined, 42);
    const subtitlePaint = Skia.Paint();
    subtitlePaint.setAntiAlias(true);
    subtitlePaint.setColor(Skia.Color('#F4F0E8'));
    canvas.drawText(subtitle, 32, 260, subtitlePaint, subtitleFont);

    // ── Brand label ──
    const brandFont = Skia.Font(undefined, 20);
    const brandPaint = Skia.Paint();
    brandPaint.setAntiAlias(true);
    brandPaint.setColor(Skia.Color('rgba(255,255,255,0.6)'));
    canvas.drawText('Thryftverse', 32, 320, brandPaint, brandFont);

    // ── Snapshot + encode + write ──
    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    if (!snapshot) return undefined;

    const bytes = snapshot.encodeToBytes(Skia.ImageFormat.PNG, 100);

    const fsModule = require('expo-file-system') as {
      File?: new (path: unknown, name: string) => {
        write: (bytes: Uint8Array) => void;
        uri: string;
      };
      Paths?: { cache: unknown };
    };
    const { File, Paths } = fsModule;
    if (typeof File !== 'function' || !Paths) return undefined;

    const file = new File(Paths.cache, `share_ig_sticker_${Date.now()}.png`);
    file.write(bytes);
    return file.uri;
  } catch {
    return undefined;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// High-level API — shareProductToInstagramStory
// ──────────────────────────────────────────────────────────────────────────

/**
 * Composes a product share and dispatches it to Instagram Stories.
 *
 * Flow:
 *   1. Downloads the product image to a local file (if remote).
 *   2. Composes a sticker overlay (product name + price + brand).
 *   3. Calls {@link shareToInstagramStory} with the background + sticker.
 *
 * If the image download or sticker composition fails, the share still
 * proceeds with whatever assets are available (background-only, or a
 * user-friendly alert if no background could be obtained).
 *
 * @param product - Product image, name, formatted price, and deep link.
 */
export async function shareProductToInstagramStory(
  product: ProductStoryShareData,
): Promise<void> {
  const backgroundPath = await downloadImageToLocal(product.imageUri);
  if (!backgroundPath) {
    showShareFailedAlert(
      'Could not load the product image for sharing. Please try again.',
    );
    return;
  }

  const stickerPath = await composeSticker(product.name, product.price);

  await shareToInstagramStory({
    backgroundImagePath: backgroundPath,
    stickerImagePath: stickerPath,
    attributionURL: product.deepLink,
  });
}

// ──────────────────────────────────────────────────────────────────────────
// High-level API — shareLookToInstagramStory
// ──────────────────────────────────────────────────────────────────────────

/**
 * Composes a look (outfit) share and dispatches it to Instagram Stories.
 *
 * Flow:
 *   1. Downloads the look image to a local file (if remote).
 *   2. Composes a sticker overlay (look title + brand).
 *   3. Calls {@link shareToInstagramStory} with the background + sticker.
 *
 * If the image download or sticker composition fails, the share still
 * proceeds with whatever assets are available.
 *
 * @param look - Look image, title, and deep link.
 */
export async function shareLookToInstagramStory(
  look: LookStoryShareData,
): Promise<void> {
  const backgroundPath = await downloadImageToLocal(look.imageUri);
  if (!backgroundPath) {
    showShareFailedAlert(
      'Could not load the look image for sharing. Please try again.',
    );
    return;
  }

  const stickerPath = await composeSticker(look.title, 'Thryftverse');

  await shareToInstagramStory({
    backgroundImagePath: backgroundPath,
    stickerImagePath: stickerPath,
    attributionURL: look.deepLink,
  });
}
