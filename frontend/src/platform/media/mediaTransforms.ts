import {
  manipulateAsync,
  SaveFormat,
  FlipType,
  type Action,
  type ImageResult,
} from 'expo-image-manipulator';

export type MediaTransformFormat = 'jpeg' | 'png' | 'webp';

export interface MediaTransformResult {
  uri: string;
  width: number;
  height: number;
  format: MediaTransformFormat;
  mimeType: `image/${MediaTransformFormat}`;
  fileExtension: 'jpg' | 'png' | 'webp';
}

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: SaveFormat;
}

const FORMAT_MAP: Record<SaveFormat, { format: MediaTransformFormat; mimeType: `image/${MediaTransformFormat}`; fileExtension: 'jpg' | 'png' | 'webp' }> = {
  [SaveFormat.JPEG]: { format: 'jpeg', mimeType: 'image/jpeg', fileExtension: 'jpg' },
  [SaveFormat.PNG]: { format: 'png', mimeType: 'image/png', fileExtension: 'png' },
  [SaveFormat.WEBP]: { format: 'webp', mimeType: 'image/webp', fileExtension: 'webp' },
};

function toResult(result: ImageResult, format: SaveFormat): MediaTransformResult {
  const meta = FORMAT_MAP[format] ?? FORMAT_MAP[SaveFormat.JPEG];
  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    format: meta.format,
    mimeType: meta.mimeType,
    fileExtension: meta.fileExtension,
  };
}

function validateUri(uri: string): void {
  if (!uri || typeof uri !== 'string') {
    throw new Error('Invalid image URI: URI must be a non-empty string');
  }
  if (!uri.startsWith('file://') && !uri.startsWith('http://') && !uri.startsWith('https://') && !uri.startsWith('content://')) {
    throw new Error(`Invalid image URI: unsupported scheme in "${uri}"`);
  }
}

export async function compressImage(
  uri: string,
  opts: CompressOptions = {},
): Promise<MediaTransformResult> {
  validateUri(uri);
  const actions: Action[] = [];
  if (opts.maxWidth || opts.maxHeight) {
    actions.push({
      resize: {
        width: opts.maxWidth,
        height: opts.maxHeight,
      },
    });
  }
  const format = opts.format ?? SaveFormat.JPEG;
  const result = await manipulateAsync(uri, actions, {
    compress: opts.quality ?? 0.8,
    format,
  });
  return toResult(result, format);
}

export async function resizeImage(
  uri: string,
  width: number,
  height?: number,
): Promise<MediaTransformResult> {
  validateUri(uri);
  if (width <= 0) throw new Error('resizeImage: width must be positive');
  const format = SaveFormat.JPEG;
  const result = await manipulateAsync(
    uri,
    [{ resize: { width, height } }],
    { compress: 1, format },
  );
  return toResult(result, format);
}

export async function cropImage(
  uri: string,
  originX: number,
  originY: number,
  width: number,
  height: number,
): Promise<MediaTransformResult> {
  validateUri(uri);
  if (width <= 0 || height <= 0) throw new Error('cropImage: width and height must be positive');
  if (originX < 0 || originY < 0) throw new Error('cropImage: originX and originY must be non-negative');
  const format = SaveFormat.JPEG;
  const result = await manipulateAsync(
    uri,
    [{ crop: { originX, originY, width, height } }],
    { compress: 1, format },
  );
  return toResult(result, format);
}

export async function rotateImage(
  uri: string,
  degrees: 90 | 180 | 270,
): Promise<MediaTransformResult> {
  validateUri(uri);
  const format = SaveFormat.JPEG;
  const result = await manipulateAsync(
    uri,
    [{ rotate: degrees }],
    { compress: 1, format },
  );
  return toResult(result, format);
}

export async function flipImage(
  uri: string,
  direction: 'horizontal' | 'vertical',
): Promise<MediaTransformResult> {
  validateUri(uri);
  const format = SaveFormat.JPEG;
  const result = await manipulateAsync(
    uri,
    [{ flip: direction === 'horizontal' ? FlipType.Horizontal : FlipType.Vertical }],
    { compress: 1, format },
  );
  return toResult(result, format);
}

export interface ResizePreset {
  maxWidth: number;
  maxHeight: number;
  format: SaveFormat;
  compress: number;
  aspect?: string;
}

const RESIZE_PRESETS: Record<string, ResizePreset> = {
  avatar: { maxWidth: 400, maxHeight: 400, format: SaveFormat.JPEG, compress: 0.85, aspect: '1:1' },
  cover: { maxWidth: 1500, maxHeight: 500, format: SaveFormat.JPEG, compress: 0.82, aspect: '3:1' },
  listing: { maxWidth: 1200, maxHeight: 1600, format: SaveFormat.JPEG, compress: 0.8 },
  look: { maxWidth: 1080, maxHeight: 1350, format: SaveFormat.JPEG, compress: 0.8, aspect: '4:5' },
  poster: { maxWidth: 1080, maxHeight: 1920, format: SaveFormat.JPEG, compress: 0.78, aspect: '9:16' },
  thumbnail: { maxWidth: 300, maxHeight: 300, format: SaveFormat.JPEG, compress: 0.7, aspect: '1:1' },
};

