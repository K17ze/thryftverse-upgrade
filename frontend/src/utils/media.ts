const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|mkv|avi|3gp)(\?.*)?$/i;

export function isVideoUri(uri?: string | null): boolean {
  if (!uri) {
    return false;
  }

  const normalized = uri.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (VIDEO_EXT_RE.test(normalized)) {
    return true;
  }

  if (/^content:\/\//.test(normalized) && /\/video\//.test(normalized)) {
    return true;
  }

  if (/\/video\//.test(normalized)) {
    return true;
  }

  return false;
}

export function getFirstImageUri(uris: string[]): string | undefined {
  return uris.find((uri) => !isVideoUri(uri));
}

export function getListingCoverUri(uris: string[], fallback: string): string {
  return getFirstImageUri(uris) ?? uris[0] ?? fallback;
}

export function filterImageUris(uris: string[], limit?: number): string[] {
  const imageUris = uris.filter((uri) => !isVideoUri(uri));
  if (typeof limit === 'number') {
    return imageUris.slice(0, Math.max(0, limit));
  }

  return imageUris;
}

/**
 * Category-sensitive focal point mapping for art-directed crops.
 *
 * Used with CachedImage `contentFit="cover"` to preserve the most
 * important part of the image when the aspect ratio doesn't match
 * the crop frame. Values are 0-1 for both x and y.
 *
 * Source §15: "Do not rely on `cover` blindly. Use category-sensitive
 * focal positioning when supported safely."
 */
export function getCategoryFocalPoint(category?: string | null): { x: number; y: number } {
  if (!category) return { x: 0.5, y: 0.46 };
  const normalized = category.toLowerCase();
  if (normalized.includes('vehicle') || normalized.includes('car')) return { x: 0.5, y: 0.58 };
  if (normalized.includes('bag') || normalized.includes('shoe')) return { x: 0.5, y: 0.56 };
  if (normalized.includes('watch') || normalized.includes('jewel') || normalized.includes('art')) return { x: 0.5, y: 0.5 };
  if (normalized.includes('top') || normalized.includes('shirt') || normalized.includes('jacket') || normalized.includes('coat')) return { x: 0.5, y: 0.42 };
  if (normalized.includes('dress') || normalized.includes('skirt')) return { x: 0.5, y: 0.48 };
  if (normalized.includes('pant') || normalized.includes('trouser') || normalized.includes('jean')) return { x: 0.5, y: 0.5 };
  return { x: 0.5, y: 0.46 };
}

/**
 * Face-aware focal point for avatar/profile images.
 * Defaults to upper-center where faces typically appear.
 */
export const FACE_FOCAL_POINT: { x: number; y: number } = { x: 0.5, y: 0.35 };