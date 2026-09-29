/** Media utilities — mirrors utils/media.ts + listingMediaGeometry.ts. */

import type { Listing, ListingMediaRecord } from '@/lib/contracts/domain';

export const DEFAULT_LISTING_MEDIA_ASPECT_RATIO = 0.75; // 3:4 editorial

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m3u8', '.webm'];

export function isVideoUri(uri: string): boolean {
  const lower = uri.toLowerCase().split('?')[0];
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isUsableUri(uri: unknown): uri is string {
  return typeof uri === 'string' && uri.trim().length > 0;
}

/** blob:/data: URIs come from local file picks — next/image can't optimize
 * them (the optimizer only fetches http(s) sources), so they must render
 * through a plain <img>. */
export function isLocalMediaUri(uri: string): boolean {
  return uri.startsWith('blob:') || uri.startsWith('data:');
}

export function getListingCoverUri(images: string[] | undefined): string {
  return (images ?? []).filter(isUsableUri)[0] ?? '';
}

/** Resolve the primary media record for a listing's cover image. */
export function getPrimaryMedia(
  listing: Pick<Listing, 'images' | 'media'>,
): ListingMediaRecord | null {
  const cover = getListingCoverUri(listing.images);
  const records = listing.media ?? [];
  return (
    records.find((m) => m.kind === 'image' && (m.uri === cover || m.url === cover)) ??
    records.find((m) => m.kind === 'image') ??
    null
  );
}

/** Server-truth aspect ratio for a listing's primary media. */
export function resolveListingMediaAspectRatio(
  listing: Pick<Listing, 'mediaAspectRatio' | 'mediaWidth' | 'mediaHeight' | 'media'>,
): number | null {
  if (typeof listing.mediaAspectRatio === 'number' && listing.mediaAspectRatio > 0) {
    return listing.mediaAspectRatio;
  }
  if (
    typeof listing.mediaWidth === 'number' &&
    typeof listing.mediaHeight === 'number' &&
    listing.mediaHeight > 0
  ) {
    return listing.mediaWidth / listing.mediaHeight;
  }
  const primary = (listing.media ?? []).find((m) => m.kind === 'image');
  if (primary?.width && primary?.height && primary.height > 0) {
    return primary.width / primary.height;
  }
  return null;
}

/** CSS object-position from a focal point {x, y} in 0..1 space. */
export function focalPointToObjectPosition(
  focal: { x: number; y: number } | null | undefined,
): string | undefined {
  if (!focal) return undefined;
  const x = Math.min(1, Math.max(0, focal.x));
  const y = Math.min(1, Math.max(0, focal.y));
  return `${Math.round(x * 100)}% ${Math.round(y * 100)}%`;
}

/** Category focal points — art direction per category, mirrors getCategoryFocalPoint. */
const CATEGORY_FOCAL_POINTS: Record<string, { x: number; y: number }> = {
  sneakers: { x: 0.5, y: 0.6 },
  bags: { x: 0.5, y: 0.5 },
  accessories: { x: 0.5, y: 0.45 },
  women: { x: 0.5, y: 0.35 },
  men: { x: 0.5, y: 0.35 },
};

export function getCategoryFocalPoint(category: string | undefined) {
  return CATEGORY_FOCAL_POINTS[category ?? ''] ?? { x: 0.5, y: 0.5 };
}

export const FACE_FOCAL_POINT = { x: 0.5, y: 0.35 };

/* ---------------------------------------------------------------------------
 * Local media probing — the publish contract asks for pixel dims on every
 * attach, and video media needs a poster still the client renders (the
 * backend falls back to its pipeline poster, which lands after processing).
 * Both helpers are client-only: they touch DOM media elements, so call them
 * from event handlers/effects, never during SSR.
 * ------------------------------------------------------------------------ */

export interface MediaProbe {
  width: number;
  height: number;
}

/** Decode one image blob for its intrinsic dimensions. Falls back to an
 *  <img> decode when createImageBitmap is unavailable (older Safari). */
export function probeImageDimensions(blob: Blob): Promise<MediaProbe | null> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob)
      .then((bmp) => {
        const dims = { width: bmp.width, height: bmp.height };
        bmp.close?.();
        return dims.width > 0 && dims.height > 0 ? dims : null;
      })
      .catch(() => null);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : null,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Render a poster frame for a local video blob — the seek-then-paint
 * capture the mobile flow does natively. Returns the JPEG frame plus the
 * video's intrinsic dims so the attachment can carry mediaWidth/Height.
 * Resolves null (never throws) when the browser can't decode the clip —
 * the listing publish still proceeds and the backend's pipeline poster
 * backfills when it lands.
 */
export function captureVideoPoster(
  blob: Blob,
  seekSeconds = 0.4,
): Promise<{ blob: Blob } & MediaProbe | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    let settled = false;
    const done = (value: ({ blob: Blob } & MediaProbe) | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const paint = () => {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) {
        done(null);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        done(null);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (frame) =>
          done(
            frame
              ? { blob: frame, width: video.videoWidth, height: video.videoHeight }
              : null,
          ),
        'image/jpeg',
        0.85,
      );
    };
    video.onloadeddata = () => {
      // Seek past the first frame so dark/leader frames don't become the
      // poster; browsers that can't seek still paint whatever loaded.
      try {
        video.currentTime = Math.min(
          seekSeconds,
          Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : seekSeconds,
        );
        // No actual seek happened (clamped to the loaded position) — the
        // `seeked` event won't fire, so paint the current frame directly.
        if (!video.seeking) paint();
      } catch {
        paint();
      }
    };
    video.onseeked = paint;
    video.onerror = () => done(null);
    // Absolute safety valve — a hung decoder must not stall publish.
    setTimeout(() => done(null), 5000);
    video.src = url;
  });
}
