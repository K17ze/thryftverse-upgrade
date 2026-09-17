/**
 * CreatorGlyph — purpose-built SVG glyph system for creator-specific concepts.
 *
 * Editorial/creative tools (trim, split, crop, keyframe, speed-curve, waveform,
 * layers, etc.) get custom SVG paths with a consistent optical system:
 *   - 24×24 viewBox
 *   - 1.9 stroke width (within the 1.75–2.0 spec band)
 *   - round caps and joins
 *   - matched optical weight across all glyphs
 *   - selected/filled variants where meaningful
 *   - pixel-aligned at common DPR
 *
 * Universally understood actions (close, back, play, pause, search, delete,
 * share, camera-flip, chevron, plus, check, settings) are NOT duplicated here —
 * consumers should use Ionicons from @expo/vector-icons for those.
 *
 * Glyph renderers live under ./glyphs/, split by category:
 *   - editingGlyphs.tsx      — video / timeline editing
 *   - arrangementGlyphs.tsx  — layers, z-order, composition overlays
 *   - styleGlyphs.tsx        — color / style + adjust / enhance
 *   - textGlyphs.tsx         — text tools and alignment
 *   - toolGlyphs.tsx         — creative tools, audio, history
 *
 * Design references:
 *   - 05_ICONS_BUTTONS_CONTROL_CRAFT.md §1 (Purpose-built creator glyph layer)
 *   - AGENTS.md §4 (Icon grammar: one family, one optical band, stable rule)
 *   - AGENTS.md §13 (Control quality)
 */
import React from 'react';
import { Svg, G } from 'react-native-svg';
import type { GlyphRenderProps } from './glyphs/glyphShared';
import {
  TrimGlyph,
  SplitGlyph,
  CropGlyph,
  RotateGlyph,
  CutoutGlyph,
  KeyframeGlyph,
  SpeedCurveGlyph,
  WaveformGlyph,
  ReverseGlyph,
  FreezeFrameGlyph,
  FadeInGlyph,
  FadeOutGlyph,
} from './glyphs/editingGlyphs';
import {
  LayersGlyph,
  ArrangeGlyph,
  BringForwardGlyph,
  BringBackGlyph,
  SafeZoneGlyph,
  ProductTagGlyph,
  MultiSelectGlyph,
} from './glyphs/arrangementGlyphs';
import {
  GradientGlyph,
  EyedropperGlyph,
  OpacityGlyph,
  StrokeGlyph,
  ShadowGlyph,
  EnhanceGlyph,
  AdjustGlyph,
  FilterGlyph,
} from './glyphs/styleGlyphs';
import {
  TextGlyph,
  TextBackgroundGlyph,
  CaptionGlyph,
  AlignLeftGlyph,
  AlignCenterGlyph,
  AlignRightGlyph,
  BoldGlyph,
  ItalicGlyph,
  UnderlineGlyph,
} from './glyphs/textGlyphs';
import {
  DrawingGlyph,
  StickerGlyph,
  AudioGlyph,
  MusicGlyph,
  VoiceoverGlyph,
  UndoGlyph,
  RedoGlyph,
} from './glyphs/toolGlyphs';

// ── Types ────────────────────────────────────────────────────────────

/**
 * All creator-specific glyph names. Universally understood actions
 * (close, back, play, etc.) are intentionally excluded — use Ionicons.
 */
export type CreatorGlyphName =
  // Video / timeline editing
  | 'trim'
  | 'split'
  | 'crop'
  | 'rotate'
  | 'cutout'
  | 'keyframe'
  | 'speed-curve'
  | 'waveform'
  | 'reverse'
  | 'freeze-frame'
  | 'fade-in'
  | 'fade-out'
  // Layer / arrangement
  | 'layers'
  | 'arrange'
  | 'bring-forward'
  | 'bring-back'
  // Color / style
  | 'gradient'
  | 'eyedropper'
  | 'opacity'
  | 'stroke'
  | 'shadow'
  // Text
  | 'text'
  | 'text-background'
  | 'caption'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'bold'
  | 'italic'
  | 'underline'
  // Composition
  | 'safe-zone'
  | 'product-tag'
  | 'multi-select'
  // Adjust / enhance
  | 'enhance'
  | 'adjust'
  | 'filter'
  // Creative tools
  | 'drawing'
  | 'sticker'
  // Audio
  | 'audio'
  | 'music'
  | 'voiceover'
  // History
  | 'undo'
  | 'redo';

