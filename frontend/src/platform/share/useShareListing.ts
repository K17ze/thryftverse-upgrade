/**
 * useShareListing — Hook for preparing listing data for social sharing
 *
 * Provides:
 *   - `shareToListingStory(listing)` — shares to Instagram Story with a
 *     composed 1080x1920 image (listing photo + title + price overlay).
 *   - `shareToListingSheet(listing)` — opens the ShareSheet bottom sheet
 *     for the user to pick a platform.
 *   - `prepareListingImage(listing)` — composes a shareable 1080x1920 image
 *     with the listing photo as background and title/price text overlay.
 *     Returns a `file://` URI to the temp file.
 *
 * Image composition uses @shopify/react-native-skia (already in package.json)
 * for GPU-accelerated offscreen rendering, and expo-file-system for temp
 * file management. No new native dependencies are added.
 *
 * Psychology: The composed image is the core of the share-to-Instagram flow.
 * A pre-composed 1080x1920 image with the listing photo + price overlay is
 * what makes the share feel native to Instagram Stories — not a screenshot,
 * not a link card, but a designed share asset that looks like it belongs in
 * the user's story.
 */

import { useCallback, useRef } from 'react';
import { File, Paths } from 'expo-file-system';
import { shareToInstagramStory } from './SocialShare';
import { useToast } from '../../context/ToastContext';
import type { ListingShareData, ShareSheetParams } from './types';
import type { SkImage, SkFont } from '@shopify/react-native-skia';

type SkiaModule = typeof import('@shopify/react-native-skia');

let cachedSkia: SkiaModule | null | undefined;

async function getSkia(): Promise<SkiaModule | null> {
  if (cachedSkia !== undefined) return cachedSkia;
  try {
    cachedSkia = await import('@shopify/react-native-skia');
    return cachedSkia;
  } catch {
    cachedSkia = null;
    return null;
  }
}

// ============================================================================
// CONSTANTS — Instagram Story dimensions
// ============================================================================

/** Instagram Story background image dimensions (9:16). */
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

/** Sticker image dimensions (recommended by Instagram API). */
const STICKER_WIDTH = 640;
const STICKER_HEIGHT = 480;

/** Cache key prefix for composed share images. */
const SHARE_CACHE_PREFIX = 'share_composed_';

// ============================================================================
// SKIA AVAILABILITY GUARD
// ============================================================================

let _skiaAvailable: boolean | null = null;

