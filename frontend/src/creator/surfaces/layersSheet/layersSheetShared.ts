/**
 * layersSheetShared — constants, types and pure helpers for
 * CreatorLayersSheet.
 *
 * Extracted verbatim from CreatorLayersSheet.tsx; consumed by the sheet
 * orchestrator and the extracted components under layersSheet/.
 */
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Space } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';

export const LAYER_ICONS: Record<CreatorLayer['type'], React.ComponentProps<typeof Ionicons>['name']> = {
  media: 'images-outline',
  text: 'text-outline',
  product: 'bag-handle-outline',
  mention: 'at-outline',
  look: 'shirt-outline',
  vote: 'stats-chart-outline',
  adjustment: 'options-outline',
  quiz: 'help-circle-outline',
  question: 'chatbubble-outline',
  emojiSlider: 'happy-outline',
  countdown: 'time-outline',
  decorative: 'happy-outline',
  draw: 'brush-outline',
  gif: 'image-outline',
  music: 'musical-notes-outline',
  link: 'link-outline',
  location: 'location-outline',
  hashtag: 'bag-handle-outline',
  time: 'time-outline',
  weather: 'partly-sunny-outline' };

export const THUMB = 48;
export const ROW_HEIGHT = 64;
export const ROW_GAP = Space.sm;

export type OverflowAction = 'front' | 'back' | 'duplicate' | 'delete';

export function getLayerDisplayName(layer: CreatorLayer): string {
  switch (layer.type) {
    case 'media':
      return layer.payload.mediaType === 'video' ? 'Video' : 'Photo';
    case 'text':
      return layer.payload.text.slice(0, 30) || 'Text';
    case 'product':
      return layer.payload.snapshotTitle || 'Listing';
    case 'mention':
      return `@${layer.payload.username}`;
    case 'look':
      return layer.payload.snapshotCaption?.slice(0, 30) || 'Look';
    case 'vote':
      return layer.payload.question.slice(0, 30) || 'Vote';
    case 'quiz':
      return layer.payload.question.slice(0, 30) || 'Quiz';
    case 'question':
      return layer.payload.prompt.slice(0, 30) || 'Question';
    case 'emojiSlider':
      return layer.payload.question.slice(0, 30) || 'Slider';
    case 'countdown':
      return layer.payload.label.slice(0, 30) || 'Countdown';
    case 'decorative':
      return layer.payload.shape;
    case 'draw':
      return `Drawing (${layer.payload.strokes.length})`;
    case 'gif':
      return layer.payload.altText || 'GIF';
    case 'music':
      return `${layer.payload.trackName}${layer.payload.artistName ? ' — ' + layer.payload.artistName : ''}`;
    case 'link':
      return layer.payload.ctaText || 'Link';
    case 'location':
      return layer.payload.placeName || 'Location';
    case 'hashtag':
      return `#${layer.payload.tag}`;
    case 'time':
      return 'Time';
    case 'weather':
      return `${layer.payload.emoji} ${layer.payload.condition}`;
    default:
      return 'Layer';
  }
}

export function getLayerThumbnailSource(layer: CreatorLayer): { uri: string } | null {
  switch (layer.type) {
    case 'media': {
      const uri = layer.payload.thumbnailUri || layer.payload.mediaUri;
      return uri ? { uri } : null;
    }
    case 'product': {
      const uri = layer.payload.snapshotImageUrl;
      return uri ? { uri } : null;
    }
    case 'look': {
      const uri = layer.payload.snapshotImageUrl;
      return uri ? { uri } : null;
    }
    default:
      return null;
  }
}

export function getLayerColor(type: CreatorLayer['type'], colors: ThemeColors): string {
  switch (type) {
    case 'media': return colors.commerceTrust;
    case 'text': return colors.brand;
    case 'product': return colors.bronze;
    case 'mention': return colors.social;
    case 'look': return colors.discovery;
    case 'vote': return colors.success;
    case 'quiz': return colors.brand;
    case 'question': return colors.social;
    case 'emojiSlider': return colors.brand;
    case 'countdown': return colors.bronze;
    case 'decorative': return colors.coownUp;
    case 'draw': return colors.brand;
    case 'gif': return colors.social;
    case 'music': return colors.brand;
    case 'link': return colors.brand;
    case 'location': return colors.discovery;
    case 'hashtag': return colors.social;
    case 'time': return colors.bronze;
    case 'weather': return colors.discovery;
    default: return colors.textMuted;
  }
}
