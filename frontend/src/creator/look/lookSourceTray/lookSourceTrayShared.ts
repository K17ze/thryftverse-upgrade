/**
 * lookSourceTrayShared — constants and types for LookSourceTray.
 *
 * Extracted verbatim from LookSourceTray.tsx; consumed by the tray
 * orchestrator and the extracted components under lookSourceTray/.
 */

export const PEEK_HEIGHT = 48;
export const CONTENT_HEIGHT = 240;
export const EXPANDED_HEIGHT = PEEK_HEIGHT + CONTENT_HEIGHT;
export const PREVIEW_SIZE = 80;

export type TabKey = 'foryou' | 'closet' | 'listings' | 'search';

export interface TrayItem {
  id: string;
  title: string;
  imageUrl: string | null;
  priceGbp?: number;
  brand?: string | null;
}
