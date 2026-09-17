import React from 'react';
import {
  View,
  Text,
  Pressable,
  LayoutChangeEvent,
  ActivityIndicator } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { Elevation } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { CreatorDocument, CreatorPage } from '../../core/projectStore/composition';
import { CreatorCanvas, type CreatorCanvasProps } from '../../studio/CreatorCanvas';
import { LayerFloatingMenu, type LayerFloatingMenuAction } from '../../surfaces/LayerFloatingMenu';
import { TrashZone } from '../../surfaces/TrashZone';
import { InlineTextEditor } from '../../tools/text/InlineTextEditor';
import { safeZoneInsets } from '../../shared/safeZone';
import { useHaptic } from '../../../hooks/useHaptic';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { lookComposerStyles as styles } from '../LookComposerStyles';

// ── Canvas stage (presentational) ───────────────────────────────────
// Extracted from LookComposerScreen — pure relocation, no changes.
// Owns the neutral workspace canvas region: the CreatorCanvas itself,
// the drag-to-trash overlay, the floating z-order menu, the in-place
// text editor, and the canvas-level loading / error / dim overlays.
export function LookCanvasStage({
  canvasVerticalOffset,
  handleCanvasLayout,
  document,
  page,
  canvasWidth,
  canvasHeight,
  selectedLayerId,
  selectedLayerIds,
  handleLayerPress,
  handleCanvasPress,
  commitLayerTransform,
  multiSelectMode,
  handleOverlapCycle,
  setEditingTextLayerId,
  haptic,
  setMultiSelectMode,
  selectLayers,
  handleMultiDragStart,
  handleMultiDragCommit,
  removeLayer,
  showSafeZone,
  insets,
  manipulationActiveSV,
  setIsManipulating,
  isInTrashZoneSV,
  floatingMenuVisible,
  isManipulating,
  floatingMenuActions,
  floatingMenuPos,
  editingTextLayerId,
  updateLayer,
  screenWidth,
  screenHeight,
  isLoadingSourceLook,
  isLoadingDraft,
  sourceLookError,
  handleRetrySourceLook,
  colors }: {
  canvasVerticalOffset: number;
  handleCanvasLayout: (e: LayoutChangeEvent) => void;
  document: CreatorDocument;
  page: CreatorPage;
  canvasWidth: number;
  canvasHeight: number;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  handleLayerPress: (layerId: string) => void;
  handleCanvasPress: () => void;
  commitLayerTransform: CreatorContextValue['commitLayerTransform'];
  multiSelectMode: boolean;
  handleOverlapCycle: (layerId: string) => void;
  setEditingTextLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  haptic: ReturnType<typeof useHaptic>;
  setMultiSelectMode: React.Dispatch<React.SetStateAction<boolean>>;
  selectLayers: CreatorContextValue['selectLayers'];
  handleMultiDragStart: CreatorCanvasProps['onMultiDragStart'];
  handleMultiDragCommit: CreatorCanvasProps['onMultiDragCommit'];
  removeLayer: CreatorContextValue['removeLayer'];
  showSafeZone: boolean;
  insets: EdgeInsets;
  manipulationActiveSV: SharedValue<number>;
  setIsManipulating: CreatorCanvasProps['onManipulationChange'];
  isInTrashZoneSV: SharedValue<number>;
  floatingMenuVisible: boolean;
  isManipulating: boolean;
  floatingMenuActions: LayerFloatingMenuAction[];
  floatingMenuPos: { x: number; y: number };
  editingTextLayerId: string | null;
  updateLayer: CreatorContextValue['updateLayer'];
  screenWidth: number;
  screenHeight: number;
  isLoadingSourceLook: boolean;
  isLoadingDraft: boolean;
  sourceLookError: boolean;
  handleRetrySourceLook: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <>
      {/* ── Neutral workspace canvas ───────────────────────────────── */}
      {/* Look is spatial. The 4:5 canvas sits in a neutral dark workspace
          with breathing room. Media objects are directly manipulated. */}
      <View style={styles.canvasStage}>
        <View style={[{ position: 'absolute', top: canvasVerticalOffset, left: 0, right: 0 }, Elevation.subtle]} onLayout={handleCanvasLayout}>
          <CreatorCanvas
            document={document}
            page={page}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            mode="edit"
            selectedLayerId={selectedLayerId}
            selectedLayerIds={selectedLayerIds}
            onLayerPress={handleLayerPress}
            onCanvasPress={handleCanvasPress}
            onLayerTransformChange={(layerId, updates) => commitLayerTransform(layerId, updates, 'Transform object')}
            onLayerDoubleTap={(layerId) => {
              if (multiSelectMode) {
                handleOverlapCycle(layerId);
                return;
              }
              const l = page?.layers.find((x) => x.id === layerId);
              if (l?.type === 'text') {
                // In-place content editing — the TextInput renders AT the
                // layer's position on the canvas. The canvas stays visible.
                setEditingTextLayerId(l.id);
              }
            }}
            onLayerLongPress={(layerId) => {
              // Long-press enters multi-select mode and selects the layer.
              haptic.medium();
              setMultiSelectMode(true);
              selectLayers([layerId]);
            }}
            onMultiDragStart={handleMultiDragStart}
            onMultiDragCommit={handleMultiDragCommit}
            onLayerDelete={removeLayer}
            onTrashZoneEnter={() => {
              // Medium haptic when the dragged layer enters the trash
              // zone — "you're about to delete" feedback.
              haptic.medium();
              haptic.warning();
            }}
            showSafeZone={showSafeZone}
            safeZoneTop={safeZoneInsets(insets).top}
            safeZoneBottom={safeZoneInsets(insets).bottom}
            manipulationActiveSV={manipulationActiveSV}
            onManipulationChange={setIsManipulating}
            isInTrashZoneSV={isInTrashZoneSV}
          />

          {/* Drag-to-trash overlay — fades in during layer drag, highlights
              when the dragged layer enters the bottom zone. Visual-only. */}
          <TrashZone
            manipulationActiveSV={manipulationActiveSV}
            isInTrashZoneSV={isInTrashZoneSV}
          />

          {/* ── Floating z-order / context menu for the selected layer ── */}
          {/* Appears above the selected layer. Provides quick access to
              z-order, duplicate, lock, and delete without opening the
              Layers sheet (§3.3 gap: "z-order hidden in a sheet"). */}
          <LayerFloatingMenu
            visible={floatingMenuVisible && !isManipulating}
            actions={floatingMenuActions}
            x={floatingMenuPos.x}
            y={floatingMenuPos.y}
          />

          {/* ── In-place text content editor (Snapchat/Instagram pattern) ── */}
          {/* Renders a TextInput AT the text layer's position so the user can
              type in place while the canvas stays visible. The modal
              TextEditorSheet is reserved for advanced styling (More button). */}
          {editingTextLayerId && (() => {
            const editingTextLayer = page?.layers.find((l) => l.id === editingTextLayerId);
            if (!editingTextLayer || editingTextLayer.type !== 'text') return null;
            return (
              <InlineTextEditor
                layer={editingTextLayer}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                canvasTopOffset={canvasVerticalOffset}
                screenWidth={screenWidth}
                screenHeight={screenHeight}
                onCommit={(text, styleUpdates) => {
                  updateLayer(editingTextLayer.id, {
                    type: 'text',
                    payload: { ...editingTextLayer.payload, text, ...(styleUpdates ?? {}) } }, 'Edit text content');
                }}
                onDismiss={() => setEditingTextLayerId(null)}
              />
            );
          })()}
        </View>

        {/* Canvas loading overlay */}
        {(isLoadingSourceLook || isLoadingDraft) && (
          <View style={styles.canvasLoadingOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color={colors.textSecondary} />
          </View>
        )}

        {/* Source look error banner — minimal, one line + retry button */}
        {sourceLookError && !isLoadingSourceLook && (
          <View style={[styles.sourceLookErrorBanner, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.sourceLookErrorText, { color: colors.danger }]}>
              Couldn't load source look
            </Text>
            <Pressable
              onPress={handleRetrySourceLook}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              accessibilityLabel="Retry loading source look"
              accessibilityHint="Reloads the source look"
              accessibilityRole="button"
            >
              <Text style={[styles.sourceLookErrorRetry, { color: colors.danger }]}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {/* Canvas dim overlay — emphasises selected layers in multi-select */}
        {multiSelectMode && (
          <View style={styles.canvasDimOverlay} pointerEvents="none" />
        )}
      </View>
    </>
  );
}
