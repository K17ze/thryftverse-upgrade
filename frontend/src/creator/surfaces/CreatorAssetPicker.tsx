import React, {
  useState,
  useCallback } from 'react';
import { createStableId } from '../../utils/createStableId';
import type { CreatorLayer } from '../core/projectStore/composition';

// ── Extracted sheet components (Phase 2: Asset Picker Decomposition) ──
// These replace the monolithic inline pickers with dedicated, reusable
// sheet components. Each adapter wraps the new sheet to match the
// AssetPickerContent onAddLayer interface.
import { TextEditorSheet } from '../tools/text/TextEditorSheet';
import type { TextStyleConfig as NewTextStyleConfig } from '../tools/text/textStylePresets';
import { StickerBrowserSheet } from '../tools/stickers/StickerBrowserSheet';
import type { StickerDef as NewStickerDef } from '../tools/stickers/StickerCategories';
import { DrawingWorkspace } from '../tools/drawing/DrawingWorkspace';
import type { DrawingDocument } from '../tools/drawing/DrawingTypes';
import { AudioBrowserSheet } from '../tools/audio/AudioBrowserSheet';
import type { AudioConfig as NewAudioConfig } from '../tools/audio/AudioTypes';
import { baseLayer, TEXT_COLORS, SHAPE_COLORS } from './pickers/pickerShared';
import { MediaPicker } from './pickers/MediaPicker';
import { ProductPicker } from './pickers/ProductPicker';
import { MentionPicker } from './pickers/MentionPicker';
import { LookPicker } from './pickers/LookPicker';
import { GifPicker } from './pickers/GifPicker';
import { QuizPicker } from './pickers/QuizPicker';
import { QuestionPicker } from './pickers/QuestionPicker';
import { EmojiSliderPicker } from './pickers/EmojiSliderPicker';
import { CountdownPicker } from './pickers/CountdownPicker';
import { ShapePicker } from './pickers/ShapePicker';
import { VotePicker } from './pickers/VotePicker';
import { LinkPicker } from './pickers/LinkPicker';
import { LocationPicker } from './pickers/LocationPicker';
import { HashtagPicker } from './pickers/HashtagPicker';
import { TimePicker } from './pickers/TimePicker';
import { WeatherPicker } from './pickers/WeatherPicker';

export type AssetPickerMode = 'media' | 'product' | 'mention' | 'look' | 'text' | 'shape' | 'vote' | 'draw' | 'gif' | 'music' | 'quiz' | 'question' | 'emojiSlider' | 'countdown' | 'stickers' | 'link' | 'location' | 'hashtag' | 'time' | 'weather';

export interface CreatorAssetPickerProps {
  visible: boolean;
  mode: AssetPickerMode;
  onClose: () => void;
  onAddLayer: (layer: CreatorLayer) => void;
  editingLayer?: CreatorLayer | null;
  /** Media URI to render as the drawing background (draw-on-media pattern).
   *  Only used by the 'draw' mode. */
  backgroundUri?: string;
}

export function CreatorAssetPicker({ visible, mode, onClose, onAddLayer, editingLayer, backgroundUri }: CreatorAssetPickerProps) {
  if (!visible) return null;

  return (
    <AssetPickerContent mode={mode} onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} backgroundUri={backgroundUri} />
  );
}

// ── Phase 2 Adapters: wrap extracted sheets to match onAddLayer interface ──

