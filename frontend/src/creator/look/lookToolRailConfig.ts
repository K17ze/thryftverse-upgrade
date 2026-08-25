/**
 * lookToolRailConfig — Context tool rail configuration for the Look composer.
 *
 * Extracted from LookComposerScreen to separate the tool rail configuration
 * (tool group definitions for 5 contexts, active context derivation, and
 * accessibility labels/hints) from the screen's rendering orchestration.
 *
 * The file exports:
 *   - `deriveLookToolContext` — resolves the active ToolContext from
 *     selection state.
 *   - `buildLookToolGroups` — builds the full ToolGroup[] array from a
 *     params object containing all handler functions and state setters.
 *
 * Each tool definition includes accessibility labels and hints for
 * VoiceOver / TalkBack support (AGENTS.md §11).
 */

import type { ToolContext, ToolGroup, ToolDefinition } from '../core/toolRegistry';
import type { CreatorLayer } from '../composition';
import type { useHaptic } from '../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

type Haptic = ReturnType<typeof useHaptic>;

/**
 * Navigation function type — matches React Navigation's `navigate`.
 */
type NavigateFn = (route: string) => void;

/**
 * All dependencies required to build the Look tool rail groups.
 * The screen passes these in from its handler callbacks and state setters.
 */
export interface LookToolRailParams {
  // ── Selection state ──
  selectedLayer: CreatorLayer | null;
  cutoutSupported: boolean;

  // ── Object action handlers ──
  handleAddPhoto: () => void;
  handleOpenItems: () => void;
  handleAddText: () => void;
  handleOpenLayout: () => void;
  handleCutoutAction: () => void;
  handleReplaceMedia: (layer: CreatorLayer) => void;
  handleAdjustAction: () => void;
  handleAutoAdjust: () => void;
  handleEffectsAction: () => void;
  handleReorderLayer: (id: string, direction: 'forward' | 'backward') => void;
  handleDuplicateLayer: (id: string) => void;
  handleDeleteLayer: (id: string) => void;
  handleEditLayer: (layer: CreatorLayer) => void;
  handleLinkItem: (layer: CreatorLayer) => void;
  handleTextEditAction: () => void;
  handleTextFontAction: () => void;
  handleTextColorAction: () => void;
  handleTextAlignAction: () => void;
  handleProductPriceAction: () => void;
  handleCropAction: () => void;

  // ── Multi-select handlers ──
  handleMultiFront: () => void;
  handleMultiBack: () => void;
  handleMultiDelete: () => void;

  // ── State setters (for overflow / sheet tools) ──
  setShowLayers: (show: boolean) => void;
  setShowPreview: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setShowOverflow: (show: boolean) => void;
  setShowAlignPicker: (fn: (prev: boolean) => boolean) => void;
  setCropTarget: (layer: CreatorLayer) => void;

  // ── Navigation ──
  navigate: NavigateFn;

  // ── Haptic ──
  haptic: Haptic;
}

// ── Active context derivation ────────────────────────────────────────

/**
 * Derives the active ToolContext from the current selection state.
 *
 * Contexts:
 *   look-default         → no selection
 *   look-media-selected  → media layer selected
 *   look-text-selected   → text layer selected
 *   look-product-selected → product layer selected
 *   look-multi-select    → multiple layers selected
 */
export function deriveLookToolContext(
  multiSelectMode: boolean,
  selectedLayerIds: string[],
  selectedLayer: CreatorLayer | null,
): ToolContext {
  if (multiSelectMode && selectedLayerIds.length > 0) return 'look-multi-select';
  if (!selectedLayer) return 'look-default';
  switch (selectedLayer.type) {
    case 'media': return 'look-media-selected';
    case 'text': return 'look-text-selected';
    case 'product': return 'look-product-selected';
    case 'quiz': return 'look-quiz-selected';
    case 'question': return 'look-question-selected';
    case 'countdown': return 'look-countdown-selected';
    case 'emojiSlider': return 'look-emojiSlider-selected';
    case 'draw': return 'look-draw-selected';
    case 'gif': return 'look-gif-selected';
    case 'music': return 'look-music-selected';
    case 'link': return 'look-link-selected';
    case 'location': return 'look-location-selected';
    case 'hashtag': return 'look-hashtag-selected';
    case 'vote': return 'look-vote-selected';
    case 'mention': return 'look-mention-selected';
    case 'decorative': return 'look-decorative-selected';
    case 'look': return 'look-look-selected';
    default: return 'look-default';
  }
}

// ── Tool group builder ───────────────────────────────────────────────

