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
 */
import React from 'react';
import { View, Text, ScrollView, type ViewStyle, type TextStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { Space } from '../../theme/designTokens';
import type { ThemeColors } from '../../theme/ThemeContext';
import { layerTypeLabel } from '../shared/layerUtils';
import { CreatorLayersSheet } from '../CreatorLayersSheet';
import { CreatorPublishSheet } from '../CreatorPublishSheet';
import { CreatorSettingsSheet } from '../CreatorSettingsSheet';
import { CreatorAssetPicker, type AssetPickerMode } from '../CreatorAssetPicker';
import { CreatorCropSheet } from '../CreatorCropSheet';
import { CutoutPreviewSheet } from '../surfaces/CutoutPreviewSheet';
import { AccessibilityMoveSheet } from '../surfaces/AccessibilityMoveSheet';
import { AccessibilityZOrderSheet, type ZOrderLayer } from '../surfaces/AccessibilityZOrderSheet';
import type { CutoutResult } from '../core/cutout/CutoutService';
import { CreatorTemplateBrowser } from '../CreatorTemplateBrowser';
import { CreatorPreviewOverlay } from '../CreatorPreviewOverlay';
import { ConfirmationSheet } from '../../components/ConfirmationSheet';
import type { CreatorTemplate } from '../templates';
import { PageMenu } from '../studio/PageMenu';
import { GlassSheet } from '../surfaces/GlassSheet';
import { HelpShortcutsSheet } from '../surfaces/HelpShortcutsSheet';
import { EffectPreviewRail, AdjustPanel, FILTER_PRESETS, AutoAdjustButton } from '../tools/effects';
import type { AdjustNode } from '../tools/effects';
import { TransitionPreviewRail } from './transitions/TransitionPreviewRail';
import { TRANSITION_PRESETS } from './transitions/TransitionPresets';
import { KeyframeEditor } from './keyframes/KeyframeEditor';
import type { Keyframe } from './keyframes/KeyframeTypes';
import { SpeedCurveEditor } from './speedcurves/SpeedCurveEditor';
import {
  CreatorColorPicker,
  toHexString,
  fromHexString,
  type CreatorColor,
  type RecentColor,
} from '../color';
import type { ActiveSheet } from './useActiveSheet';
import type { SpeedCurve } from './speedcurves/SpeedCurveTypes';
import { DEFAULT_SPEED_CURVE } from './speedcurves/SpeedCurveTypes';
import { ReverseToggle, FreezeFramePicker, AudioFadeControls } from './tools';
import type { CreatorLayer, CreatorPage, CreatorDocument } from '../composition';
import type { useHaptic } from '../../hooks/useHaptic';
import type { ConfirmSheetState, UsePosterTopBarActionsResult } from './usePosterTopBarActions';

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
  handleEffectReset: () => void;
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
    handleEffectReset,
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

      {/* ── Accessibility sheets (drag alternatives) ─────────────────── */}
      {/* Per spec 09: keyboard/button-based alternatives for users who
          cannot perform drag gestures. onMove wires to updateLayer;
          onReorder wires to reorderLayer. */}
      <AccessibilityMoveSheet
        visible={showA11yMove}
        layerId={selectedLayerId}
        position={selectedLayer ? { x: selectedLayer.x, y: selectedLayer.y } : null}
        onClose={closeSheet}
        onMove={(x, y) => {
          if (selectedLayerId) updateLayer(selectedLayerId, { x, y }, 'Move layer');
        }}
      />
      <AccessibilityZOrderSheet
        visible={showA11yZOrder}
        layers={(page?.layers ?? []).map((l) => ({
          id: l.id,
          label: layerTypeLabel(l.type),
          zIndex: l.zIndex,
        })) as ZOrderLayer[]}
        selectedLayerId={selectedLayerId}
        onClose={closeSheet}
        onReorder={(layerId, direction) => reorderLayer(layerId, direction)}
      />

      {/* ── Transitions sheet (Phase 9) ─────────────────────────────── */}
      {/* Shows the TransitionPreviewRail for the current page. Selecting
          a preset stores the transitionId on the page, which the renderer
          uses to animate the transition to the next page. */}
      {showTransitions && (
        <GlassSheet
          title="Transitions"
          onClose={closeSheet}
          doneHint="Closes the transitions panel"
          paddingBottom={sheetPaddingBottom}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.effectsSheetScroll}
          >
            <TransitionPreviewRail
              presets={TRANSITION_PRESETS}
              selectedId={currentTransitionId}
              onSelect={handleTransitionSelect}
            />
            <View style={{ height: Space.md }} />
          </ScrollView>
        </GlassSheet>
      )}

      {/* ── Keyframe editor sheet (Phase 9) ─────────────────────────── */}
      {/* Shows the KeyframeEditor for the selected layer. Keyframes are
          stored on the layer's `keyframes` array and interpolated by the
          renderer over the layer's timeline. */}
      {showKeyframes && selectedLayer && (
        <GlassSheet
          title="Animation"
          onClose={closeSheet}
          doneHint="Closes the keyframe editor"
          paddingBottom={sheetPaddingBottom}
        >
          <KeyframeEditor
            layerId={selectedLayer.id}
            totalDurationMs={page?.durationMs ?? 5000}
            keyframes={selectedLayerKeyframes}
            layerDefaults={{ x: selectedLayer.x, rotation: selectedLayer.rotation }}
            onAddKeyframe={handleAddKeyframe}
            onUpdateKeyframe={handleUpdateKeyframe}
            onRemoveKeyframe={handleRemoveKeyframe}
          />
        </GlassSheet>
      )}

      {/* ── Speed curve editor sheet ─────────────────────────────────── */}
      {/* Shows the SpeedCurveEditor for the selected media layer. The
          curve maps timeline position (0-1) to speed multiplier (0.25x-4x),
          enabling precise, dynamic speed ramping along a customizable curve
          (Instagram Edits parity, August 2026). */}
      {showSpeedCurve && selectedLayer && selectedLayer.type === 'media' && (
        <GlassSheet
          title="Speed Curve"
          onClose={closeSheet}
          doneHint="Closes the speed curve editor"
          paddingBottom={sheetPaddingBottom}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.effectsSheetScroll}
          >
            <SpeedCurveEditor
              curve={selectedMediaSpeedCurve ?? DEFAULT_SPEED_CURVE}
              onChange={handleSpeedCurveChange}
            />
            <View style={{ height: Space.md }} />
          </ScrollView>
        </GlassSheet>
      )}
      {/* ── Reverse toggle sheet ────────────────────────────────────── */}
      {showReverse && selectedLayer && selectedLayer.type === 'media' && (
        <GlassSheet
          title="Reverse Clip"
          onClose={closeSheet}
          doneHint="Closes the reverse panel"
          paddingBottom={sheetPaddingBottom}
        >
          <View style={{ padding: Space.md, alignItems: 'center' }}>
            <ReverseToggle
              reversed={selectedLayer.payload.reversed ?? false}
              onToggle={(reversed) => {
                updateLayer(selectedLayer.id, {
                  type: 'media',
                  payload: { ...selectedLayer.payload, reversed },
                }, reversed ? 'Reverse clip' : 'Unreverse clip');
                haptic.medium();
              }}
            />
            <Text
              style={[
                styles.previewNotReflectedNote,
                { color: colors.textSecondary },
              ]}
            >
              Preview plays forward. Reverse is applied when the video is exported.
            </Text>
          </View>
        </GlassSheet>
      )}
      {/* ── Freeze frame picker sheet ───────────────────────────────── */}
      {showFreezeFrame && selectedLayer && selectedLayer.type === 'media' && (
        <GlassSheet
          title="Freeze Frame"
          onClose={closeSheet}
          doneHint="Closes the freeze frame panel"
          paddingBottom={sheetPaddingBottom}
        >
          <FreezeFramePicker
            clipDurationMs={selectedLayer.payload.videoDurationMs ?? 5000}
            freezeFrameMs={selectedLayer.payload.freezeFrameMs}
            freezeDurationMs={selectedLayer.payload.freezeDurationMs}
            onSetFreezeFrame={(freezeMs, freezeDurMs) => {
              updateLayer(selectedLayer.id, {
                type: 'media',
                payload: {
                  ...selectedLayer.payload,
                  freezeFrameMs: freezeMs,
                  freezeDurationMs: freezeDurMs,
                },
              }, freezeMs ? 'Set freeze frame' : 'Clear freeze frame');
              haptic.medium();
            }}
          />
          <Text
            style={[
              styles.previewNotReflectedNote,
              { color: colors.textSecondary },
            ]}
          >
            Preview does not hold the frame. The freeze is applied when the video is exported.
          </Text>
        </GlassSheet>
      )}
      {/* ── Audio fade controls sheet ───────────────────────────────── */}
      {showAudioFade && selectedLayer && selectedLayer.type === 'media' && (
        <GlassSheet
          title="Audio Fade"
          onClose={closeSheet}
          doneHint="Closes the audio fade panel"
          paddingBottom={sheetPaddingBottom}
        >
          <AudioFadeControls
            fadeInMs={selectedLayer.payload.fadeInMs ?? 0}
            fadeOutMs={selectedLayer.payload.fadeOutMs ?? 0}
            onChange={(fadeInMs, fadeOutMs) => {
              updateLayer(selectedLayer.id, {
                type: 'media',
                payload: {
                  ...selectedLayer.payload,
                  volume: selectedLayer.payload.volume ?? 1,
                  fadeInMs,
                  fadeOutMs,
                },
              }, 'Set audio fade');
              haptic.medium();
            }}
          />
        </GlassSheet>
      )}
      {/* ── Text color picker sheet ──────────────────────────────────── */}
      {showTextColorPicker && selectedLayer && selectedLayer.type === 'text' && (
        <GlassSheet
          title="Text Color"
          onClose={() => setShowTextColorPicker(false)}
          doneHint="Closes the color picker"
          paddingBottom={sheetPaddingBottom}
        >
          <CreatorColorPicker
            color={selectedLayer.payload.fill ?? fromHexString(selectedLayer.payload.textColor ?? '#ffffff') ?? { space: 'srgb', r: 1, g: 1, b: 1, a: 1 }}
            onChange={(c: CreatorColor) => {
              updateLayer(selectedLayer.id, {
                type: 'text',
                payload: {
                  ...selectedLayer.payload,
                  fill: c,
                  textColor: toHexString(c),
                },
              }, 'Change text color');
            }}
            onCommit={(c: CreatorColor) => {
              updateLayer(selectedLayer.id, {
                type: 'text',
                payload: {
                  ...selectedLayer.payload,
                  fill: c,
                  textColor: toHexString(c),
                },
              }, 'Change text color');
              commitRecentColor(c);
              haptic.light();
            }}
            mode="expanded"
            recents={colorRecents}
            onCommitRecent={commitRecentColor}
            accessibilityLabel="Text color picker"
          />
        </GlassSheet>
      )}
      {/* Pixel crop. The resulting local asset deliberately clears prior
          upload evidence so publish must upload/finalize the edited bytes. */}
      {cropMode && selectedLayer && selectedLayer.type === 'media' && (
        <CreatorCropSheet
          visible={cropMode}
          imageUri={selectedLayer.payload.mediaUri}
          focalPoint={selectedLayer.payload.focalPoint}
          onFocalPointChange={(point) => {
            if (selectedLayer && selectedLayer.type === 'media') {
              updateLayer(selectedLayer.id, {
                type: 'media',
                payload: {
                  ...selectedLayer.payload,
                  focalPoint: point,
                },
              }, 'Set focal point');
            }
          }}
          onClose={() => setCropMode(false)}
          onCropComplete={(newUri) => {
            if (selectedLayer && selectedLayer.type === 'media') {
              updateLayer(selectedLayer.id, {
                type: 'media',
                payload: {
                  ...selectedLayer.payload,
                  mediaUri: newUri,
                  mediaFinalizationId: undefined,
                  mediaAssetId: undefined,
                },
              }, 'Crop media');
            }
            setCropMode(false);
          }}
        />
      )}
      {/* True cutout preview sheet — native subject segmentation.
          Opens when the user taps "Cutout" in the media-selected
          overflow and the native backend is available. Shows a
          before/after preview over a checkerboard. On confirm,
          replaces the media URI with the transparent PNG and stores
          the alpha mask reference on the layer (spec 07 §7). */}
      {cutoutPreviewTarget && cutoutPreviewTarget.type === 'media' && (
        <CutoutPreviewSheet
          visible={!!cutoutPreviewTarget}
          imageUri={cutoutPreviewTarget.payload.mediaUri}
          onClose={() => setCutoutPreviewTarget(null)}
          onConfirm={(result: CutoutResult) => {
            if (cutoutPreviewTarget && cutoutPreviewTarget.type === 'media') {
              updateLayer(cutoutPreviewTarget.id, {
                type: 'media',
                payload: {
                  ...cutoutPreviewTarget.payload,
                  mediaUri: result.uri,
                  contentFit: 'contain',
                },
                maskRef: result.maskRef?.uri,
              } as Partial<CreatorLayer>, 'Apply cutout');
            }
            setCutoutPreviewTarget(null);
          }}
        />
      )}
      <CreatorTemplateBrowser
        visible={showTemplates}
        documentType="poster"
        hasExistingWork={document.pages.some((p) => p.layers.length > 0)}
        onClose={() => setShowTemplates(false)}
        onApply={(template: CreatorTemplate) => {
          const doc = template.build();
          setDocument(doc);
        }}
      />
      <CreatorAssetPicker
        visible={pickerMode !== null}
        mode={pickerMode ?? 'media'}
        editingLayer={editingLayer}
        backgroundUri={backgroundMediaUri}
        onClose={handlePickerClose}
        onAddLayer={handlePickerAddLayer}
      />
      {/* Frame options sheet (duration + duplicate + reorder + delete) */}
      {pageMenuIndex !== null && (
        <PageMenu
          pageIndex={pageMenuIndex}
          pageCount={pageCount}
          currentDuration={document.pages[pageMenuIndex]?.durationMs ?? 5000}
          onClose={() => setPageMenuIndex(null)}
          onSetDuration={(ms) => { updatePageDuration(pageMenuIndex, ms); }}
          onDuplicate={() => { duplicatePage(pageMenuIndex); setPageMenuIndex(null); }}
          onDelete={() => { removePage(pageMenuIndex); setPageMenuIndex(null); }}
          onMoveLeft={() => { if (pageMenuIndex > 0) { reorderPages(pageMenuIndex, pageMenuIndex - 1); setActivePageIndex(pageMenuIndex - 1); } setPageMenuIndex(null); }}
          onMoveRight={() => { if (pageMenuIndex < pageCount - 1) { reorderPages(pageMenuIndex, pageMenuIndex + 1); setActivePageIndex(pageMenuIndex + 1); } setPageMenuIndex(null); }}
        />
      )}
      {/* ── Effects sheet ─────────────────────────────────────────────── */}
      {/* Bottom sheet showing the EffectPreviewRail (filter thumbnails
          rendered from the selected media layer's own source URI) and
          the AdjustPanel (fine-tuning sliders). Filter selection and
          adjustment changes commit to the layer's non-destructive
          `effects` array (EffectNode[]) via updateLayer. */}
      {showEffectsSheet && selectedMediaLayer && (
        <GlassSheet
          title="Effects"
          onClose={() => { haptic.light(); setBottomSurface('tools'); }}
          doneHint="Closes the effects panel"
          paddingBottom={sheetPaddingBottom}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.effectsSheetScroll}
          >
            <EffectPreviewRail
              sourceUri={effectsSourceUri}
              presets={FILTER_PRESETS}
              selectedId={selectedFilterId}
              onSelect={handleEffectFilterSelect}
            />
            <View style={styles.effectsAdjustWrap}>
              <View style={styles.effectsAutoRow}>
                <AutoAdjustButton
                  isActive={autoAdjustActive}
                  onApply={handleAutoAdjust}
                />
              </View>
              <AdjustPanel
                values={currentAdjustments}
                onChange={handleEffectAdjustChange}
                onReset={handleEffectReset}
                onDragStateChange={(dragging) => {
                  // Lightroom flagship pattern: fade top-bar chrome while
                  // dragging an adjust slider so the user focuses on the
                  // image, not the controls. The effects sheet itself
                  // stays visible — only the top bar recedes.
                  manipulationActiveSV.value = dragging ? 1 : 0;
                }}
              />
            </View>
          </ScrollView>
        </GlassSheet>
      )}
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
