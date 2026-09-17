/**
 * Shared types, constants, and helpers for the MediaBrowser sheet.
 *
 * Extracted from MediaBrowserSheet (spec 08_MEDIA_TOOLCHAIN) — pure
 * extraction, no behavior change.
 */

/**
 * A media asset selected by the user. Returned via onConfirm in tap order.
 */
export interface SelectedAsset {
  uri: string;
  mediaType: 'image' | 'video';
  width?: number;
  height?: number;
  /** Video duration in milliseconds (normalized at the boundary). */
  durationMs?: number;
  filename?: string;
}

export interface MediaBrowserSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the selected assets in tap order when the user confirms. */
  onConfirm: (assets: SelectedAsset[]) => void;
  /** Maximum number of selectable assets. Default: unlimited. */
  maxSelections?: number;
  /** Sheet title. Default: "Select photos". */
  title?: string;
  /** Show the camera tile at the first grid position. Default: true. */
  showCameraTile?: boolean;
  /** Allow video selection. Default: true. */
  allowVideos?: boolean;
}

// ── Internal media asset (from MediaLibrary) ────────────────────────

export interface MediaAsset {
  id: string;
  uri: string;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
  /** Video duration in milliseconds (normalized at the boundary). */
  durationMs?: number;
  filename?: string;
}

// ── Tab model ───────────────────────────────────────────────────────
// "Albums" tab shows a list of device albums; selecting one scopes the
// grid to that album and switches back to the "Recents" tab showing
// only that album's contents.

export type MediaTab = 'recents' | 'albums' | 'photos' | 'videos';

export const MEDIA_TABS: { key: MediaTab; label: string }[] = [
  { key: 'recents', label: 'Recents' },
  { key: 'albums', label: 'Albums' },
  { key: 'photos', label: 'Photos' },
  { key: 'videos', label: 'Videos' },
];

/**
 * Per-tab measured layouts (x offset + width) used to position the
 * animated tab indicator. Populated lazily by each tab's onLayout, so
 * keys may be absent until the corresponding tab has rendered.
 */
export type TabLayoutMap = Partial<Record<MediaTab, { x: number; width: number }>>;

// ── Grid geometry ───────────────────────────────────────────────────

export const GRID_COLUMNS = 3;

// Max video duration accepted by the downstream editor/upload pipeline.
export const MAX_VIDEO_DURATION_MS = 60_000;

// ── FlashList row model ─────────────────────────────────────────────

/** A FlashList row: either a real media asset or the camera tile sentinel. */
export type GridItem = MediaAsset | 'camera';

// ── Duration formatting ─────────────────────────────────────────────

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  return `${seconds}s`;
}
