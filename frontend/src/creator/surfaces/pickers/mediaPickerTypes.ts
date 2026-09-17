/**
 * mediaPickerTypes — shared types and constants for the MediaPicker
 * sheet and its extracted sub-components.
 *
 * Extracted from MediaPicker.tsx (pure move — no behavior change).
 */

import type { MutableRefObject } from 'react';

export interface MediaAsset {
  id: string;
  uri: string;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
  /**
   * Video duration in milliseconds, normalized at the boundary.
   * The legacy expo-media-library API returns duration in seconds, while
   * expo-image-picker returns it in milliseconds. Both are converted to
   * milliseconds here so all downstream comparisons and display formatting
   * use one consistent unit.
   */
  durationMs?: number;
}

// Camera roll category tabs
// Note: "Selfies" was previously inferred from square aspect ratio, which is
// not truthful (a square image is not necessarily a selfie). Renamed to
// "Square" so the filter label matches what it actually does. Querying
// actual smart albums (iOS Selfies album) requires platform-specific APIs
// not reliably available through expo-media-library.
export type MediaCategory = 'recent' | 'photos' | 'videos' | 'albums';
export const MEDIA_CATEGORIES: { key: MediaCategory; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'photos', label: 'Photos' },
  { key: 'videos', label: 'Videos' },
  { key: 'albums', label: 'Albums' },
];

/**
 * Reject videos exceeding the max supported duration (60s) before they
 * enter the selection. This prevents the user from building a selection
 * that will be rejected downstream by the editor or upload pipeline.
 */
export const MAX_VIDEO_DURATION_MS = 60_000;

/**
 * Per-tab layout measurements recorded from each tab's onLayout. Drives
 * the spring underline indicator (x + width) under the active tab.
 */
export type TabLayoutsRef = MutableRefObject<
  Partial<Record<MediaCategory, { x: number; width: number }>>
>;
