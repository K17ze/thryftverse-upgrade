/**
 * Image derivative generation pipeline using sharp.
 *
 * Produces a responsive ladder of JPEG and WebP derivatives at widths
 * [200, 400, 800, 1200, 2000], an AVIF derivative at 800w, and a low-quality
 * image placeholder (LQIP) — a 20px-wide blurred JPEG encoded as a base64
 * data URI suitable for inline embedding.
 *
 * Cover crops use sharp's attention-based strategy so focal points are
 * preserved when downscaling. Each derivative is returned as a Buffer plus
 * metadata so the orchestrator can upload it to S3 and record it in
 * `media_derivatives`.
 *
 * @packageDocumentation
 */

import sharp from 'sharp';
import { logger } from '../logger.js';

export interface ImageDerivative {
  variant: string;
  format: 'jpeg' | 'webp' | 'avif';
  width: number;
  height: number;
  contentType: string;
  buffer: Buffer;
}

export interface ImageDerivativeSet {
  derivatives: ImageDerivative[];
  lqip: string;
  /**
   * Decodable BlurHash placeholder string (https://blurha.sh), or null when
   * the source pixels could not be encoded. Consumers pass this straight to
   * `expo-image`'s `placeholder={{ blurhash }}` prop.
   */
  blurhash: string | null;
}

const RESPONSIVE_WIDTHS = [200, 400, 800, 1200, 2000] as const;
const AVIF_WIDTH = 800;
const LQIP_WIDTH = 20;

const JPEG_QUALITY = 82;
const WEBP_QUALITY = 82;
const AVIF_QUALITY = 50;

function variantName(width: number, format: 'jpeg' | 'webp' | 'avif'): string {
  return `${format}_${width}w`;
}

/**
 * Generates the full set of image derivatives for the supplied source buffer.
 *
 * Derivatives are only generated for widths that do not exceed the source
 * width — upscaling is never performed. If the source is smaller than the
 * smallest responsive width, a single derivative at the source width is
 * produced for each format.
 */
