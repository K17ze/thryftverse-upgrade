/**
 * posterToolRailConfig — Pure tool rail configuration builder for the
 * Poster composer.
 *
 * Extracted from PosterComposerScreen to separate the tool rail
 * configuration (the context-sensitive ToolGroup[] that drives the
 * ContextToolRail) from the screen's rendering orchestration.
 *
 * This module exports a single pure function `buildPosterToolRail` that
 * accepts all the handlers and state the tool rail depends on and
 * returns the ToolGroup[] array. No React hooks — just a config builder.
 *
 * Each context maps to a ToolGroup with up to 4 primary tools + overflow.
 * All onPress handlers wire to EXISTING handlers — no new actions.
 *
 * Pattern follows the extracted hooks (usePosterSession.ts, etc.) but
 * is a pure function, not a hook, since the tool rail config has no
 * state or effects of its own.
 */

import type { NativeStackNavigationProp, RootStackParamList } from '../../navigation/types';
import type { CreatorLayer } from '../composition';
import type { useHaptic } from '../../hooks/useHaptic';
import type { ToastType } from '../../context/ToastContext';
import type {
  ToolGroup,
  ToolDefinition,
} from '../core/toolRegistry';
import { TEXT_STYLE_PRESETS } from '../tools/text/textStylePresets';
import type { ActiveSheet } from './useActiveSheet';
import type { AssetPickerMode } from '../CreatorAssetPicker';

// ── Types ────────────────────────────────────────────────────────────

type Navigation = NativeStackNavigationProp<RootStackParamList, 'CreatorStudio'>;

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * The toast `show` function signature from ToastContext.
 */
type ShowToast = (message: string, type?: ToastType) => void;

/**
 * The mutation signature from CreatorContext.updateLayer (history-pushing).
 */
type UpdateLayerFn = (
  id: string,
  updates: Partial<CreatorLayer>,
  label?: string,
) => void;

/**
 * The active bottom surface. The tool rail is rendered when 'tools';
 * the timeline replaces it when 'timeline'; effects when 'effects'.
 */
type BottomSurface = 'tools' | 'timeline' | 'effects' | null;

export interface BuildPosterToolRailInput {
  /** Haptic engine. */
  haptic: Haptic;
  /** Opens a sheet (from useActiveSheet). */
  openSheet: (sheet: Exclude<ActiveSheet, null>) => void;
  /** The currently selected layer (drives context-specific tools). */
  selectedLayer: CreatorLayer | null;
  /** Updates a layer (history-pushing). From CreatorContext. */
  updateLayer: UpdateLayerFn;
  /** Toast show function. */
  show: ShowToast;
  /** Stack navigation prop. */
  navigation: Navigation;
  /** Total number of pages in the document. */
  pageCount: number;
  /** Whether true cutout (segmentation) is supported on this device. */
  cutoutSupported: boolean;
  /** Whether the safe zone overlay is currently visible. */
  showSafeZone: boolean;
  /** The active bottom surface ('tools' | 'timeline' | 'effects' | null). */
  bottomSurface: BottomSurface;
  /** Callback when the user switches to moodboard. */
  onEntryTypeChange: (type: 'look' | 'poster' | 'moodboard') => void;

  // ── State setters (stable references — not in the dep array) ──
  /** Setter for showPreview state. */
  setShowPreview: (value: boolean) => void;
  /** Setter for showSafeZone state. */
  setShowSafeZone: (value: boolean | ((prev: boolean) => boolean)) => void;
  /** Setter for showTemplates state. */
  setShowTemplates: (value: boolean) => void;
  /** Setter for the transient selected clip id. */
  setSelectedClipId: (id: string | null) => void;
  /** Setter for userRequestedTimeline state. */
  setUserRequestedTimeline: (value: boolean) => void;
  /** Setter for bottomSurface state. */
  setBottomSurface: (surface: BottomSurface) => void;
  /** Setter for the asset picker mode. */
  setPickerMode: (mode: AssetPickerMode | null) => void;
  /** Setter for the text color picker visibility. */
  setShowTextColorPicker: (value: boolean) => void;