async function isSkiaAvailable(): Promise<boolean> {
  if (_skiaAvailable !== null) return _skiaAvailable;
  try {
    const mod = await getSkia();
    _skiaAvailable = !!(mod && mod.Skia && mod.Skia.Surface && mod.Skia.Paint() && mod.Skia.Path);
  } catch {
    _skiaAvailable = false;
  }
  return _skiaAvailable;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Converts a Uint8Array to a base64 string without relying on Node Buffer.
 * Uses chunked encoding to avoid call-stack limits on large arrays.
 * (Same implementation as MaskRenderer — kept local to avoid a cross-module
 * dependency on creator internals.)
 */
function uint8ToBase64(bytes: Uint8Array): string {
  const lookup =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const len = bytes.length;
  let output = '';
  let i = 0;
  while (i < len) {
    const b1 = bytes[i++] ?? 0;
    const b2 = bytes[i++] ?? 0;
    const b3 = bytes[i++] ?? 0;
    const e1 = b1 >> 2;
    const e2 = ((b1 & 0x03) << 4) | (b2 >> 4);
    const e3 = ((b2 & 0x0f) << 2) | (b3 >> 6);
    const e4 = b3 & 0x3f;
    output +=
      lookup[e1] +
      lookup[e2] +
      (i > len + 1 ? '=' : lookup[e3]) +
      (i > len ? '=' : lookup[e4]);
  }
  return output;
}

/**
 * Writes Skia image bytes to a temp file in the cache directory.
 * Returns the `file://` URI of the written file.
 */
function writeImageToFile(
  bytes: Uint8Array,
  filename: string,
): string {
  const file = new File(Paths.cache, filename);
  file.write(bytes);
  return file.uri;
}

/**
 * Loads an image from a URI (remote or local) into an SkImage.
 * Uses `Skia.Data.fromURI` which handles both `http(s)://` and `file://` URIs.
 */
async function loadImage(mod: SkiaModule, uri: string): Promise<SkImage | null> {
  try {
    const data = await mod.Skia.Data.fromURI(uri);
    return mod.Skia.Image.MakeImageFromEncoded(data);
  } catch {
    return null;
  }
}

/**
 * Computes the source crop rect for cover-fitting an image into a target
 * rectangle (like CSS `object-fit: cover`). Returns the source rect to
 * pass to `drawImageRect`.
 */
function coverFitSrcRect(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
): { x: number; y: number; width: number; height: number } {
  const srcRatio = srcW / srcH;
  const destRatio = destW / destH;

  let cropW: number;
  let cropH: number;

  if (srcRatio > destRatio) {
    // Source is wider — crop width
    cropH = srcH;
    cropW = Math.round(srcH * destRatio);
  } else {
    // Source is taller — crop height
    cropW = srcW;
    cropH = Math.round(srcW / destRatio);
  }

  return {
    x: Math.round((srcW - cropW) / 2),
    y: Math.round((srcH - cropH) / 2),
    width: cropW,
    height: cropH,
  };
}

/**
 * Truncates text to fit within a max width, appending an ellipsis if needed.
 */
function truncateText(
  text: string,
  maxWidth: number,
  font: SkFont,
): string {
  const measured = font.measureText(text);
  if (measured.width <= maxWidth) return text;

  const ellipsis = '\u2026';
  const ellipsisWidth = font.measureText(ellipsis).width;
  let truncated = text;
  while (
    truncated.length > 0 &&
    font.measureText(truncated).width + ellipsisWidth > maxWidth
  ) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.length > 0 ? truncated + ellipsis : ellipsis;
}

// ============================================================================
// IMAGE COMPOSITION
// ============================================================================

/**
 * Composes a 1080x1920 Instagram Story background image from a listing.
 *
 * The composition:
 *   1. Fills the canvas with a dark background color (fallback if image fails).
 *   2. Draws the listing image cover-fitted to 1080x1920.
 *   3. Draws a gradient overlay at the bottom (transparent → dark) for text
 *      legibility.
 *   4. Draws the listing title (white, semibold) and price (white, bold) at
 *      the bottom of the image.
 *   5. Draws a "Thryftverse" brand label at the top.
 *
 * Returns a `file://` URI to the composed JPEG in the cache directory.
 */
async function composeStoryBackground(
  listing: ListingShareData,
): Promise<string> {
  const mod = await getSkia();
  if (!mod || !(await isSkiaAvailable())) {
    throw new Error('Skia is not available — cannot compose share image.');
  }

  const { Skia, BlendMode, TileMode, ImageFormat } = mod;
  const surface = Skia.Surface.MakeOffscreen(STORY_WIDTH, STORY_HEIGHT);
  if (!surface) {
    throw new Error('Failed to create offscreen Skia surface for share image.');
  }

  const canvas = surface.getCanvas();

  // ── 1. Dark background fallback ──
  const bgPaint = Skia.Paint();
  bgPaint.setColor(Skia.Color('#111111'));
  bgPaint.setBlendMode(BlendMode.Src);
  canvas.drawPaint(bgPaint);

  // ── 2. Listing image cover-fitted ──
  const listingImage = await loadImage(mod, listing.imageUri);
  if (listingImage) {
    const srcW = listingImage.width();
    const srcH = listingImage.height();
    const src = coverFitSrcRect(srcW, srcH, STORY_WIDTH, STORY_HEIGHT);
    const imagePaint = Skia.Paint();
    imagePaint.setAntiAlias(true);
    imagePaint.setBlendMode(BlendMode.SrcOver);
    canvas.drawImageRect(
      listingImage,
      { x: src.x, y: src.y, width: src.width, height: src.height },
      { x: 0, y: 0, width: STORY_WIDTH, height: STORY_HEIGHT },
      imagePaint,
    );
  }

  // ── 3. Bottom gradient overlay for text legibility ──
  const gradientStart = { x: 0, y: STORY_HEIGHT - 500 };
  const gradientEnd = { x: 0, y: STORY_HEIGHT };
  const shader = Skia.Shader.MakeLinearGradient(
    gradientStart,
    gradientEnd,
    [Skia.Color('rgba(0,0,0,0)'), Skia.Color('rgba(0,0,0,0.75)')],
    [0, 1],
    TileMode.Clamp,
  );
  if (shader) {
    const gradientPaint = Skia.Paint();
    gradientPaint.setShader(shader);
    gradientPaint.setBlendMode(BlendMode.SrcOver);
    canvas.drawRect(
      { x: 0, y: STORY_HEIGHT - 500, width: STORY_WIDTH, height: 500 },
      gradientPaint,
  );
  }

  // ── 4. Title + price text at the bottom ──
  const textPaint = Skia.Paint();
  textPaint.setAntiAlias(true);
  textPaint.setColor(Skia.Color('#FFFFFF'));

  const titleFont = Skia.Font(undefined, 42);
  const priceFont = Skia.Font(undefined, 56);

  const padding = 64;
  const maxTextWidth = STORY_WIDTH - padding * 2;
  const textBottom = STORY_HEIGHT - 120;

  // Price (bold, larger) — drawn first so title sits above it
  const priceText = `\u00A3${listing.priceGbp.toFixed(2)}`;
  const priceMeasured = priceFont.measureText(priceText);
  canvas.drawText(
    priceText,
    padding,
    textBottom,
    textPaint,
    priceFont,
  );

  // Title (semibold, smaller) — above the price
  const titleText = truncateText(listing.title, maxTextWidth, titleFont);
  canvas.drawText(
    titleText,
    padding,
    textBottom - priceMeasured.height - 20,
    textPaint,
    titleFont,
  );

  // ── 5. Brand label at top ──
  const brandFont = Skia.Font(undefined, 28);
  const brandPaint = Skia.Paint();
  brandPaint.setAntiAlias(true);
  brandPaint.setColor(Skia.Color('rgba(255,255,255,0.7)'));
  canvas.drawText('Thryftverse', padding, 80, brandPaint, brandFont);

  // ── Snapshot + encode + write ──
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  if (!snapshot) {
    throw new Error('Failed to snapshot composed share image.');
  }

  const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, 0.85);
  const filename = `${SHARE_CACHE_PREFIX}${listing.listingId}_bg.jpg`;
  return writeImageToFile(bytes, filename);
}

