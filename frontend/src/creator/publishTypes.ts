import type { PosterStickerType } from '../services/postersApi';

export interface CreatorStoryCreateFrame {
  id: string;
  mediaType: 'image' | 'video' | 'text';
  mediaUrl?: string;
  caption?: string;
  durationMs?: number;
  sortOrder?: number;
  stickers: Array<{
    id: string;
    type: PosterStickerType;
    x: number;
    y: number;
    scale?: number;
    rotation?: number;
    payload: Record<string, unknown>;
    sortOrder?: number;
  }>;
}