  // ── Action handlers ──
  /** Adds a text layer directly on the canvas. */
  handleAddText: () => void;
  /** Opens the sticker picker. */
  handleAddStickers: () => void;
  /** Opens the product/listing picker. */
  handleAddProduct: () => void;
  /** Opens the effects bottom sheet. */
  handleAddEffects: () => void;
  /** Opens the drawing tool. */
  handleDraw: () => void;
  /** Adds a new frame/page. */
  handleAddFrame: () => void;
  /** Toggles the timeline bottom surface. */
  handleTimelineToggle: () => void;
  /** Opens the inline editor or picker for the selected layer. */
  handleEditLayer: (layer: CreatorLayer) => void;
  /** Reorders a layer forward or backward. */
  handleReorderLayer: (id: string, direction: 'forward' | 'backward') => void;
  /** Duplicates a layer. */
  handleDuplicateLayer: (id: string) => void;
  /** Deletes a layer. */
  handleDeleteLayer: (id: string) => void;
  /** Opens the crop editor for the selected media. */
  handleCropAction: () => void;
  /** Opens the cutout (segmentation) sheet for the selected media. */
  handleCutoutAction: () => void;
  /** Opens the adjust panel for the selected media. */
  handleAdjustAction: () => void;
  /** Toggles auto-adjust on the selected media. */
  handleAutoAdjust: () => void;
}

// ── Config builder ───────────────────────────────────────────────────

/**
 * Builds the context-sensitive tool rail configuration for the Poster
 * composer. Pure function — no React hooks, no side effects beyond the
 * closures captured in the returned onPress handlers.
 *
 * Returns a ToolGroup[] array (one group per ToolContext) that the
 * ContextToolRail consumes to render the appropriate tool set.
 */