/**
 * Composes a 640x480 sticker image with the listing title and price.
 * This appears as a tappable sticker overlay on the Instagram Story.
 */
async function composeStickerImage(
  listing: ListingShareData,
): Promise<string> {
  const mod = await getSkia();
  if (!mod || !(await isSkiaAvailable())) {
    throw new Error('Skia is not available — cannot compose sticker image.');
  }

  const { Skia, BlendMode, ImageFormat } = mod;
  const surface = Skia.Surface.MakeOffscreen(STICKER_WIDTH, STICKER_HEIGHT);
  if (!surface) {
    throw new Error('Failed to create offscreen Skia surface for sticker.');
  }

  const canvas = surface.getCanvas();

  // ── Rounded rect background with semi-transparent dark fill ──
  const bgPaint = Skia.Paint();
  bgPaint.setAntiAlias(true);
  bgPaint.setColor(Skia.Color('rgba(17,17,17,0.85)'));
  bgPaint.setBlendMode(BlendMode.Src);
  canvas.drawPaint(bgPaint);

  // ── Title text ──
  const titleFont = Skia.Font(undefined, 28);
  const titlePaint = Skia.Paint();
  titlePaint.setAntiAlias(true);
  titlePaint.setColor(Skia.Color('#FFFFFF'));

  const padding = 32;
  const maxTextWidth = STICKER_WIDTH - padding * 2;
  const titleText = truncateText(listing.title, maxTextWidth, titleFont);
  canvas.drawText(titleText, padding, 180, titlePaint, titleFont);

  // ── Price text (larger, bold) ──
  const priceFont = Skia.Font(undefined, 40);
  const pricePaint = Skia.Paint();
  pricePaint.setAntiAlias(true);
  pricePaint.setColor(Skia.Color('#F4F0E8'));
  const priceText = `\u00A3${listing.priceGbp.toFixed(2)}`;
  canvas.drawText(priceText, padding, 260, pricePaint, priceFont);

  // ── Brand label ──
  const brandFont = Skia.Font(undefined, 20);
  const brandPaint = Skia.Paint();
  brandPaint.setAntiAlias(true);
  brandPaint.setColor(Skia.Color('rgba(255,255,255,0.6)'));
  canvas.drawText('Thryftverse', padding, 320, brandPaint, brandFont);

  // ── Snapshot + encode + write ──
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  if (!snapshot) {
    throw new Error('Failed to snapshot sticker image.');
  }

  const bytes = snapshot.encodeToBytes(ImageFormat.PNG, 100);
  const filename = `${SHARE_CACHE_PREFIX}${listing.listingId}_sticker.png`;
  return writeImageToFile(bytes, filename);
}

// ============================================================================
// LISTING → SHARE DATA MAPPING
// ============================================================================

/**
 * Maps a ListingLike (the domain Listing or DiscoveryListingSummary) to the
 * ListingShareData needed by the share functions.
 *
 * This is a loose structural mapping — any object with the required fields
 * works. The caller passes the listing; this normalises it.
 */