export async function generateImageDerivatives(
  inputBuffer: Buffer,
): Promise<ImageDerivativeSet> {
  // Decode + read metadata from the raw input first — metadata() reports
  // pre-rotation dimensions, so the EXIF-corrected ladder is sized against
  // `autoOrient` values (which account for orientation tags 5–8 swapping
  // width/height).
  const probe = sharp(inputBuffer, { failOn: 'none' });
  const metadata = await probe.metadata();
  const sourceWidth = metadata.autoOrient?.width ?? metadata.width ?? 0;
  const sourceHeight = metadata.autoOrient?.height ?? metadata.height ?? 0;

  if (sourceWidth === 0 || sourceHeight === 0) {
    throw new Error('sharp could not decode image dimensions from the source buffer');
  }

  // Derivative pipeline: .rotate() applies the EXIF orientation before
  // resizing (and drops the Orientation tag), .keepIccProfile() carries the
  // embedded colour profile into every output so storefront imagery keeps
  // its authored colour instead of collapsing to sRGB.
  const source = sharp(inputBuffer, { failOn: 'none' })
    .rotate()
    .keepIccProfile();

  const derivatives: ImageDerivative[] = [];
  const targetWidths: number[] = RESPONSIVE_WIDTHS.filter((width) => width <= sourceWidth);
  if (targetWidths.length === 0) {
    targetWidths.push(sourceWidth);
  }

  for (const width of targetWidths) {
    // JPEG derivative
    const jpegBuffer = await source
      .clone()
      .resize({
        width,
        withoutEnlargement: true,
        fit: sharp.fit.cover,
        position: sharp.strategy.attention,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    const jpegMeta = await sharp(jpegBuffer).metadata();
    derivatives.push({
      variant: variantName(width, 'jpeg'),
      format: 'jpeg',
      width: jpegMeta.width ?? width,
      height: jpegMeta.height ?? 0,
      contentType: 'image/jpeg',
      buffer: jpegBuffer,
    });

    // WebP derivative
    const webpBuffer = await source
      .clone()
      .resize({
        width,
        withoutEnlargement: true,
        fit: sharp.fit.cover,
        position: sharp.strategy.attention,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    const webpMeta = await sharp(webpBuffer).metadata();
    derivatives.push({
      variant: variantName(width, 'webp'),
      format: 'webp',
      width: webpMeta.width ?? width,
      height: webpMeta.height ?? 0,
      contentType: 'image/webp',
      buffer: webpBuffer,
    });
  }

  // AVIF derivative at 800w (or source width if smaller).
  const avifWidth = Math.min(AVIF_WIDTH, sourceWidth);
  const avifBuffer = await source
    .clone()
    .resize({
      width: avifWidth,
      withoutEnlargement: true,
      fit: sharp.fit.cover,
      position: sharp.strategy.attention,
    })
    .avif({ quality: AVIF_QUALITY })
    .toBuffer();
  const avifMeta = await sharp(avifBuffer).metadata();
  derivatives.push({
    variant: variantName(avifWidth, 'avif'),
    format: 'avif',
    width: avifMeta.width ?? avifWidth,
    height: avifMeta.height ?? 0,
    contentType: 'image/avif',
    buffer: avifBuffer,
  });

  // LQIP — 20px-wide blurred JPEG encoded as a base64 data URI. The ICC
  // profile is deliberately not embedded here: at 20px the blurred pixels
  // carry no useful colour fidelity and the profile would dominate the
  // payload size.
  const lqipBuffer = await sharp(inputBuffer, { failOn: 'none' })
    .rotate()
    .resize({ width: LQIP_WIDTH, withoutEnlargement: true })
    .blur(5)
    .jpeg({ quality: 60 })
    .toBuffer();
  const lqip = `data:image/jpeg;base64,${lqipBuffer.toString('base64')}`;

  // BlurHash — a real, decodable perceptual placeholder encoded from
  // orientation-corrected pixels at thumbnail resolution. The previous
  // implementation stored a truncated SHA-256 hex string in this field,
  // which no BlurHash decoder can render; the contract now carries a
  // genuine BlurHash (or null when encoding is impossible).
  const blurhash = await encodeBlurHashFromBuffer(inputBuffer);

  logger.info(
    {
      sourceWidth,
      sourceHeight,
      derivativeCount: derivatives.length,
      lqipLength: lqip.length,
    },
    '[sharpPipeline] image derivatives generated',
  );

  return { derivatives, lqip, blurhash };
}

/**
 * Strips EXIF metadata (GPS, device serial, timestamps) from the original
 * source object to protect uploader privacy. The public URL serves this
 * cleaned object.
 *
 * sharp discards all input metadata (EXIF, IPTC, XMP) by default when
 * producing a new output buffer, so re-encoding through sharp yields a
 * privacy-clean image. Two behaviours are layered on top of the re-encode:
 *
 *   - `.rotate()` bakes the EXIF orientation into the pixels before the
 *     Orientation tag is discarded. Without it, phone-shot photos whose
 *     camera stored rotation in EXIF (portrait shots in particular) serve
 *     sideways pixels on the public URL.
 *   - `.keepIccProfile()` carries the embedded ICC colour profile into the
 *     output. ICC is colour management, not personal data, so preserving it
 *     does not weaken the EXIF strip — and condition-evidence imagery keeps
 *     its authored colour.
 *
 * The output format matches the input content type so the object key
 * extension and S3 Content-Type remain valid. Returns the original buffer
 * reference unchanged when the format cannot be re-encoded without changing
 * type (e.g. HEIC when libheif output is unavailable).
 */
export async function stripImageExif(
  sourceBuffer: Buffer,
  contentType: string,
): Promise<Buffer> {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  const image = sharp(sourceBuffer, { failOn: 'none' })
    .rotate()
    .keepIccProfile();

  if (normalized === 'image/png') {
    return image.png().toBuffer();
  }
  if (normalized === 'image/webp') {
    return image.webp({ quality: 95 }).toBuffer();
  }
  if (normalized === 'image/heic' || normalized === 'image/heif') {
    try {
      return await image.heif({ quality: 95 }).toBuffer();
    } catch {
      // libheif output may be unavailable in this sharp build — cannot
      // re-encode without changing the format, so return the original
      // buffer unchanged.
      return sourceBuffer;
    }
  }
  // Default: JPEG re-encode (covers image/jpeg and image/jpg).
  return image.jpeg({ quality: 95 }).toBuffer();
}

// ── BlurHash encoding ────────────────────────────────────────────────────
//
// Compact, decodable perceptual placeholder (https://blurha.sh). The encoder
// below follows the reference algorithm: pixel data is decomposed into
// cosine-basis components (4×3 by default), the DC component is stored as
// sRGB, AC components are quantised against a shared maximum, and the result
// is serialised to a short Base83 string consumable directly by
// `expo-image`'s `placeholder={{ blurhash }}` prop.

const BASE83_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

function encodeBase83(value: number, length: number): string {
  let result = '';
  for (let i = 1; i <= length; i += 1) {
    const digit = Math.floor(value / 83 ** (length - i)) % 83;
    result += BASE83_ALPHABET[digit];
  }
  return result;
}

function sRGBToLinear(value: number): number {
  const v = value / 255;
  if (v <= 0.04045) return v / 12.92;
  return ((v + 0.055) / 1.055) ** 2.4;
}

function linearTosRGB(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  if (v <= 0.0031308) return Math.round(v * 12.92 * 255 + 0.5);
  return Math.round((1.055 * v ** (1 / 2.4) - 0.055) * 255 + 0.5);
}

function signPow(value: number, exponent: number): number {
  return Math.sign(value) * Math.abs(value) ** exponent;
}

function encodeBlurHashDC(r: number, g: number, b: number): number {
  return (linearTosRGB(r) << 16) + (linearTosRGB(g) << 8) + linearTosRGB(b);
}

function encodeBlurHashAC(
  r: number,
  g: number,
  b: number,
  maximumValue: number,
): number {
  const quantise = (channel: number): number =>
    Math.max(
      0,
      Math.min(18, Math.floor(signPow(channel / maximumValue, 0.5) * 9 + 9.5)),
    );
  return quantise(r) * 19 * 19 + quantise(g) * 19 + quantise(b);
}

/**
 * Encodes an RGBA pixel buffer as a BlurHash string. `pixels` must contain
 * 4 bytes per pixel in RGBA order; alpha is ignored per the spec.
 */
export function encodeBlurHash(
  pixels: Uint8Array,
  width: number,
  height: number,
  componentX = 4,
  componentY = 3,
): string {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) {
    throw new Error('encodeBlurHash received an undersized pixel buffer');
  }

  const factors: Array<[number, number, number]> = [];
  for (let y = 0; y < componentY; y += 1) {
    for (let x = 0; x < componentX; x += 1) {
      const normalisation = x === 0 && y === 0 ? 1 : 2;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < height; j += 1) {
        const rowOffset = j * width * 4;
        const cosY = Math.cos((Math.PI * y * j) / height);
        for (let i = 0; i < width; i += 1) {
          const basis = Math.cos((Math.PI * x * i) / width) * cosY;
          const offset = rowOffset + i * 4;
          r += basis * sRGBToLinear(pixels[offset]);
          g += basis * sRGBToLinear(pixels[offset + 1]);
          b += basis * sRGBToLinear(pixels[offset + 2]);
        }
      }
      const scale = normalisation / (width * height);
      factors.push([r * scale, g * scale, b * scale]);
    }
  }

  const dc = factors[0];
  const ac = factors.slice(1);

  const sizeFlag = componentX - 1 + (componentY - 1) * 9;
  let hash = encodeBase83(sizeFlag, 1);

  let maximumValue = 1;
  if (ac.length > 0) {
    const actualMaximumValue = ac.reduce(
      (max, [r, g, b]) => Math.max(max, Math.abs(r), Math.abs(g), Math.abs(b)),
      0,
    );
    const quantisedMaximumValue = Math.max(
      0,
      Math.min(82, Math.floor(actualMaximumValue * 166 - 0.5)),
    );
    maximumValue = (quantisedMaximumValue + 1) / 166;
    hash += encodeBase83(quantisedMaximumValue, 1);
  } else {
    hash += encodeBase83(0, 1);
  }

  hash += encodeBase83(encodeBlurHashDC(dc[0], dc[1], dc[2]), 4);
  for (const [r, g, b] of ac) {
    hash += encodeBase83(encodeBlurHashAC(r, g, b, maximumValue), 2);
  }
  return hash;
}

const BLURHASH_SAMPLE_WIDTH = 32;

/**
 * Produces a decodable BlurHash for the supplied source image. Returns null
 * (rather than throwing) when the pixels cannot be decoded — the field is a
 * progressive-enhancement placeholder, never a hard dependency.
 */
async function encodeBlurHashFromBuffer(inputBuffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(inputBuffer, { failOn: 'none' })
      .rotate()
      .resize({ width: BLURHASH_SAMPLE_WIDTH, withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return encodeBlurHash(new Uint8Array(data), info.width, info.height);
  } catch (error) {
    logger.warn(
      { err: error },
      '[sharpPipeline] blurhash encode failed — continuing without placeholder',
    );
    return null;
  }
}