/**
 * Builds the full set of ToolGroup definitions for the Look composer's
 * context tool rail. Each group maps a ToolContext to its primary and
 * overflow tool definitions.
 *
 * The screen calls this inside a `useMemo` and passes the result to
 * `ContextToolRail`. All accessibility labels and hints are defined here
 * so the rail configuration is self-documenting.
 */
export function buildLookToolGroups(params: LookToolRailParams): ToolGroup[] {
  const {
    selectedLayer,
    cutoutSupported,
    handleAddPhoto,
    handleOpenItems,
    handleAddText,
    handleOpenLayout,
    handleCutoutAction,
    handleReplaceMedia,
    handleAdjustAction,
    handleAutoAdjust,
    handleEffectsAction,
    handleReorderLayer,
    handleDuplicateLayer,
    handleDeleteLayer,
    handleEditLayer,
    handleLinkItem,
    handleTextEditAction,
    handleTextFontAction,
    handleTextColorAction,
    handleTextAlignAction,
    handleProductPriceAction,
    handleCropAction,
    handleMultiFront,
    handleMultiBack,
    handleMultiDelete,
    setShowLayers,
    setShowPreview,
    setShowSettings,
    setShowOverflow,
    setShowAlignPicker,
    setCropTarget,
    navigate,
    haptic,
  } = params;

  const groups: ToolGroup[] = [];

  // ── look-default: Add, Items, Text, Layout, More ──
  groups.push({
    context: 'look-default',
    primary: [
      {
        id: 'look-add-photo',
        label: 'Add',
        icon: 'images-outline',
        onPress: handleAddPhoto,
        accessibilityLabel: 'Add photo',
        accessibilityHint: 'Opens the media picker to add a photo to the canvas',
        hapticFeedback: 'light',
        capabilityId: 'photoCapture',
      },
      {
        id: 'look-items',
        label: 'Items',
        icon: 'bag-outline',
        glyph: 'product-tag',
        onPress: handleOpenItems,
        accessibilityLabel: 'Items',
        accessibilityHint: 'Opens the items drawer to add products from your closet, listings, or search',
        hapticFeedback: 'light',
        capabilityId: 'stickerProduct',
      },
      {
        id: 'look-text',
        label: 'Text',
        icon: 'text',
        glyph: 'text',
        onPress: handleAddText,
        accessibilityLabel: 'Add text',
        accessibilityHint: 'Opens the text picker to add a text layer',
        hapticFeedback: 'light',
        capabilityId: 'stickerText',
      },
      {
        id: 'look-layout',
        label: 'Layout',
        icon: 'grid-outline',
        onPress: handleOpenLayout,
        accessibilityLabel: 'Layout',
        accessibilityHint: 'Opens the layout panel to arrange your photos with grid, masonry, or collage presets',
        hapticFeedback: 'light',
      },
    ],
    overflow: [
      {
        id: 'look-cutout',
        label: cutoutSupported ? 'Cutout' : 'Crop',
        icon: cutoutSupported ? 'cut-outline' : 'crop-outline',
        glyph: cutoutSupported ? 'cutout' : 'crop',
        onPress: handleCutoutAction,
        accessibilityLabel: cutoutSupported ? 'Cutout' : 'Crop',
        accessibilityHint: cutoutSupported
          ? 'Removes the background using on-device subject segmentation'
          : 'Crops the selected media to a rectangle',
        hapticFeedback: 'medium',
        disabled: !selectedLayer || selectedLayer.type !== 'media',
      },
      {
        id: 'look-layers',
        label: 'Layers',
        icon: 'layers-outline',
        glyph: 'layers',
        onPress: () => { haptic.light(); setShowLayers(true); },
        accessibilityLabel: 'Layers',
        accessibilityHint: 'Opens the layers panel to reorder, lock, or hide objects',
        hapticFeedback: 'light',
      },
      {
        id: 'look-preview',
        label: 'Preview',
        icon: 'eye-outline',
        onPress: () => { haptic.light(); setShowPreview(true); },
        accessibilityLabel: 'Preview',
        accessibilityHint: 'Previews the look as it will appear when published',
        hapticFeedback: 'light',
      },
      {
        id: 'look-drafts',
        label: 'Drafts',
        icon: 'document-outline',
        onPress: () => { haptic.light(); navigate('CreatorDraftList'); },
        accessibilityLabel: 'Drafts',
        accessibilityHint: 'Opens the drafts list to resume a saved draft',
        hapticFeedback: 'light',
      },
      {
        id: 'look-settings',
        label: 'Settings',
        icon: 'settings-outline',
        onPress: () => { haptic.light(); setShowSettings(true); },
        accessibilityLabel: 'Settings',
        accessibilityHint: 'Opens the look settings sheet',
        hapticFeedback: 'light',
      },
    ],
  });

  // ── look-media-selected: Replace, Crop, Auto, Adjust, More ──
  // Effects moved to overflow — the rail caps at 4 primary tools, so a
  // 5th primary would be silently dropped. Effects is reachable via More.
  groups.push({
    context: 'look-media-selected',
    primary: [
      {
        id: 'look-media-replace',
        label: 'Replace',
        icon: 'swap-horizontal-outline',
        onPress: () => selectedLayer && handleReplaceMedia(selectedLayer),
        accessibilityLabel: 'Replace media',
        accessibilityHint: 'Opens the media picker to swap the selected photo',
        hapticFeedback: 'light',
      },
      {
        id: 'look-media-crop',
        label: 'Crop',
        icon: 'crop-outline',
        glyph: 'crop',
        onPress: () => selectedLayer && setCropTarget(selectedLayer),
        accessibilityLabel: 'Crop',
        accessibilityHint: 'Opens the crop sheet to adjust the aspect ratio',
        hapticFeedback: 'medium',
      },
      {
        id: 'look-media-auto',
        label: 'Auto',
        icon: 'bulb-outline',
        glyph: 'enhance',
        onPress: handleAutoAdjust,
        accessibilityLabel: 'Auto',
        accessibilityHint: 'Applies one-tap intelligent color correction',
        hapticFeedback: 'medium',
      },
      {
        id: 'look-media-adjust',
        label: 'Adjust',
        icon: 'contrast-outline',
        glyph: 'adjust',
        onPress: handleAdjustAction,
        accessibilityLabel: 'Adjust',
        accessibilityHint: 'Opens exposure and color adjustment sliders for the selected media',
        hapticFeedback: 'medium',
      },
    ],
    overflow: [
      {
        id: 'look-media-effects',
        label: 'Effects',
        icon: 'color-filter-outline',
        glyph: 'filter',
        onPress: handleEffectsAction,
        accessibilityLabel: 'Effects',
        accessibilityHint: 'Opens the effects panel for the selected media',
        hapticFeedback: 'medium',
        capabilityId: 'imageFilter',
      },
      {
        id: 'look-media-cutout',
        label: cutoutSupported ? 'Cutout' : 'Crop',
        icon: cutoutSupported ? 'cut-outline' : 'crop-outline',
        glyph: cutoutSupported ? 'cutout' : 'crop',
        onPress: handleCutoutAction,
        accessibilityLabel: cutoutSupported ? 'Cutout' : 'Crop',
        accessibilityHint: cutoutSupported
          ? 'Removes the background using on-device subject segmentation'
          : 'Crops the selected media to a rectangle',
        hapticFeedback: 'medium',
      },
      {
        id: 'look-media-front',
        label: 'Front',
        icon: 'arrow-up',
        onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'forward'),
        accessibilityLabel: 'Bring forward',
        accessibilityHint: 'Moves the selected object forward in the layer stack',
        hapticFeedback: 'light',
      },
      {
        id: 'look-media-back',
        label: 'Back',
        icon: 'arrow-down',
        onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'backward'),
        accessibilityLabel: 'Send backward',
        accessibilityHint: 'Moves the selected object backward in the layer stack',
        hapticFeedback: 'light',
      },
      {
        id: 'look-media-duplicate',
        label: 'Duplicate',
        icon: 'copy-outline',
        onPress: () => selectedLayer && handleDuplicateLayer(selectedLayer.id),
        accessibilityLabel: 'Duplicate',
        accessibilityHint: 'Duplicates the selected object',
        hapticFeedback: 'light',
      },
      {
        id: 'look-media-delete',
        label: 'Delete',
        icon: 'trash-outline',
        onPress: () => selectedLayer && handleDeleteLayer(selectedLayer.id),
        accessibilityLabel: 'Delete',
        accessibilityHint: 'Deletes the selected object',
        hapticFeedback: 'medium',
      },
    ],
  });

  // ── look-text-selected: Edit, Font, Color, Align, More ──
  // The Align tool's glyph is dynamic — it reflects the current alignment
  // state of the selected text layer (Snapchat/Instagram pattern).
  const lookCurrentAlignment = selectedLayer?.type === 'text'
    ? (selectedLayer.payload.alignment ?? 'center')
    : 'center';
  const lookAlignGlyph: ToolDefinition['glyph'] =
    lookCurrentAlignment === 'left' ? 'align-left'
    : lookCurrentAlignment === 'right' ? 'align-right'
    : 'align-center';
  groups.push({
    context: 'look-text-selected',
    primary: [
      {
        id: 'look-text-edit',
        label: 'Edit',
        icon: 'create-outline',
        onPress: handleTextEditAction,
        accessibilityLabel: 'Edit text',
        accessibilityHint: 'Opens the text editor for the selected text layer',
        hapticFeedback: 'light',
      },
      {
        id: 'look-text-font',
        label: 'Font',
        icon: 'text-outline',
        onPress: handleTextFontAction,
        accessibilityLabel: 'Font',
        accessibilityHint: 'Opens the text editor to change the font style',
        hapticFeedback: 'light',
      },
      {
        id: 'look-text-color',
        label: 'Color',
        icon: 'color-palette-outline',
        onPress: handleTextColorAction,
        accessibilityLabel: 'Color',
        accessibilityHint: 'Opens the text editor to change the text color',
        hapticFeedback: 'light',
      },
      {
        id: 'look-text-align',
        label: 'Align',
        icon: 'list-outline',
        glyph: lookAlignGlyph,
        onPress: handleTextAlignAction,
        accessibilityLabel: 'Align',
        accessibilityHint: 'Opens the text editor to change the text alignment',
        hapticFeedback: 'light',
      },
    ],
    overflow: [
      {
        id: 'look-text-front',
        label: 'Front',
        icon: 'arrow-up',
        onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'forward'),
        accessibilityLabel: 'Bring forward',
        accessibilityHint: 'Moves the selected text forward in the layer stack',
        hapticFeedback: 'light',
      },
      {
        id: 'look-text-back',
        label: 'Back',
        icon: 'arrow-down',
        onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'backward'),
        accessibilityLabel: 'Send backward',
        accessibilityHint: 'Moves the selected text backward in the layer stack',
        hapticFeedback: 'light',
      },
      {
        id: 'look-text-duplicate',
        label: 'Duplicate',
        icon: 'copy-outline',
        onPress: () => selectedLayer && handleDuplicateLayer(selectedLayer.id),
        accessibilityLabel: 'Duplicate',
        accessibilityHint: 'Duplicates the selected text',
        hapticFeedback: 'light',
      },
      {
        id: 'look-text-delete',
        label: 'Delete',
        icon: 'trash-outline',
        onPress: () => selectedLayer && handleDeleteLayer(selectedLayer.id),
        accessibilityLabel: 'Delete',
        accessibilityHint: 'Deletes the selected text',
        hapticFeedback: 'medium',
      },
    ],
  });

  // ── look-product-selected: Item, Price, Duplicate, More ──
  // "Tag Style" removed — it opened the product picker (same as "Item"),
  // not a tag style editor. A tag style editor does not exist yet.
  groups.push({
    context: 'look-product-selected',
    primary: [
      {
        id: 'look-product-item',
        label: 'Item',
        icon: 'pricetag-outline',
        glyph: 'product-tag',
        onPress: () => selectedLayer && handleLinkItem(selectedLayer),
        accessibilityLabel: 'Change item',
        accessibilityHint: 'Opens the product picker to link a different listing',
        hapticFeedback: 'light',
        capabilityId: 'stickerProduct',
      },
      {
        id: 'look-product-price',
        label: 'Price',
        icon: 'cash-outline',
        onPress: handleProductPriceAction,
        accessibilityLabel: 'Price',
        accessibilityHint: 'Opens the product picker to update the linked listing price',
        hapticFeedback: 'light',
      },
      {
        id: 'look-product-duplicate',
        label: 'Duplicate',
        icon: 'copy-outline',
        onPress: () => selectedLayer && handleDuplicateLayer(selectedLayer.id),
        accessibilityLabel: 'Duplicate',
        accessibilityHint: 'Duplicates the selected product tag',
        hapticFeedback: 'light',
      },
    ],
    overflow: [
      {
        id: 'look-product-front',
        label: 'Front',
        icon: 'arrow-up',
        onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'forward'),
        accessibilityLabel: 'Bring forward',
        accessibilityHint: 'Moves the selected product tag forward in the layer stack',
        hapticFeedback: 'light',
      },
      {
        id: 'look-product-back',
        label: 'Back',
        icon: 'arrow-down',
        onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'backward'),
        accessibilityLabel: 'Send backward',
        accessibilityHint: 'Moves the selected product tag backward in the layer stack',
        hapticFeedback: 'light',
      },
      {
        id: 'look-product-delete',
        label: 'Delete',
        icon: 'trash-outline',
        onPress: () => selectedLayer && handleDeleteLayer(selectedLayer.id),
        accessibilityLabel: 'Delete',
        accessibilityHint: 'Deletes the selected product tag',
        hapticFeedback: 'medium',
      },
    ],
  });

  // ── look-multi-select: Align, Front, Back, Delete ──
  groups.push({
    context: 'look-multi-select',
    primary: [
      {
        id: 'look-multi-align',
        label: 'Align',
        icon: 'grid-outline',
        onPress: () => { haptic.light(); setShowAlignPicker((p) => !p); },
        accessibilityLabel: 'Align',
        accessibilityHint: 'Aligns the selected objects — left, center, right, top, middle, bottom',
        hapticFeedback: 'light',
      },
      {
        id: 'look-multi-front',
        label: 'Front',
        icon: 'arrow-up',
        onPress: handleMultiFront,
        accessibilityLabel: 'Bring to front',
        accessibilityHint: 'Brings all selected objects to the front of the layer stack',
        hapticFeedback: 'light',
      },
      {
        id: 'look-multi-back',
        label: 'Back',
        icon: 'arrow-down',
        onPress: handleMultiBack,
        accessibilityLabel: 'Send to back',
        accessibilityHint: 'Sends all selected objects to the back of the layer stack',
        hapticFeedback: 'light',
      },
      {
        id: 'look-multi-delete',
        label: 'Delete',
        icon: 'trash-outline',
        onPress: handleMultiDelete,
        accessibilityLabel: 'Delete',
        accessibilityHint: 'Deletes all selected objects',
        hapticFeedback: 'medium',
      },
    ],
    overflow: [],
  });

  // ── Interactive sticker contexts: Edit, Front, Back, Delete ──
  // All interactive sticker types (quiz, question, countdown, emojiSlider,
  // draw, gif, music, link, location, hashtag, vote, mention, decorative,
  // look) share the same tool pattern: Edit (opens the sticker's editor),
  // layer reordering (Front/Back in overflow), and Delete.
  // The Edit tool's onPress delegates to handleEditLayer which routes to
  // the correct editor based on the layer type.
  const interactiveStickerContexts: ToolContext[] = [
    'look-quiz-selected',
    'look-question-selected',
    'look-countdown-selected',
    'look-emojiSlider-selected',
    'look-draw-selected',
    'look-gif-selected',
    'look-music-selected',
    'look-link-selected',
    'look-location-selected',
    'look-hashtag-selected',
    'look-vote-selected',
    'look-mention-selected',
    'look-decorative-selected',
    'look-look-selected',
  ];

  for (const ctx of interactiveStickerContexts) {
    const stickerType = ctx.replace('look-', '').replace('-selected', '');
    groups.push({
      context: ctx,
      primary: [
        {
          id: `look-${stickerType}-edit`,
          label: 'Edit',
          icon: 'create-outline',
          onPress: () => selectedLayer && handleEditLayer(selectedLayer),
          accessibilityLabel: 'Edit',
          accessibilityHint: `Edit the selected ${stickerType}`,
          hapticFeedback: 'light',
        },
        {
          id: `look-${stickerType}-duplicate`,
          label: 'Copy',
          icon: 'copy-outline',
          onPress: () => selectedLayer && handleDuplicateLayer(selectedLayer.id),
          accessibilityLabel: 'Duplicate',
          accessibilityHint: `Duplicates the selected ${stickerType}`,
          hapticFeedback: 'light',
        },
        {
          id: `look-${stickerType}-delete`,
          label: 'Delete',
          icon: 'trash-outline',
          onPress: () => selectedLayer && handleDeleteLayer(selectedLayer.id),
          accessibilityLabel: 'Delete',
          accessibilityHint: `Deletes the selected ${stickerType}`,
          hapticFeedback: 'medium',
        },
      ],
      overflow: [
        {
          id: `look-${stickerType}-front`,
          label: 'Front',
          icon: 'arrow-up',
          onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'forward'),
          accessibilityLabel: 'Bring forward',
          accessibilityHint: `Moves the selected ${stickerType} forward in the layer stack`,
          hapticFeedback: 'light',
        },
        {
          id: `look-${stickerType}-back`,
          label: 'Back',
          icon: 'arrow-down',
          onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'backward'),
          accessibilityLabel: 'Send backward',
          accessibilityHint: `Moves the selected ${stickerType} backward in the layer stack`,
          hapticFeedback: 'light',
        },
      ],
    });
  }

  return groups;
}