function toListingShareData(
  listing: ListingLike,
): ListingShareData {
  const deepLink = `https://thryftverse.com/listing/${listing.id}`;
  const imageUri = listing.images[0] ?? '';
  return {
    listingId: listing.id,
    title: listing.title,
    priceGbp: listing.price,
    imageUri,
    deepLink,
    brand: listing.brand ?? null,
  };
}

/**
 * Structural interface for any listing-like object that can be shared.
 * Matches both the domain `Listing` and `DiscoveryListingSummary` without
 * importing either (avoids coupling the share module to domain contracts).
 */
interface ListingLike {
  id: string;
  title: string;
  brand?: string | null;
  price: number;
  images: string[];
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook that prepares listing data for sharing.
 *
 * Returns:
 *   - `shareToListingStory(listing)` — composes a 1080x1920 image and shares
 *     directly to Instagram Stories (1-tap flow).
 *   - `shareToListingSheet(listing)` — returns ShareSheetParams for the
 *     ShareSheet component. The caller renders the sheet.
 *   - `prepareListingImage(listing)` — composes and caches the background
 *     image, returning its `file://` URI.
 */
export function useShareListing(): {
  shareToListingStory: (listing: ListingLike) => Promise<void>;
  shareToListingSheet: (listing: ListingLike) => Promise<ShareSheetParams>;
  prepareListingImage: (listing: ListingLike) => Promise<string>;
} {
  // Cache composed image URIs so we don't recompose if the user shares
  // the same listing twice.
  const imageCache = useRef<Map<string, { bg: string; sticker: string }>>(
    new Map(),
  );
  const { show } = useToast();

  /**
   * Composes a 1080x1920 background image and a 640x480 sticker image for
   * the listing, caching the results. Returns the background URI.
   */
  const prepareListingImage = useCallback(
    async (listing: ListingLike): Promise<string> => {
      const data = toListingShareData(listing);
      const cached = imageCache.current.get(data.listingId);
      if (cached) return cached.bg;

      const [bgUri, stickerUri] = await Promise.all([
        composeStoryBackground(data),
        composeStickerImage(data).catch(() => undefined as string | undefined),
      ]);

      imageCache.current.set(data.listingId, {
        bg: bgUri,
        sticker: stickerUri ?? '',
      });

      return bgUri;
    },
    [],
  );

  /**
   * Shares a listing directly to Instagram Stories with a composed image.
   * Composes the image on-the-fly if not cached.
   */
  const shareToListingStory = useCallback(
    async (listing: ListingLike): Promise<void> => {
      const data = toListingShareData(listing);

      try {
        const cached = imageCache.current.get(data.listingId);
        let bgUri: string;
        let stickerUri: string | undefined;

        if (cached) {
          bgUri = cached.bg;
          stickerUri = cached.sticker || undefined;
        } else {
          bgUri = await composeStoryBackground(data);
          stickerUri = await composeStickerImage(data).catch(
            () => undefined as string | undefined,
          );
          imageCache.current.set(data.listingId, {
            bg: bgUri,
            sticker: stickerUri ?? '',
          });
        }

        await shareToInstagramStory({
          backgroundImageUri: bgUri,
          stickerImageUri: stickerUri,
          attributionLink: data.deepLink,
        });
      } catch {
        // Fallback to system sheet if composition fails
        show('Could not compose share image — sharing via the system sheet instead.', 'info');
        const { shareToSystemSheet } = await import('./SocialShare');
        await shareToSystemSheet({
          message: `Check out "${data.title}" — \u00A3${data.priceGbp.toFixed(2)} on Thryftverse\n${data.deepLink}`,
          imageUri: data.imageUri,
          url: data.deepLink,
        });
      }
    },
    [show],
  );

  /**
   * Prepares listing data and composed images for the ShareSheet component.
   * The caller uses the returned params to render `<ShareSheet>`.
   */
  const shareToListingSheet = useCallback(
    async (listing: ListingLike): Promise<ShareSheetParams> => {
      const data = toListingShareData(listing);

      // Try to compose the image in advance so the Instagram Story target
      // has it ready. If composition fails, the sheet still works — it
      // falls back to the raw listing image.
      let composedImageUri: string | undefined;
      let stickerImageUri: string | undefined;
      try {
        composedImageUri = await prepareListingImage(listing);
        const cached = imageCache.current.get(data.listingId);
        stickerImageUri = cached?.sticker || undefined;
      } catch {
        // Composition failed — sheet will use raw listing image
      }

      return {
        listing: data,
        composedImageUri,
        stickerImageUri,
      };
    },
    [prepareListingImage],
  );

  return {
    shareToListingStory,
    shareToListingSheet,
    prepareListingImage,
  };
}