/** Adapter for TextEditorSheet — converts (text, style) → text layer. */
function TextEditorAdapter({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const isEditing = editingLayer?.type === 'text';
  const existingPayload = editingLayer?.type === 'text' ? editingLayer.payload : null;
  const handleConfirm = useCallback((text: string, style: NewTextStyleConfig) => {
    // The TextStyleConfig fields mirror the text layer payload, but
    // `textStyle` is typed as `string` in TextStyleConfig while the
    // composition schema expects a specific union. Cast through unknown
    // to satisfy the schema — the values are always valid preset IDs.
    const payload = style as unknown as Record<string, unknown>;
    if (isEditing && editingLayer) {
      onAddLayer({
        ...editingLayer,
        payload: { ...editingLayer.payload, ...payload } as typeof editingLayer.payload } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('text'), 10),
        type: 'text' as const,
        width: 0.6,
        height: 0.1,
        payload: payload as never });
    }
    onClose();
  }, [isEditing, editingLayer, onAddLayer, onClose]);

  return (
    <TextEditorSheet
      visible={true}
      onClose={onClose}
      initialText={existingPayload?.text ?? ''}
      initialStyle={existingPayload ? {
        text: existingPayload.text,
        textStyle: existingPayload.textStyle,
        textColor: existingPayload.textColor,
        backgroundColor: existingPayload.backgroundColor,
        fill: existingPayload.fill,
        stroke: existingPayload.stroke,
        shadow: existingPayload.shadow,
        background: existingPayload.background,
        alignment: existingPayload.alignment,
        opacity: 1,
        textEffect: existingPayload.textEffect,
        textAnimation: existingPayload.textAnimation } : undefined}
      onConfirm={handleConfirm}
    />
  );
}

/** Adapter for StickerBrowserSheet — converts sticker selection → layer. */
function StickerBrowserAdapter({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const [subMode, setSubMode] = useState<AssetPickerMode | null>(null);

  const handleStickerSelect = useCallback((sticker: NewStickerDef) => {
    if (sticker.interactive && sticker.pickerMode) {
      // Route to the interactive sticker's configuration picker
      setSubMode(sticker.pickerMode as AssetPickerMode);
      return;
    }
    // Non-interactive sticker: create a layer directly
    if (sticker.emoji) {
      // Emoji sticker → text layer with emoji as content
      onAddLayer({
        ...baseLayer(createStableId('text'), 10),
        type: 'text',
        width: 0.15,
        height: 0.15,
        payload: {
          text: sticker.emoji,
          textStyle: 'clean',
          fill: { space: 'srgb', r: 1, g: 1, b: 1, a: 1 },
          textColor: TEXT_COLORS[0],
          alignment: 'center',
          opacity: 1,
          textEffect: 'none',
          textAnimation: 'none' } });
    } else if (sticker.iconRef) {
      // Icon-based sticker → decorative layer. Persist the picked glyph
      // (`icon`) so arrows keep their direction and symbols/decorative
      // icons render as themselves — previously every icon sticker was
      // silently stored as a star. `shape` keeps a sensible base for
      // editors that operate on the primitive (ShapePicker).
      const VALID_SHAPES = ['circle', 'square', 'line', 'arrow', 'star', 'heart', 'triangle', 'hexagon'] as const;
      const derived = sticker.id.startsWith('shape-')
        ? sticker.id.slice('shape-'.length)
        : sticker.category === 'arrows' ? 'arrow' : 'star';
      const shape = (VALID_SHAPES as readonly string[]).includes(derived)
        ? (derived as (typeof VALID_SHAPES)[number])
        : 'star';
      onAddLayer({
        ...baseLayer(createStableId('shape'), 5),
        type: 'decorative',
        width: 0.15,
        height: 0.15,
        payload: {
          shape,
          icon: sticker.iconRef,
          color: SHAPE_COLORS[0],
          opacity: 1 } });
    }
    onClose();
  }, [onAddLayer, onClose]);

  // If an interactive sticker was selected, route to its configuration picker.
  if (subMode) {
    return (
      <AssetPickerContent
        mode={subMode}
        onClose={() => setSubMode(null)}
        onAddLayer={onAddLayer}
        editingLayer={null}
      />
    );
  }

  return (
    <StickerBrowserSheet
      visible={true}
      onClose={onClose}
      onStickerSelect={handleStickerSelect}
    />
  );
}

/** Adapter for DrawingWorkspace — converts drawing commit → draw layer. */
function DrawingWorkspaceAdapter({ onClose, onAddLayer, editingLayer, backgroundUri }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null; backgroundUri?: string }) {
  const isEditing = editingLayer?.type === 'draw';

  const handleCommit = useCallback((drawing: DrawingDocument) => {
    // Convert DrawingDocument strokes to composition DrawStroke format.
    // Workspace points are raw pixels in the drawing surface; the
    // composition contract is normalized 0-1 relative to layer bounds.
    const dw = drawing.width || 1;
    const dh = drawing.height || 1;
    const strokes = drawing.strokes.map((s) => ({
      points: s.points.map((p) => ({
        x: Math.min(1, Math.max(0, p.x / dw)),
        y: Math.min(1, Math.max(0, p.y / dh)) })),
      color: s.color,
      width: s.size,
      tool: s.brushType,
      emoji: s.emojiConfig?.emoji,
      emojiSize: s.emojiConfig?.size ?? 32,
      emojiSpacing: s.emojiConfig?.spacing ?? 24,
      emojiJitter: s.emojiConfig?.jitter ?? 0,
      sourceWidth: drawing.width,
      sourceHeight: drawing.height }));
    if (isEditing && editingLayer) {
      onAddLayer({
        ...editingLayer,
        payload: { ...editingLayer.payload, strokes } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('draw'), 10),
        type: 'draw',
        width: 0.8,
        height: 0.8,
        payload: { strokes, opacity: 1 } });
    }
    onClose();
  }, [isEditing, editingLayer, onAddLayer, onClose]);

  return (
    <DrawingWorkspace
      visible={true}
      onClose={onClose}
      onCommit={handleCommit}
      canvasWidth={320}
      canvasHeight={400}
      backgroundUri={backgroundUri}
    />
  );
}

