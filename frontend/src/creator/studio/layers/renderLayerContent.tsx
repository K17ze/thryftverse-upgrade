// ── Per-type layer content dispatch ────────────────────────────────
// Pure render-branch dispatch: maps a CreatorLayer to its per-type
// content component. Extracted from CreatorCanvas.tsx unchanged — the
// Look-document gating and the per-type radius grammar are preserved
// verbatim.
import React from 'react';
import { Radius } from '../../../theme/designTokens';
import type { CreatorLayer, CreatorDocument } from '../../core/projectStore/composition';
import type { PlaybackClock } from '../../core/playback/PlaybackClock';
import type { ProjectedClip } from '../../core/playback';
import type { ResolvedLayer } from '../../engine/evaluateScene';
import type { VideoPlayerRef } from './layerContentShared';
import { MediaLayerContent } from './MediaLayerContent';
import { TextLayerContent } from './TextLayerContent';
import { ProductLayerContent } from './ProductLayerContent';
import { DrawLayerContent } from './DrawLayerContent';
import { DecorativeLayerContent } from './DecorativeLayerContent';
import { MentionLayerContent } from './MentionLayerContent';
import { LookLayerContent } from './LookLayerContent';
import { VoteLayerContent } from './VoteLayerContent';
import { QuizLayerContent } from './QuizLayerContent';
import { QuestionLayerContent } from './QuestionLayerContent';
import { EmojiSliderLayerContent } from './EmojiSliderLayerContent';
import { CountdownLayerContent } from './CountdownLayerContent';
import { GifLayerContent } from './GifLayerContent';
import { MusicLayerContent } from './MusicLayerContent';
import { LinkLayerContent } from './LinkLayerContent';
import { LocationLayerContent } from './LocationLayerContent';
import { HashtagLayerContent } from './HashtagLayerContent';
import { TimeLayerContent } from './TimeLayerContent';
import { WeatherLayerContent } from './WeatherLayerContent';

// ── Per-type layer corner radius ───────────────────────────────────
// Two non-avatar radii per viewport:
//   Radius.sm (4px) — sharp media edges (media, draw, decorative, gif)
//   Radius.md (8px) — compact utility content (product, mention, look,
//     vote, quiz, question, countdown, music, link, location, hashtag,
//     time, weather, emojiSlider)
//   0 — text has no container
export function getLayerRadius(layer: CreatorLayer): number {
  switch (layer.type) {
    case 'media':
    case 'draw':
    case 'decorative':
    case 'gif':
      return Radius.sm;
    case 'product':
    case 'mention':
    case 'look':
    case 'vote':
    case 'quiz':
    case 'question':
    case 'emojiSlider':
    case 'countdown':
    case 'music':
    case 'link':
    case 'location':
    case 'hashtag':
    case 'time':
    case 'weather':
      return Radius.md;
    case 'text':
      return 0;
    default:
      return 0;
  }
}

export function renderLayerContent(
  layer: CreatorLayer,
  width: number,
  height: number,
  playbackClock?: PlaybackClock | null,
  currentTimeMs?: number,
  activeClip?: ProjectedClip | null,
  videoPlayerRef?: React.MutableRefObject<VideoPlayerRef | null>,
  siblingLayers?: CreatorLayer[],
  compareOriginal?: boolean,
  resolvedLayer?: ResolvedLayer,
  documentType?: CreatorDocument['type'],
): React.ReactNode {
  // Look documents support a reduced layer set: media, text, product,
  // draw, and decorative only. Every other layer type is gated out so
  // the Look composer never renders interactive stickers that don't
  // belong on a fashion Look surface.
  const isLook = documentType === 'look';
  switch (layer.type) {
    case 'media':
      return <MediaLayerContent layer={layer} width={width} height={height} playbackClock={playbackClock} currentTimeMs={currentTimeMs} activeClip={activeClip} videoPlayerRef={videoPlayerRef} siblingLayers={siblingLayers} compareOriginal={compareOriginal} resolvedLayer={resolvedLayer} />;
    case 'text':
      return <TextLayerContent layer={layer} />;
    case 'product':
      return <ProductLayerContent layer={layer} />;
    case 'draw':
      return <DrawLayerContent layer={layer} width={width} height={height} />;
    case 'decorative':
      return <DecorativeLayerContent layer={layer} width={width} height={height} />;
    // ── Layer types available only on poster documents (not Look) ──
    case 'mention':
      return isLook ? null : <MentionLayerContent layer={layer} />;
    case 'look':
      return isLook ? null : <LookLayerContent layer={layer} />;
    case 'vote':
      return isLook ? null : <VoteLayerContent layer={layer} />;
    case 'quiz':
      return isLook ? null : <QuizLayerContent layer={layer} />;
    case 'question':
      return isLook ? null : <QuestionLayerContent layer={layer} />;
    case 'emojiSlider':
      return isLook ? null : <EmojiSliderLayerContent layer={layer} />;
    case 'countdown':
      return isLook ? null : <CountdownLayerContent layer={layer} />;
    case 'gif':
      return isLook ? null : <GifLayerContent layer={layer} />;
    case 'music':
      return isLook ? null : <MusicLayerContent layer={layer} />;
    case 'link':
      return isLook ? null : <LinkLayerContent layer={layer} />;
    case 'location':
      return isLook ? null : <LocationLayerContent layer={layer} />;
    case 'hashtag':
      return isLook ? null : <HashtagLayerContent layer={layer} />;
    case 'time':
      return isLook ? null : <TimeLayerContent layer={layer} />;
    case 'weather':
      return isLook ? null : <WeatherLayerContent layer={layer} />;
    default:
      return null;
  }
}