export interface CreatorGlyphProps {
  /** Which glyph to render. */
  name: CreatorGlyphName;
  /** Glyph size in points (default 24). */
  size?: number;
  /** Stroke / fill color. */
  color?: string;
  /** When true, renders the filled/selected variant where meaningful. */
  selected?: boolean;
  /** Optional accessibility label for screen readers. */
  accessibilityLabel?: string;
  /** Test ID for testing. */
  testID?: string;
}

// ── Constants ────────────────────────────────────────────────────────

const VIEWBOX = 24;

// ── Glyph registry ───────────────────────────────────────────────────

const GLYPH_REGISTRY: Record<CreatorGlyphName, (props: GlyphRenderProps) => React.ReactElement> = {
  trim: TrimGlyph,
  split: SplitGlyph,
  crop: CropGlyph,
  rotate: RotateGlyph,
  cutout: CutoutGlyph,
  keyframe: KeyframeGlyph,
  'speed-curve': SpeedCurveGlyph,
  waveform: WaveformGlyph,
  reverse: ReverseGlyph,
  'freeze-frame': FreezeFrameGlyph,
  'fade-in': FadeInGlyph,
  'fade-out': FadeOutGlyph,
  layers: LayersGlyph,
  arrange: ArrangeGlyph,
  'bring-forward': BringForwardGlyph,
  'bring-back': BringBackGlyph,
  gradient: GradientGlyph,
  eyedropper: EyedropperGlyph,
  opacity: OpacityGlyph,
  stroke: StrokeGlyph,
  shadow: ShadowGlyph,
  text: TextGlyph,
  'text-background': TextBackgroundGlyph,
  caption: CaptionGlyph,
  'align-left': AlignLeftGlyph,
  'align-center': AlignCenterGlyph,
  'align-right': AlignRightGlyph,
  bold: BoldGlyph,
  italic: ItalicGlyph,
  underline: UnderlineGlyph,
  'safe-zone': SafeZoneGlyph,
  'product-tag': ProductTagGlyph,
  'multi-select': MultiSelectGlyph,
  enhance: EnhanceGlyph,
  adjust: AdjustGlyph,
  filter: FilterGlyph,
  drawing: DrawingGlyph,
  sticker: StickerGlyph,
  audio: AudioGlyph,
  music: MusicGlyph,
  voiceover: VoiceoverGlyph,
  undo: UndoGlyph,
  redo: RedoGlyph,
};

// ── Component ────────────────────────────────────────────────────────

/**
 * Renders a purpose-built creator glyph at the given size and color.
 *
 * All custom glyphs use a 24×24 viewBox with consistent 1.9 stroke width,
 * round caps and joins, and matched optical weight. When `selected` is true,
 * glyphs that have a meaningful filled variant render as filled shapes.
 *
 * For universally understood actions (close, back, play, pause, search,
 * delete, share, camera-flip, chevron, plus, check, settings), use Ionicons
 * from @expo/vector-icons instead.
 */
export function CreatorGlyph({
  name,
  size = 24,
  color = '#000000',
  selected = false,
  accessibilityLabel,
  testID,
}: CreatorGlyphProps): React.ReactElement {
  const GlyphRenderer = GLYPH_REGISTRY[name];
  if (!GlyphRenderer) {
    if (__DEV__) {
      console.warn(`CreatorGlyph: unknown glyph name "${name}"`);
    }
    return <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} />;
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      fill="none"
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Conveys information visually"
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      testID={testID}
    >
      <G color={color}>
        <GlyphRenderer selected={selected} />
      </G>
    </Svg>
  );
}
