/**
 * Correct MIME type detection for creator media uploads.
 *
 * The previous upload code hardcoded `image/*` for every asset, which is
 * wrong for video and audio. This module derives the correct MIME type
 * from the file extension first (most specific), then falls back to an
 * asset-type hint, and finally to a safe generic type — never `image/*`
 * for a video file.
 *
 * Usage:
 *   detectMimeType('photo.jpg')           → 'image/jpeg'
 *   detectMimeType('clip.mov')            → 'video/quicktime'
 *   detectMimeType('song.m4a')            → 'audio/m4a'
 *   detectMimeType('file://.../clip.MP4') → 'video/mp4'
 *   detectMimeType('noext', 'video')      → 'video/mp4'
 */

/** Extension → MIME map. Lowercased extensions only. */
const EXTENSION_MIME_MAP: Record<string, string> = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  // Video
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  '3gp': 'video/3gpp',
  mkv: 'video/x-matroska',
  // Audio
  m4a: 'audio/m4a',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};

/** Asset-type hint → default MIME. Used only when extension is unknown. */
const ASSET_TYPE_DEFAULTS: ReadonlyArray<{ hint: string; mime: string }> = [
  { hint: 'image', mime: 'image/jpeg' },
  { hint: 'video', mime: 'video/mp4' },
  { hint: 'audio', mime: 'audio/m4a' },
];

/**
 * Detect the correct MIME type for a file.
 *
 * @param fileName File name or URI (e.g. `photo.jpg`, `file:///path/clip.MP4`)
 * @param assetType Optional hint: `"image"`, `"video"`, `"audio"`, or a
 *                  layer type string containing one of those words.
 * @returns A concrete MIME type. Never `image/*` for video/audio.
 */
export function detectMimeType(fileName: string, assetType?: string): string {
  // 1. Check file extension — highest priority, most specific.
  const ext = extractExtension(fileName);
  if (ext) {
    const mapped = EXTENSION_MIME_MAP[ext];
    if (mapped) return mapped;
  }

  // 2. Check asset-type hint. This catches files without extensions
  //    (e.g. `ph://asset-id`) where the caller knows the media kind.
  if (assetType) {
    const normalized = assetType.toLowerCase();
    for (const { hint, mime } of ASSET_TYPE_DEFAULTS) {
      if (normalized.includes(hint)) return mime;
    }
  }

  // 3. Safe fallback — never default to image/* for unknown files.
  return 'application/octet-stream';
}

/**
 * Extract the lowercase file extension from a file name or URI.
 * Strips query parameters and fragments before extracting.
 * Returns `undefined` when no extension is found.
 */
function extractExtension(fileName: string): string | undefined {
  // Strip query params and fragments (e.g. `file.mp4?token=abc`)
  const cleanName = fileName.split('?')[0]?.split('#')[0] ?? fileName;
  const lastDot = cleanName.lastIndexOf('.');
  if (lastDot <= 0) return undefined; // no extension or dot-only name
  const lastSlash = Math.max(
    cleanName.lastIndexOf('/'),
    cleanName.lastIndexOf('\\'),
  );
  // Ensure the dot is part of the file name, not a directory path segment.
  if (lastDot < lastSlash) return undefined;
  const ext = cleanName.substring(lastDot + 1).toLowerCase();
  return ext.length > 0 ? ext : undefined;
}

/**
 * Derive a file name from a local URI path. Used when the caller does not
 * provide an explicit `fileName`.
 */
export function deriveFileName(localPath: string): string {
  const cleanPath = localPath.split('?')[0]?.split('#')[0] ?? localPath;
  const lastSlash = Math.max(
    cleanPath.lastIndexOf('/'),
    cleanPath.lastIndexOf('\\'),
  );
  const baseName = lastSlash >= 0 ? cleanPath.substring(lastSlash + 1) : cleanPath;
  return baseName || `media_${Date.now()}`;
}
