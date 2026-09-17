/**
 * PosterSheetStack — presentational sheet/overlay stack for the Poster
 * composer.
 *
 * Extracted from PosterComposerScreen to separate the conditional sheet
 * render tree (preview, layers, publish, settings, help, accessibility,
 * transitions, keyframes, speed curve, reverse, freeze frame, audio fade,
 * text color, crop, cutout, templates, asset picker, frame options,
 * effects, confirmation) from the screen's state orchestration.
 *
 * This component owns no state and uses no hooks — it renders purely from
 * props. Each sheet is a conditional block `{flag && (...)}` that renders
 * `null` when its flag is false, exactly as it did inline in the screen.
 *
 * Per-sheet render branches live in `./sheetStack/` sub-components; this
 * file keeps the props contract, the shared `sheetPaddingBottom` value,
 * and the flat one-line sheets.
 */
import React from 'react';
import type { ViewStyle, TextStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { Space } from '../../theme/designTokens';
import type { ThemeColors } from '../../theme/ThemeContext';
import { CreatorLayersSheet } from '../surfaces/CreatorLayersSheet';
import { CreatorPublishSheet } from '../publish/CreatorPublishSheet';
import { CreatorSettingsSheet } from '../surfaces/CreatorSettingsSheet';
import { CreatorPreviewOverlay } from '../surfaces/CreatorPreviewOverlay';
import { ConfirmationSheet } from '../../components/ConfirmationSheet';
import { HelpShortcutsSheet } from '../surfaces/HelpShortcutsSheet';
import type { AdjustNode } from '../tools/effects';
import type { Keyframe } from './keyframes/KeyframeTypes';
import {
  type CreatorColor,
  type RecentColor,
} from '../color';
import type { ActiveSheet } from './useActiveSheet';
import type { SpeedCurve } from './speedcurves/SpeedCurveTypes';
import type { AssetPickerMode } from '../surfaces/CreatorAssetPicker';
import type { CreatorLayer, CreatorPage, CreatorDocument } from '../core/projectStore/composition';
import type { useHaptic } from '../../hooks/useHaptic';
import type { ConfirmSheetState, UsePosterTopBarActionsResult } from './usePosterTopBarActions';
import { AccessibilitySheets } from './sheetStack/AccessibilitySheets';
import { MediaToolSheets } from './sheetStack/MediaToolSheets';
import { CropCutoutSheets } from './sheetStack/CropCutoutSheets';
import { TemplatePickerSheets } from './sheetStack/TemplatePickerSheets';
import { PageMenuSheet } from './sheetStack/PageMenuSheet';
import { EffectsSheets } from './sheetStack/EffectsSheets';

// ── Types ────────────────────────────────────────────────────────────

type Haptic = ReturnType<typeof useHaptic>;

/**
 * The subset of the screen's StyleSheet styles the sheet stack renders.
 * The parent passes its full `styles` object; only these keys are read.
 */
export interface PosterSheetStackStyles {
  effectsSheetScroll: ViewStyle;
  previewNotReflectedNote: TextStyle;
  effectsAdjustWrap: ViewStyle;
  effectsAutoRow: ViewStyle;
  aiEffectsBtn: ViewStyle;
  aiEffectsBtnText: TextStyle;
}

export interface PosterSheetStackProps {
  // ── Shared ──
  styles: PosterSheetStackStyles;
  colors: ThemeColors;
  /** Bottom safe-area inset (sheet padding). */
  bottomInset: number;
  haptic: Haptic;
  /** Closes the active mutually-exclusive sheet. */
  closeSheet: () => void;
  /** Opens a mutually-exclusive sheet by name. */
  openSheet: (sheet: Exclude<ActiveSheet, null>) => void;
  /** Reanimated shared value driving chrome fade during adjust-slider drag. */
  manipulationActiveSV: SharedValue<number>;

  // ── Selection / document ──
  selectedLayerId: string | null;
  selectedLayer: CreatorLayer | null;
  page: CreatorPage | undefined;
  document: CreatorDocument;
  updateLayer: (id: string, updates: Partial<CreatorLayer>, label?: string) => void;
  reorderLayer: (id: string, direction: 'front' | 'forward' | 'backward' | 'back') => void;

  // ── Simple visibility flags ──
  showPreview: boolean;
  showLayers: boolean;
  showPublish: boolean;
  showSettings: boolean;
  showHelp: boolean;
  showA11yMove: boolean;
  showA11yZOrder: boolean;
  showA11yTransform: boolean;
  showTransitions: boolean;
  showKeyframes: boolean;
  showSpeedCurve: boolean;
  showReverse: boolean;
  showFreezeFrame: boolean;
  showAudioFade: boolean;
  showTextColorPicker: boolean;
  showTemplates: boolean;

  // ── Preview ──
  setShowPreview: (v: boolean) => void;

  // ── Transitions ──
  currentTransitionId: string | null;
  handleTransitionSelect: (presetId: string) => void;

  // ── Keyframes ──
  selectedLayerKeyframes: Keyframe[];
  handleAddKeyframe: (kf: Omit<Keyframe, 'id'>) => void;
  handleUpdateKeyframe: (id: string, updates: Partial<Keyframe>) => void;
  handleRemoveKeyframe: (id: string) => void;

  // ── Speed curve ──
  selectedMediaSpeedCurve: SpeedCurve | null;
  handleSpeedCurveChange: (nextCurve: SpeedCurve) => void;

  // ── Text color picker ──
  setShowTextColorPicker: (v: boolean) => void;
  colorRecents: RecentColor[];
  commitRecentColor: (color: CreatorColor) => void;

  // ── Crop ──
  cropMode: boolean;
  setCropMode: (v: boolean) => void;

  // ── Cutout ──
  cutoutPreviewTarget: CreatorLayer | null;
  setCutoutPreviewTarget: (layer: CreatorLayer | null) => void;

  // ── Templates ──
  setShowTemplates: (v: boolean) => void;
  setDocument: (doc: CreatorDocument) => void;

  // ── Asset picker ──
  pickerMode: AssetPickerMode | null;
  editingLayer: CreatorLayer | null;
  backgroundMediaUri: string | undefined;
  handlePickerClose: () => void;
  handlePickerAddLayer: (layer: CreatorLayer) => void;

  // ── Frame options (PageMenu) ──
  pageMenuIndex: number | null;
  pageCount: number;
  setPageMenuIndex: (v: number | null) => void;
  updatePageDuration: (pageIndex: number, ms: number) => void;
  duplicatePage: (pageIndex: number) => void;
  removePage: (pageIndex: number) => void;
  reorderPages: (from: number, to: number) => void;
  setActivePageIndex: (index: number) => void;

  // ── Effects sheet ──
  showEffectsSheet: boolean;
  selectedMediaLayer: CreatorLayer | null;
  effectsSourceUri: string;
  selectedFilterId: string | null;
  handleEffectFilterSelect: (presetId: string) => void;
  autoAdjustActive: boolean;
  handleAutoAdjust: () => void;
  currentAdjustments: Partial<Omit<AdjustNode, 'type'>>;
  handleEffectAdjustChange: (parameter: string, value: number) => void;
  handleEffectAdjustCommit: (parameter: string, value: number) => void;
  handleEffectReset: () => void;
  /** Current filter intensity 0..1 (null = preset default). */
  filterAmount: number;
  handleEffectIntensityChange: (value: number) => void;
  handleEffectIntensityCommit: (value: number) => void;
  /** Namespaced AI/style effect currently applied (sans `ai:` prefix). */
  activeAIEffectId: string | null;
  handleAIEffectApply: (effectId: string, intensity: number) => void;
  handleAIEffectRemove: (effectId: string) => void;
  setBottomSurface: (surface: 'tools' | 'timeline' | 'effects' | null) => void;

  // ── Confirmation sheet ──
  confirmSheet: ConfirmSheetState;
  setConfirmSheet: UsePosterTopBarActionsResult['setConfirmSheet'];
}

// ── Component ────────────────────────────────────────────────────────

export function PosterSheetStack(props: PosterSheetStackProps) {
  const {
    styles,
    colors,
    bottomInset,
    haptic,
    closeSheet,
    openSheet,
    manipulationActiveSV,
    selectedLayerId,
    selectedLayer,
    page,
    document,
    updateLayer,
    reorderLayer,
    showPreview,
    showLayers,
    showPublish,
    showSettings,
    showHelp,
    showA11yMove,
    showA11yZOrder,
    showA11yTransform,
    showTransitions,
    showKeyframes,
    showSpeedCurve,
    showReverse,
    showFreezeFrame,
    showAudioFade,
    showTextColorPicker,
    showTemplates,
    setShowPreview,
    currentTransitionId,
    handleTransitionSelect,
    selectedLayerKeyframes,
    handleAddKeyframe,
    handleUpdateKeyframe,
    handleRemoveKeyframe,
    selectedMediaSpeedCurve,
    handleSpeedCurveChange,
    setShowTextColorPicker,
    colorRecents,
    commitRecentColor,
    cropMode,
    setCropMode,
    cutoutPreviewTarget,
    setCutoutPreviewTarget,
    setShowTemplates,
    setDocument,
    pickerMode,
    editingLayer,
    backgroundMediaUri,
    handlePickerClose,
    handlePickerAddLayer,
    pageMenuIndex,
    pageCount,
    setPageMenuIndex,
    updatePageDuration,
    duplicatePage,
    removePage,
    reorderPages,
    setActivePageIndex,
    showEffectsSheet,
    selectedMediaLayer,
    effectsSourceUri,
    selectedFilterId,
    handleEffectFilterSelect,
    autoAdjustActive,
    handleAutoAdjust,
    currentAdjustments,
    handleEffectAdjustChange,
    handleEffectAdjustCommit,
    handleEffectReset,
    filterAmount,
    handleEffectIntensityChange,
    handleEffectIntensityCommit,
    activeAIEffectId,
    handleAIEffectApply,
    handleAIEffectRemove,
    setBottomSurface,
    confirmSheet,
    setConfirmSheet,
  } = props;

  const sheetPaddingBottom = bottomInset + Space.sm;

  return (
    <>
      <CreatorPreviewOverlay
        visible={showPreview}
        onClose={() => setShowPreview(false)}
        onPublish={() => {
          setShowPreview(false);
          openSheet('publish');
        }}
      />
      <CreatorLayersSheet visible={showLayers} onClose={closeSheet} />
      <CreatorPublishSheet visible={showPublish} onClose={closeSheet} />
      <CreatorSettingsSheet visible={showSettings} onClose={closeSheet} />
      <HelpShortcutsSheet visible={showHelp} onClose={closeSheet} />

      <AccessibilitySheets
        showA11yMove={showA11yMove}
        showA11yZOrder={showA11yZOrder}
        showA11yTransform={showA11yTransform}
        selectedLayerId={selectedLayerId}
        selectedLayer={selectedLayer}
        page={page}
        closeSheet={closeSheet}
        updateLayer={updateLayer}
        reorderLayer={reorderLayer}
      />
      <MediaToolSheets
        styles={styles}
        colors={colors}
        sheetPaddingBottom={sheetPaddingBottom}
        haptic={haptic}
        closeSheet={closeSheet}
        selectedLayer={selectedLayer}
        page={page}
        updateLayer={updateLayer}
        showTransitions={showTransitions}
        currentTransitionId={currentTransitionId}
        handleTransitionSelect={handleTransitionSelect}
        showKeyframes={showKeyframes}
        selectedLayerKeyframes={selectedLayerKeyframes}
        handleAddKeyframe={handleAddKeyframe}
        handleUpdateKeyframe={handleUpdateKeyframe}
        handleRemoveKeyframe={handleRemoveKeyframe}
        showSpeedCurve={showSpeedCurve}
        selectedMediaSpeedCurve={selectedMediaSpeedCurve}
        handleSpeedCurveChange={handleSpeedCurveChange}
        showReverse={showReverse}
        showFreezeFrame={showFreezeFrame}
        showAudioFade={showAudioFade}
        showTextColorPicker={showTextColorPicker}
        setShowTextColorPicker={setShowTextColorPicker}
        colorRecents={colorRecents}
        commitRecentColor={commitRecentColor}
      />
      <CropCutoutSheets
        cropMode={cropMode}
        setCropMode={setCropMode}
        selectedLayer={selectedLayer}
        updateLayer={updateLayer}
        cutoutPreviewTarget={cutoutPreviewTarget}
        setCutoutPreviewTarget={setCutoutPreviewTarget}
      />
      <TemplatePickerSheets
        showTemplates={showTemplates}
        document={document}
        setShowTemplates={setShowTemplates}
        setDocument={setDocument}
        pickerMode={pickerMode}
        editingLayer={editingLayer}
        backgroundMediaUri={backgroundMediaUri}
        handlePickerClose={handlePickerClose}
        handlePickerAddLayer={handlePickerAddLayer}
      />
      <PageMenuSheet
        pageMenuIndex={pageMenuIndex}
        pageCount={pageCount}
        document={document}
        setPageMenuIndex={setPageMenuIndex}
        updatePageDuration={updatePageDuration}
        duplicatePage={duplicatePage}
        removePage={removePage}
        reorderPages={reorderPages}
        setActivePageIndex={setActivePageIndex}
      />
      <EffectsSheets
        styles={styles}
        colors={colors}
        sheetPaddingBottom={sheetPaddingBottom}
        haptic={haptic}
        manipulationActiveSV={manipulationActiveSV}
        showEffectsSheet={showEffectsSheet}
        selectedMediaLayer={selectedMediaLayer}
        effectsSourceUri={effectsSourceUri}
        selectedFilterId={selectedFilterId}
        handleEffectFilterSelect={handleEffectFilterSelect}
        filterAmount={filterAmount}
        handleEffectIntensityChange={handleEffectIntensityChange}
        handleEffectIntensityCommit={handleEffectIntensityCommit}
        autoAdjustActive={autoAdjustActive}
        handleAutoAdjust={handleAutoAdjust}
        currentAdjustments={currentAdjustments}
        handleEffectAdjustChange={handleEffectAdjustChange}
        handleEffectAdjustCommit={handleEffectAdjustCommit}
        handleEffectReset={handleEffectReset}
        setBottomSurface={setBottomSurface}
        activeAIEffectId={activeAIEffectId}
        handleAIEffectApply={handleAIEffectApply}
        handleAIEffectRemove={handleAIEffectRemove}
      />
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
      />
    </>
  );
}