export type ResizePresetName = keyof typeof RESIZE_PRESETS;

export async function resizeForUpload(
  uri: string,
  preset: ResizePresetName,
  opts?: { allowUpscale?: boolean },
): Promise<MediaTransformResult> {
  validateUri(uri);
  const config = RESIZE_PRESETS[preset];
  if (!config) throw new Error(`resizeForUpload: unknown preset "${preset}"`);

  const actions: Action[] = [];
  if (!opts?.allowUpscale) {
    actions.push({ resize: { width: config.maxWidth, height: config.maxHeight } });
  } else {
    actions.push({ resize: { width: config.maxWidth, height: config.maxHeight } });
  }

  const result = await manipulateAsync(uri, actions, {
    compress: config.compress,
    format: config.format,
  });
  return toResult(result, config.format);
}

export async function normalizeImage(
  uri: string,
  opts?: { format?: SaveFormat; quality?: number },
): Promise<MediaTransformResult> {
  validateUri(uri);
  const format = opts?.format ?? SaveFormat.JPEG;
  const quality = opts?.quality ?? 0.85;

  const result = await manipulateAsync(uri, [], {
    compress: quality,
    format,
  });
  return toResult(result, format);
}

export interface CropAspectRatioOptions {
  focalX?: number;
  focalY?: number;
}

export async function cropToAspectRatio(
  uri: string,
  ratio: '1:1' | '4:5' | '9:16' | 'original',
  sourceWidth: number,
  sourceHeight: number,
  opts?: CropAspectRatioOptions,
): Promise<MediaTransformResult> {
  validateUri(uri);
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('cropToAspectRatio: source dimensions must be positive');
  }

  if (ratio === 'original') {
    return normalizeImage(uri);
  }

  const ratios: Record<string, number> = {
    '1:1': 1,
    '4:5': 4 / 5,
    '9:16': 9 / 16,
  };

  const targetRatio = ratios[ratio];
  if (!targetRatio) throw new Error(`cropToAspectRatio: unsupported ratio "${ratio}"`);

  const sourceRatio = sourceWidth / sourceHeight;
  let cropWidth: number;
  let cropHeight: number;

  if (sourceRatio > targetRatio) {
    cropHeight = sourceHeight;
    cropWidth = Math.round(sourceHeight * targetRatio);
  } else {
    cropWidth = sourceWidth;
    cropHeight = Math.round(sourceWidth / targetRatio);
  }

  cropWidth = Math.min(cropWidth, sourceWidth);
  cropHeight = Math.min(cropHeight, sourceHeight);

  let originX: number;
  let originY: number;

  if (opts?.focalX !== undefined && opts?.focalY !== undefined) {
    originX = Math.round(Math.min(Math.max(opts.focalX - cropWidth / 2, 0), sourceWidth - cropWidth));
    originY = Math.round(Math.min(Math.max(opts.focalY - cropHeight / 2, 0), sourceHeight - cropHeight));
  } else {
    originX = Math.round((sourceWidth - cropWidth) / 2);
    originY = Math.round((sourceHeight - cropHeight) / 2);
  }

  const format = SaveFormat.JPEG;
  const result = await manipulateAsync(
    uri,
    [{ crop: { originX, originY, width: cropWidth, height: cropHeight } }],
    { compress: 0.85, format },
  );
  return toResult(result, format);
}

export async function createThumbnail(
  uri: string,
  maxDimension?: number,
): Promise<MediaTransformResult> {
  validateUri(uri);
  const max = maxDimension ?? 300;
  if (max <= 0) throw new Error('createThumbnail: maxDimension must be positive');

  const format = SaveFormat.JPEG;
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: max } }],
    { compress: 0.7, format },
  );
  return toResult(result, format);
}

export interface ExportImageOptions {
  format?: SaveFormat;
  quality?: number;
  resizeWidth?: number;
  resizeHeight?: number;
}

export async function exportImage(
  uri: string,
  opts: ExportImageOptions = {},
): Promise<MediaTransformResult> {
  validateUri(uri);
  const format = opts.format ?? SaveFormat.JPEG;
  const quality = opts.quality ?? 0.85;

  const actions: Action[] = [];
  if (opts.resizeWidth || opts.resizeHeight) {
    actions.push({
      resize: {
        width: opts.resizeWidth,
        height: opts.resizeHeight,
      },
    });
  }

  const result = await manipulateAsync(uri, actions, {
    compress: quality,
    format,
  });
  return toResult(result, format);
}

export const mediaTransforms = {
  compress: compressImage,
  resize: resizeImage,
  crop: cropImage,
  rotate: rotateImage,
  flip: flipImage,
  normalize: normalizeImage,
  resizeForUpload,
  cropToAspectRatio,
  createThumbnail,
  exportImage,
};

export type { ImageResult };