export function buildPosterToolRail({
  haptic,
  openSheet,
  selectedLayer,
  updateLayer,
  show,
  navigation,
  pageCount,
  cutoutSupported,
  showSafeZone,
  bottomSurface,
  onEntryTypeChange,
  setShowPreview,
  setShowSafeZone,
  setShowTemplates,
  setSelectedClipId,
  setUserRequestedTimeline,
  setBottomSurface,
  setPickerMode,
  setShowTextColorPicker,
  handleAddText,
  handleAddStickers,
  handleAddProduct,
  handleAddEffects,
  handleDraw,
  handleAddFrame,
  handleTimelineToggle,
  handleEditLayer,
  handleReorderLayer,
  handleDuplicateLayer,
  handleDeleteLayer,
  handleCropAction,
  handleCutoutAction,
  handleAdjustAction,
  handleAutoAdjust,
}: BuildPosterToolRailInput): ToolGroup[] {
  const mk = (
    id: string,
    label: string,
    icon: ToolDefinition['icon'],
    onPress: () => void,
    accessibilityLabel: string,
    accessibilityHint?: string,
    glyph?: ToolDefinition['glyph'],
    active?: boolean,
    capabilityId?: string,
  ): ToolDefinition => ({
    id,
    label,
    icon,
    glyph,
    onPress,
    accessibilityLabel,
    accessibilityHint,
    active,
    capabilityId,
  });

  // Overflow tools shared across contexts (Layers, Preview, Safe Zone,
  // Templates, Moodboard, Drafts, Settings, Add Frame)
  const sharedOverflow: ToolDefinition[] = [
    mk('transitions', 'Transitions', 'swap-horizontal-outline', () => { haptic.light(); openSheet('transitions'); }, 'Transitions', 'Opens the transition picker for the current frame'),
    mk('layers', 'Layers', 'layers-outline', () => { openSheet('layers'); }, 'Layers', 'Opens the layers panel', 'layers'),
    mk('preview', 'Preview', 'eye-outline', () => { setShowPreview(true); }, 'Preview', 'Previews the story'),
    mk('safe-zone', 'Safe Zone', 'scan-outline', () => { setShowSafeZone((p) => !p); }, 'Safe Zone', 'Toggles the safe zone overlay', 'safe-zone', showSafeZone),
    mk('templates', 'Templates', 'grid-outline', () => { setShowTemplates(true); }, 'Templates', 'Opens the template browser'),
    mk('moodboard', 'Moodboard', 'albums-outline', () => { onEntryTypeChange('moodboard'); }, 'Moodboard Studio', 'Switch to Moodboard Studio'),
    mk('drafts', 'Drafts', 'document-text-outline', () => { navigation.navigate('CreatorDraftList'); }, 'Drafts', 'Opens saved drafts'),
    mk('settings', 'Settings', 'settings-outline', () => { openSheet('settings'); }, 'Settings', 'Opens composer settings'),
  ];

  const addFrameOverflow: ToolDefinition[] = pageCount < 10
    ? [mk('add-frame', 'Add Frame', 'add-circle-outline', handleAddFrame, 'Add frame', 'Adds a new frame')]
    : [];

  const productOverflow: ToolDefinition[] = [
    mk('product', 'Listing', 'pricetag-outline', handleAddProduct, 'Add listing', 'Opens the listing picker', 'product-tag', undefined, 'stickerProduct'),
  ];

  // ── poster-photo-default: Text, Stickers, Product, Draw ──
  // 2026 flagship creator UX: ≤4 primary actions (Meta Edits / Instagram /
  // CapCut pattern). Draw and Timeline move to overflow — Draw is a
  // secondary creative tool, and Timeline is canvas-dominant for a single
  // photo (auto-hidden). The primary layer is ruthlessly guarded against
  // feature creep; the 4 most common creative actions are immediately
  // visible, everything else is one tap away under "More".
  //
  // Icons: purpose-built CreatorGlyph SVGs (not generic Ionicons) for
  // creative tools — this is the designed icon family for the creator
  // department. Universally understood actions (close, delete, etc.) still
  // use Ionicons.
  //
  // capabilityId gates each creation tool against the capability registry
  // (acceptance gate 6: tools generated from capability truth).
  const photoDefault: ToolGroup = {
    context: 'poster-photo-default',
    primary: [
      mk('text', 'Text', 'text', handleAddText, 'Add text', 'Opens the text picker', 'text', undefined, 'stickerText'),
      mk('stickers', 'Stickers', 'happy-outline', handleAddStickers, 'Add stickers', 'Opens the sticker picker', 'sticker'),
      ...productOverflow,
      mk('draw', 'Draw', 'brush-outline', handleDraw, 'Draw', 'Opens the drawing tool', 'drawing', undefined, 'layerDraw'),
    ],
    overflow: [
      mk('effects', 'Effects', 'color-filter-outline', handleAddEffects, 'Effects', 'Opens effects for the background photo', 'filter', undefined, 'imageFilter'),
      mk('timeline', 'Timeline', 'film-outline', handleTimelineToggle, 'Timeline', 'Expands the timeline for editing clip timing and overlays', undefined, bottomSurface === 'timeline'),
      ...addFrameOverflow,
      ...sharedOverflow,
    ],
  };

  // ── poster-video-default: Timeline, Text, Stickers, Product ──
  // Timeline stays primary for video (it is the job-to-be-done for video
  // editing). Stickers move to overflow — less frequently needed for video
  // than the core 4 of timeline + text + music + effects.
  const videoDefault: ToolGroup = {
    context: 'poster-video-default',
    primary: [
      mk('timeline', 'Timeline', 'film-outline', handleTimelineToggle, 'Timeline', 'Toggles the video timeline', undefined, bottomSurface === 'timeline'),
      mk('text', 'Text', 'text', handleAddText, 'Add text', 'Opens the text picker', 'text', undefined, 'stickerText'),
      mk('stickers', 'Stickers', 'happy-outline', handleAddStickers, 'Add stickers', 'Opens the sticker picker', 'sticker'),
      ...productOverflow,
    ],
    overflow: [
      mk('draw', 'Draw', 'brush-outline', handleDraw, 'Draw', 'Opens the drawing tool', 'drawing', undefined, 'layerDraw'),
      ...addFrameOverflow,
      ...sharedOverflow,
    ],
  };

  // ── poster-media-selected: Replace, Crop, Adjust, Effects ──
  // Per report §7.4: the 4 most relevant media-editing actions are
  // Replace, Crop, Adjust, Effects. Auto-enhance moves to overflow —
  // it's a one-tap convenience, not a primary editing mode. Advanced
  // tools (cutout, animation, speed curve, reverse, freeze frame,
  // audio fade) remain in overflow grouped under Edit.
  const isVideoMedia = selectedLayer?.type === 'media' && selectedLayer.payload.mediaType === 'video';
  const editClipTool = mk('edit-clip', 'Edit Clip', 'film-outline', () => {
    if (!selectedLayer) return;
    haptic.light();
    setSelectedClipId(selectedLayer.id);
    setUserRequestedTimeline(true);
    setBottomSurface('timeline');
  }, 'Edit clip', 'Expands the timeline to trim and adjust the video clip');
  const mediaSelected: ToolGroup = {
    context: 'poster-media-selected',
    primary: isVideoMedia
      ? [
          mk('replace', 'Replace', 'swap-horizontal-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Replace video', 'Replaces the selected video'),
          editClipTool,
          mk('duplicate', 'Duplicate', 'copy-outline', () => { if (selectedLayer) handleDuplicateLayer(selectedLayer.id); }, 'Duplicate clip', 'Duplicates the selected video clip'),
          mk('delete', 'Delete', 'trash-outline', () => { if (selectedLayer) handleDeleteLayer(selectedLayer.id); }, 'Delete clip', 'Deletes the selected video clip'),
        ]
      : [
          mk('replace', 'Replace', 'swap-horizontal-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Replace photo', 'Replaces the selected photo'),
          mk('crop', 'Crop', 'crop-outline', handleCropAction, 'Crop', 'Opens the pixel crop editor', 'crop'),
          mk('adjust', 'Adjust', 'options-outline', handleAdjustAction, 'Adjust', 'Opens exposure and color controls', 'adjust'),
          mk('effects', 'Effects', 'color-filter-outline', handleAddEffects, 'Effects', 'Opens photo effects and filters', 'filter'),
        ],
    overflow: [
      ...(!isVideoMedia ? [
        mk('auto', 'Auto', 'bulb-outline', handleAutoAdjust, 'Auto', 'Applies one-tap color correction', 'enhance'),
        ...(cutoutSupported ? [mk('cutout', 'Cutout', 'cut-outline', handleCutoutAction, 'Cutout', 'Removes the photo background using on-device subject segmentation', 'cutout')] : []),
        mk('animation', 'Animation', 'analytics-outline', () => { haptic.light(); openSheet('keyframes'); }, 'Animation', 'Opens the keyframe editor for the selected layer', 'keyframe'),
      ] : [
        // ── Video-specific advanced tools (time context) ──
        // Per report §7.4: Split, Trim, Speed, Volume appear only when
        // a video clip is selected (via Edit Clip → timeline toolbar).
        // These advanced tools extend that set — they are grouped under
        // Edit in the overflow, not flat-dumped.
        mk('speed-curve', 'Speed Curve', 'analytics-outline', () => { haptic.light(); openSheet('speedCurve'); }, 'Speed curve', 'Opens the variable speed ramping editor'),
        mk('reverse', 'Reverse', 'play-skip-back-outline', () => { haptic.light(); openSheet('reverse'); }, 'Reverse', 'Reverses the video clip playback'),
        mk('freeze-frame', 'Freeze Frame', 'pause-outline', () => { haptic.light(); openSheet('freezeFrame'); }, 'Freeze frame', 'Adds a freeze frame at a specific point'),
        mk('audio-fade', 'Audio Fade', 'volume-mute-outline', () => { haptic.light(); openSheet('audioFade'); }, 'Audio fade', 'Sets audio fade in and out durations'),
      ]),
      mk('front', 'Front', 'arrow-up', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'forward'); }, 'Bring forward', 'Brings the layer forward'),
      mk('back', 'Back', 'arrow-down', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'backward'); }, 'Send backward', 'Sends the layer backward'),
      ...(!isVideoMedia ? [
        mk('duplicate', 'Duplicate', 'copy-outline', () => { if (selectedLayer) handleDuplicateLayer(selectedLayer.id); }, 'Duplicate', 'Duplicates the layer'),
        mk('delete', 'Delete', 'trash-outline', () => { if (selectedLayer) handleDeleteLayer(selectedLayer.id); }, 'Delete', 'Deletes the layer'),
      ] : []),
      ...sharedOverflow,
    ],
  };

  // ── poster-text-selected: Edit, Font, Color, Align, More ──
  // The Align tool's glyph is dynamic — it reflects the current alignment
  // state of the selected text layer. This is the Snapchat/Instagram pattern:
  // the icon shows the current state, not a generic "align" symbol.
  const currentAlignment = selectedLayer?.type === 'text'
    ? (selectedLayer.payload.alignment ?? 'center')
    : 'center';
  const alignGlyph: ToolDefinition['glyph'] =
    currentAlignment === 'left' ? 'align-left'
    : currentAlignment === 'right' ? 'align-right'
    : 'align-center';
  const textSelected: ToolGroup = {
    context: 'poster-text-selected',
    primary: [
      mk('edit', 'Edit', 'create-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Edit text', 'Opens the inline text editor'),
      mk('font', 'Font', 'text-outline', () => {
        if (!selectedLayer || selectedLayer.type !== 'text') return;
        haptic.light();
        // Cycle through font presets (matches InlineTextToolbar behavior)
        const currentIdx = TEXT_STYLE_PRESETS.findIndex(p => p.id === (selectedLayer.payload.textStyle ?? 'clean'));
        const nextPreset = TEXT_STYLE_PRESETS[(currentIdx + 1) % TEXT_STYLE_PRESETS.length];
        updateLayer(selectedLayer.id, {
          type: 'text',
          payload: { ...selectedLayer.payload, textStyle: nextPreset.id as typeof selectedLayer.payload.textStyle },
        }, 'Change font style');
      }, 'Font', 'Cycles through font styles'),
      mk('color', 'Color', 'color-palette-outline', () => {
        if (!selectedLayer || selectedLayer.type !== 'text') return;
        haptic.light();
        setShowTextColorPicker(true);
      }, 'Color', 'Opens the color picker'),
      mk('align', 'Align', 'text', () => {
        if (!selectedLayer || selectedLayer.type !== 'text') return;
        haptic.light();
        const current = selectedLayer.payload.alignment ?? 'center';
        const next = current === 'left' ? 'center' : current === 'center' ? 'right' : 'left';
        updateLayer(selectedLayer.id, {
          type: 'text',
          payload: { ...selectedLayer.payload, alignment: next },
        }, 'Change alignment');
      }, 'Align', 'Cycles text alignment', alignGlyph),
    ],
    overflow: [
      mk('front', 'Front', 'arrow-up', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'forward'); }, 'Bring forward', 'Brings the layer forward'),
      mk('back', 'Back', 'arrow-down', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'backward'); }, 'Send backward', 'Sends the layer backward'),
      mk('duplicate', 'Duplicate', 'copy-outline', () => { if (selectedLayer) handleDuplicateLayer(selectedLayer.id); }, 'Duplicate', 'Duplicates the layer'),
      mk('delete', 'Delete', 'trash-outline', () => { if (selectedLayer) handleDeleteLayer(selectedLayer.id); }, 'Delete', 'Deletes the layer'),
      ...sharedOverflow,
    ],
  };

  // ── poster-sticker-selected: Edit, Replace, More ──
  const stickerSelected: ToolGroup = {
    context: 'poster-sticker-selected',
    primary: [
      mk('edit', 'Edit', 'create-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Edit sticker', 'Edits the selected sticker'),
      mk('replace', 'Replace', 'swap-horizontal-outline', () => { setPickerMode('stickers'); }, 'Replace sticker', 'Replaces the selected sticker'),
    ],
    overflow: [
      mk('front', 'Front', 'arrow-up', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'forward'); }, 'Bring forward', 'Brings the layer forward'),
      mk('back', 'Back', 'arrow-down', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'backward'); }, 'Send backward', 'Sends the layer backward'),
      mk('duplicate', 'Duplicate', 'copy-outline', () => { if (selectedLayer) handleDuplicateLayer(selectedLayer.id); }, 'Duplicate', 'Duplicates the layer'),
      mk('delete', 'Delete', 'trash-outline', () => { if (selectedLayer) handleDeleteLayer(selectedLayer.id); }, 'Delete', 'Deletes the layer'),
      ...sharedOverflow,
    ],
  };

  // ── poster-product-selected: Item, Price, More ──
  const productSelected: ToolGroup = {
    context: 'poster-product-selected',
    primary: [
      mk('item', 'Item', 'bag-handle-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Edit item', 'Links a different listing'),
      mk('price', 'Price', 'logo-usd', () => {
        if (!selectedLayer || selectedLayer.type !== 'product') return;
        haptic.light();
        const price = selectedLayer.payload.snapshotPriceGbp;
        if (price != null) {
          show(`£${price.toFixed(2)}`);
        } else {
          show('No price set');
        }
      }, 'Price', 'Shows the linked listing price'),
    ],
    overflow: [
      mk('front', 'Front', 'arrow-up', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'forward'); }, 'Bring forward', 'Brings the layer forward'),
      mk('back', 'Back', 'arrow-down', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'backward'); }, 'Send backward', 'Sends the layer backward'),
      mk('duplicate', 'Duplicate', 'copy-outline', () => { if (selectedLayer) handleDuplicateLayer(selectedLayer.id); }, 'Duplicate', 'Duplicates the layer'),
      mk('delete', 'Delete', 'trash-outline', () => { if (selectedLayer) handleDeleteLayer(selectedLayer.id); }, 'Delete', 'Deletes the layer'),
      ...sharedOverflow,
    ],
  };

  return [
    photoDefault,
    videoDefault,
    mediaSelected,
    textSelected,
    stickerSelected,
    productSelected,
  ];
}
