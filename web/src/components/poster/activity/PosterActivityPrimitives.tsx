import type { PosterArchiveStory } from '@/lib/data/fixtures-posters';
import type { PosterStoryActivity } from '@/lib/data/fixtures-content';

export type ActivityTab = 'viewers' | 'reactions' | 'replies' | 'stickers';

export interface StyleSticker {
  id: string;
  label: string;
  options: { id: string; label: string }[];
}

export interface ActivityData {
  story: PosterArchiveStory | null;
  activity: PosterStoryActivity | null;
  stickers: StyleSticker[];
  forbidden: boolean;
}

export function hourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export const tick = (ms = 200) => new Promise((r) => setTimeout(r, ms));