/** Adapter for AudioBrowserSheet — converts audio config → music layer. */
function AudioBrowserAdapter({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const handleConfirm = useCallback((config: NewAudioConfig) => {
    // Create a music layer from the audio config.
    // When no track is selected (trackId is null), this represents
    // original-audio-only configuration — we still create the layer so
    // the volume/offset settings are preserved.
    onAddLayer({
      ...baseLayer(createStableId('music'), 10),
      type: 'music',
      width: 0.3,
      height: 0.08,
      payload: {
        trackName: config.trackId ? 'Selected track' : 'Original audio',
        artistName: '',
        startOffsetMs: config.startOffsetMs,
        opacity: 1,
        volume: 1,
        fadeInMs: 0,
        fadeOutMs: 0 } });
    onClose();
  }, [onAddLayer, onClose]);

  return (
    <AudioBrowserSheet
      visible={true}
      onClose={onClose}
      onConfirm={handleConfirm}
      hasOriginalAudio={true}
    />
  );
}

export function AssetPickerContent({ mode, onClose, onAddLayer, editingLayer, backgroundUri }: { mode: AssetPickerMode; onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null; backgroundUri?: string }) {
  switch (mode) {
    case 'media':
      return <MediaPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'product':
      return <ProductPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'mention':
      return <MentionPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'look':
      return <LookPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'text':
      return <TextEditorAdapter onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'shape':
      return <ShapePicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'vote':
      return <VotePicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'draw':
      return <DrawingWorkspaceAdapter onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} backgroundUri={backgroundUri} />;
    case 'gif':
      return <GifPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'music':
      return <AudioBrowserAdapter onClose={onClose} onAddLayer={onAddLayer} />;
    case 'quiz':
      return <QuizPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'question':
      return <QuestionPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'emojiSlider':
      return <EmojiSliderPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'countdown':
      return <CountdownPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'stickers':
      return <StickerBrowserAdapter onClose={onClose} onAddLayer={onAddLayer} />;
    case 'link':
      return <LinkPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'location':
      return <LocationPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'hashtag':
      return <HashtagPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'time':
      return <TimePicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'weather':
      return <WeatherPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    default:
      return null;
  }
}
