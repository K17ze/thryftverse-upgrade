/**
 * lookToolRailConfig — tool rail configuration for the Look composer.
 * Exports `deriveLookToolContext` and `buildLookToolGroups`.
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
  setCropTarget: (layer: CreatorLayer) => void;

  // ── Navigation ──
  navigate: NavigateFn;

  // ── Haptic ──
  haptic: Haptic;
}

// ── Active context derivation ────────────────────────────────────────

/**
 * Derives the active ToolContext from selection state.
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
    default: return 'look-sticker-selected';
  }
}

// ── Tool group builder ───────────────────────────────────────────────

/**
 * Builds the full ToolGroup[] for the Look composer's context tool rail.
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
    setCropTarget,
    navigate,
    haptic,
  } = params;

  const groups: ToolGroup[] = [];

  // ── look-default: Photo, Items, Text, Layout, More ──
  groups.push({
    context: 'look-default',
    primary: [
      {
        id: 'look-add-photo',
        label: 'Photo',
        icon: 'images-outline',
        onPress: handleAddPhoto,
        accessibilityLabel: 'Add photo',
        hapticFeedback: 'light',
        capabilityId: 'photoCapture',
        weight: 'primary',
      },
      {
        id: 'look-items',
        label: 'Items',
        icon: 'bag-outline',
        glyph: 'product-tag',
        onPress: handleOpenItems,
        accessibilityLabel: 'Items',
        hapticFeedback: 'light',
        capabilityId: 'stickerProduct',
        weight: 'secondary',
      },
      {
        id: 'look-text',
        label: 'Text',
        icon: 'text',
        glyph: 'text',
        onPress: handleAddText,
        accessibilityLabel: 'Add text',
        hapticFeedback: 'light',
        capabilityId: 'stickerText',
        weight: 'secondary',
      },
      {
        id: 'look-layout',
        label: 'Layout',
        icon: 'grid-outline',
        onPress: handleOpenLayout,
        accessibilityLabel: 'Layout',
        hapticFeedback: 'light',
        weight: 'secondary',
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
          ? 'Remove background with subject segmentation'
          : 'Crop media to a rectangle',
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
        hapticFeedback: 'light',
      },
      {
        id: 'look-preview',
        label: 'Preview',
        icon: 'eye-outline',
        onPress: () => { haptic.light(); setShowPreview(true); },
        accessibilityLabel: 'Preview',
        hapticFeedback: 'light',
      },
      {
        id: 'look-drafts',
        label: 'Drafts',
        icon: 'document-outline',
        onPress: () => { haptic.light(); navigate('CreatorDraftList'); },
        accessibilityLabel: 'Drafts',
        hapticFeedback: 'light',
      },
      {
        id: 'look-settings',
        label: 'Settings',
        icon: 'settings-outline',
        onPress: () => { haptic.light(); setShowSettings(true); },
        accessibilityLabel: 'Settings',
        hapticFeedback: 'light',
      },
    ],
  });

  // ── look-media-selected: Replace, Crop, Auto, Adjust, More ──
  groups.push({
    context: 'look-media-selected',
    primary: [
      {
        id: 'look-media-replace',
        label: 'Replace',
        icon: 'swap-horizontal-outline',
        onPress: () => selectedLayer && handleReplaceMedia(selectedLayer),
        accessibilityLabel: 'Replace media',
        hapticFeedback: 'light',
        weight: 'secondary',
      },
      {
        id: 'look-media-crop',
        label: 'Crop',
        icon: 'crop-outline',
        glyph: 'crop',
        onPress: () => selectedLayer && setCropTarget(selectedLayer),
        accessibilityLabel: 'Crop',
        hapticFeedback: 'medium',
        weight: 'primary',
      },
      {
        id: 'look-media-auto',
        label: 'Auto',
        icon: 'bulb-outline',
        glyph: 'enhance',
        onPress: handleAutoAdjust,
        accessibilityLabel: 'Auto',
        accessibilityHint: 'Apply one-tap color correction',
        hapticFeedback: 'medium',
        weight: 'secondary',
      },
      {
        id: 'look-media-adjust',
        label: 'Adjust',
        icon: 'contrast-outline',
        glyph: 'adjust',
        onPress: handleAdjustAction,
        accessibilityLabel: 'Adjust',
        hapticFeedback: 'medium',
        weight: 'secondary',
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
          ? 'Remove background with subject segmentation'
          : 'Crop media to a rectangle',
        hapticFeedback: 'medium',
      },
      {
        id: 'look-media-front',
        label: 'Front',
        icon: 'arrow-up',
        onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'forward'),
        accessibilityLabel: 'Bring forward',
        hapticFeedback: 'light',
      },
      {
        id: 'look-media-back',
        label: 'Back',
        icon: 'arrow-down',
        onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'backward'),
        accessibilityLabel: 'Send backward',
        hapticFeedback: 'light',
      },
      {
        id: 'look-media-duplicate',
        label: 'Duplicate',
        icon: 'copy-outline',
        onPress: () => selectedLayer && handleDuplicateLayer(selectedLayer.id),
        accessibilityLabel: 'Duplicate',
        hapticFeedback: 'light',
      },
      {
        id: 'look-media-delete',
        label: 'Delete',
        icon: 'trash-outline',
        onPress: () => selectedLayer && handleDeleteLayer(selectedLayer.id),
        accessibilityLabel: 'Delete',
        hapticFeedback: 'medium',
      },
    ],
  });

  // ── look-text-selected: Edit, Font, Color, Align, More ──
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
        hapticFeedback: 'light',
        weight: 'primary',
      },
      {
        id: 'look-text-font',
        label: 'Font',
        icon: 'text-outline',
        onPress: handleTextFontAction,
        accessibilityLabel: 'Font',
        hapticFeedback: 'light',
        weight: 'secondary',
      },
      {
        id: 'look-text-color',
        label: 'Color',
        icon: 'color-palette-outline',
        onPress: handleTextColorAction,
        accessibilityLabel: 'Color',
        hapticFeedback: 'light',
        weight: 'secondary',
      },
      {
        id: 'look-text-align',
        label: 'Align',
        icon: 'list-outline',
        glyph: lookAlignGlyph,
        onPress: handleTextAlignAction,
        accessibilityLabel: 'Align',
        hapticFeedback: 'light',
        weight: 'secondary',
      },
    ],
    overflow: [
      {
        id: 'look-text-front',
        label: 'Front',
        icon: 'arrow-up',
        onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'forward'),
        accessibilityLabel: 'Bring forward',
        hapticFeedback: 'light',
      },
      {
        id: 'look-text-back',
        label: 'Back',
        icon: 'arrow-down',
        onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'backward'),
        accessibilityLabel: 'Send backward',
        hapticFeedback: 'light',
      },
      {
        id: 'look-text-duplicate',
        label: 'Duplicate',
        icon: 'copy-outline',
        onPress: () => selectedLayer && handleDuplicateLayer(selectedLayer.id),
        accessibilityLabel: 'Duplicate',
        hapticFeedback: 'light',
      },
      {
        id: 'look-text-delete',
        label: 'Delete',
        icon: 'trash-outline',
        onPress: () => selectedLayer && handleDeleteLayer(selectedLayer.id),
        accessibilityLabel: 'Delete',
        hapticFeedback: 'medium',
      },
    ],
  });

  // ── look-product-selected: Item, Price, Duplicate, More ──
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
        hapticFeedback: 'light',
        capabilityId: 'stickerProduct',
      },
      {
        id: 'look-product-price',
        label: 'Price',
        icon: 'cash-outline',
        onPress: handleProductPriceAction,
        accessibilityLabel: 'Price',
        hapticFeedback: 'light',
      },
      {
        id: 'look-product-duplicate',
        label: 'Duplicate',
        icon: 'copy-outline',
        onPress: () => selectedLayer && handleDuplicateLayer(selectedLayer.id),
        accessibilityLabel: 'Duplicate',
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
        hapticFeedback: 'light',
      },
      {
        id: 'look-product-back',
        label: 'Back',
        icon: 'arrow-down',
        onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'backward'),
        accessibilityLabel: 'Send backward',
        hapticFeedback: 'light',
      },
      {
        id: 'look-product-delete',
        label: 'Delete',
        icon: 'trash-outline',
        onPress: () => selectedLayer && handleDeleteLayer(selectedLayer.id),
        accessibilityLabel: 'Delete',
        hapticFeedback: 'medium',
      },
    ],
  });

  // ── look-multi-select: Front, Back, Delete ──
  groups.push({
    context: 'look-multi-select',
    primary: [
      {
        id: 'look-multi-front',
        label: 'Front',
        icon: 'arrow-up',
        onPress: handleMultiFront,
        accessibilityLabel: 'Bring to front',
        hapticFeedback: 'light',
        weight: 'primary',
      },
      {
        id: 'look-multi-back',
        label: 'Back',
        icon: 'arrow-down',
        onPress: handleMultiBack,
        accessibilityLabel: 'Send to back',
        hapticFeedback: 'light',
      },
      {
        id: 'look-multi-delete',
        label: 'Delete',
        icon: 'trash-outline',
        onPress: handleMultiDelete,
        accessibilityLabel: 'Delete',
        hapticFeedback: 'medium',
      },
    ],
    overflow: [],
  });

  // ── look-sticker-selected: Edit, Copy, Delete, Front/Back ──
  groups.push({
    context: 'look-sticker-selected',
    primary: [
      {
        id: 'look-sticker-edit',
        label: 'Edit',
        icon: 'create-outline',
        onPress: () => selectedLayer && handleEditLayer(selectedLayer),
        accessibilityLabel: 'Edit',
        hapticFeedback: 'light',
      },
      {
        id: 'look-sticker-duplicate',
        label: 'Copy',
        icon: 'copy-outline',
        onPress: () => selectedLayer && handleDuplicateLayer(selectedLayer.id),
        accessibilityLabel: 'Duplicate',
        hapticFeedback: 'light',
      },
      {
        id: 'look-sticker-delete',
        label: 'Delete',
        icon: 'trash-outline',
        onPress: () => selectedLayer && handleDeleteLayer(selectedLayer.id),
        accessibilityLabel: 'Delete',
        hapticFeedback: 'medium',
      },
    ],
    overflow: [
      {
        id: 'look-sticker-front',
        label: 'Front',
        icon: 'arrow-up',
        onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'forward'),
        accessibilityLabel: 'Bring forward',
        hapticFeedback: 'light',
      },
      {
        id: 'look-sticker-back',
        label: 'Back',
        icon: 'arrow-down',
        onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'backward'),
        accessibilityLabel: 'Send backward',
        hapticFeedback: 'light',
      },
    ],
  });

  return groups;
}
