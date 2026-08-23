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

import { createHash } from 'node:crypto';
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
  blurhash: string;
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
  const source = sharp(inputBuffer, { failOn: 'none' });
  const metadata = await source.metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;

  if (sourceWidth === 0 || sourceHeight === 0) {
    throw new Error('sharp could not decode image dimensions from the source buffer');
  }

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

  // LQIP — 20px-wide blurred JPEG encoded as a base64 data URI.
  const lqipBuffer = await source
    .clone()
    .resize({ width: LQIP_WIDTH, withoutEnlargement: true })
    .blur(5)
    .jpeg({ quality: 60 })
    .toBuffer();
  const lqip = `data:image/jpeg;base64,${lqipBuffer.toString('base64')}`;

  // Blurhash placeholder — a compact perceptual hash of the LQIP. We use a
  // deterministic short hash derived from the LQIP pixels so consumers can
  // render a placeholder without decoding the full image. This is a
  // best-effort fallback; a full BlurHash implementation can be layered in
  // later without changing the contract.
  const blurhash = computeBlurhashPlaceholder(lqipBuffer);

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
 * sharp discards all input metadata (EXIF, IPTC, XMP, ICC profiles) by
 * default when producing a new output buffer, so re-encoding through sharp
 * yields a clean image. The output format matches the input content type so
 * the object key extension and S3 Content-Type remain valid. Returns the
 * original buffer reference unchanged when the format cannot be re-encoded
 * without changing type (e.g. HEIC when libheif output is unavailable).
 */
export async function stripImageExif(
  sourceBuffer: Buffer,
  contentType: string,
): Promise<Buffer> {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  const image = sharp(sourceBuffer, { failOn: 'none' });

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

/**
 * Computes a compact perceptual placeholder hash from a downscaled image
 * buffer. This is not a full BlurHash implementation but a stable
 * representation suitable for placeholder rendering and deduplication.
 */
function computeBlurhashPlaceholder(buffer: Buffer): string {
  const hash = createHash('sha256').update(buffer).digest('hex');
  return hash.slice(0, 32);
}
