import * as ImagePicker from 'expo-image-picker';

export interface MediaUploadAsset {
  id: string;
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  kind: 'image' | 'video';
}

export interface MediaValidationError {
  field: 'mimeType' | 'kind' | 'duplicate' | 'count' | 'size' | 'dimensions' | 'duration' | 'uri' | 'general';
  message: string;
  assetId?: string;
}

export interface MediaValidationResult {
  valid: boolean;
  errors: MediaValidationError[];
  assets: MediaUploadAsset[];
}

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const SUPPORTED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/mov',
  'video/x-m4v',
]);

const SUPPORTED_TYPES = new Set([...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_VIDEO_TYPES]);

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  qt: 'video/quicktime',
};

/* ── collision-resistant filename ── */
function generateFileName(originalName: string): string {
  const clean = originalName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 64);
  const base = clean.replace(/\.[^.]+$/, '') || 'media';
  const ext = clean.split('.').pop() || 'jpg';
  const validExt = EXT_TO_MIME[ext.toLowerCase()] ? ext.toLowerCase() : 'jpg';
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1_000_000).toString(36);
  return `${base}_${timestamp}_${random}.${validExt}`;
}

/* ── MIME resolution ── */
function resolveMimeType(asset: ImagePicker.ImagePickerAsset): string {
  // 1. Trust asset.mimeType if present and supported
  if (asset.mimeType && SUPPORTED_TYPES.has(asset.mimeType)) {
    return asset.mimeType;
  }
  // 2. Infer from fileName
  if (asset.fileName) {
    const ext = asset.fileName.split('.').pop()?.toLowerCase();
    if (ext && EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];
  }
  // 3. Infer from URI
  const uriExt = asset.uri.split('.').pop()?.toLowerCase();
  if (uriExt && EXT_TO_MIME[uriExt]) return EXT_TO_MIME[uriExt];
  // 4. Controlled fallback
  return 'image/jpeg';
}

function resolveKind(mimeType: string): 'image' | 'video' {
  return SUPPORTED_VIDEO_TYPES.has(mimeType) ? 'video' : 'image';
}

/* ── conversion ── */
export function convertPickerAsset(asset: ImagePicker.ImagePickerAsset): MediaUploadAsset {
  const mimeType = resolveMimeType(asset);
  const fileName = asset.fileName
    ? generateFileName(asset.fileName)
    : generateFileName('picked_media.jpg');
  return {
    id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    uri: asset.uri,
    fileName,
    mimeType,
    fileSize: asset.fileSize ?? undefined,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    durationMs: 'duration' in asset && typeof (asset as any).duration === 'number'
      ? Math.round((asset as any).duration)
      : undefined,
    kind: resolveKind(mimeType),
  };
}

/* ── validation ── */
export interface MediaValidationOptions {
  maxTotalCount?: number;
  maxImageSizeBytes?: number;
  maxVideoSizeBytes?: number;
  maxVideoDurationMs?: number;
  minImageWidth?: number;
  minImageHeight?: number;
}

const DEFAULT_OPTIONS: Required<MediaValidationOptions> = {
  maxTotalCount: 10,
  maxImageSizeBytes: 20 * 1024 * 1024, // 20 MB
  maxVideoSizeBytes: 100 * 1024 * 1024, // 100 MB
  maxVideoDurationMs: 60 * 1000, // 60 seconds
  minImageWidth: 200,
  minImageHeight: 200,
};

export function validateMediaAssets(
  assets: MediaUploadAsset[],
  existingAssets: MediaUploadAsset[] = [],
  options: MediaValidationOptions = {}
): MediaValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: MediaValidationError[] = [];
  const seenUris = new Set<string>(existingAssets.map((a) => a.uri));
  const validAssets: MediaUploadAsset[] = [];

  for (const asset of assets) {
    // URI unusable
    if (!asset.uri || asset.uri.trim().length === 0) {
      errors.push({ field: 'uri', message: 'Asset has no usable URI', assetId: asset.id });
      continue;
    }

    // Duplicate
    if (seenUris.has(asset.uri)) {
      errors.push({ field: 'duplicate', message: `Duplicate asset: ${asset.fileName}`, assetId: asset.id });
      continue;
    }
    seenUris.add(asset.uri);

    // MIME type
    if (!SUPPORTED_TYPES.has(asset.mimeType)) {
      errors.push({ field: 'mimeType', message: `Unsupported format: ${asset.mimeType}`, assetId: asset.id });
      continue;
    }

    // Total count
    const totalCount = existingAssets.length + validAssets.length;
    if (totalCount >= opts.maxTotalCount) {
      errors.push({ field: 'count', message: `Maximum ${opts.maxTotalCount} assets allowed. Skipped: ${asset.fileName}`, assetId: asset.id });
      continue;
    }

    // File size
    if (asset.fileSize !== undefined && asset.fileSize !== null) {
      if (asset.kind === 'image' && asset.fileSize > opts.maxImageSizeBytes) {
        errors.push({ field: 'size', message: `Image too large: ${asset.fileName}`, assetId: asset.id });
        continue;
      }
      if (asset.kind === 'video' && asset.fileSize > opts.maxVideoSizeBytes) {
        errors.push({ field: 'size', message: `Video too large: ${asset.fileName}`, assetId: asset.id });
        continue;
      }
    }

    // Image dimensions
    if (asset.kind === 'image' && asset.width !== undefined && asset.height !== undefined) {
      if (asset.width < opts.minImageWidth || asset.height < opts.minImageHeight) {
        errors.push({ field: 'dimensions', message: `Image too small: ${asset.fileName}`, assetId: asset.id });
        continue;
      }
    }

    // Video duration
    if (asset.kind === 'video' && asset.durationMs !== undefined && asset.durationMs > opts.maxVideoDurationMs) {
      errors.push({ field: 'duration', message: `Video too long: ${asset.fileName}`, assetId: asset.id });
      continue;
    }

    validAssets.push(asset);
  }

  return { valid: errors.length === 0, errors, assets: validAssets };
}

export function isImageAsset(asset: MediaUploadAsset): boolean {
  return asset.kind === 'image';
}

export function isVideoAsset(asset: MediaUploadAsset): boolean {
  return asset.kind === 'video';
}
