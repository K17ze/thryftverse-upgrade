import type { PosterStickerType } from '../services/postersApi';

export interface CreatorStoryCreateFrame {
  id: string;
  mediaType: 'image' | 'video' | 'text';
  mediaUrl?: string;
  mediaFinalizationId?: string;
  mediaAssetId?: string;
  thumbnailUrl?: string;
  thumbnailFinalizationId?: string;
  thumbnailMediaAssetId?: string;
  caption?: string;
  durationMs?: number;
  videoDurationMs?: number;
  sortOrder?: number;
  // Timeline operations (video)
  speed?: number;
  volume?: number;
  trimStartMs?: number;
  trimEndMs?: number;
  reversed?: boolean;
  freezeFrameMs?: number;
  freezeDurationMs?: number;
  // Green screen metadata
  greenScreen?: {
    backgroundUri: string;
    keyColor: string;
    tolerance: number;
    feather: number;
  };
  // Effect/filter applied to the media
  filterId?: string;
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
