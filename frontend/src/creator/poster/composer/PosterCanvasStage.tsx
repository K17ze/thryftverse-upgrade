/**
 * PosterCanvasStage — the gesture-wrapped frame canvas region of the
 * Poster composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no visual or
 * behavioral change). Owns the frame-swipe GestureDetector, the
 * CreatorCanvas, the drag-to-trash overlay, the multi-select dim overlay,
 * the floating layer menu, the filter HUD pill, the in-place text editor,
 * and the loading / empty / error / safe-zone overlays. Presentational
 * only: all state, gestures, shared values and callbacks arrive as props.
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import type { RouteProp } from '@react-navigation/native';
import type { EdgeInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '../../../theme/ThemeContext';
import { CreatorCanvas, type VideoPlayerRef } from '../../studio/CreatorCanvas';
import { InlineTextEditor } from '../../tools/text/InlineTextEditor';
import { TrashZone } from '../../surfaces/TrashZone';
import { LayerFloatingMenu, type LayerFloatingMenuAction } from '../../surfaces/LayerFloatingMenu';
import { safeZoneInsets } from '../../shared/safeZone';
import type { CreatorDocument, CreatorLayer, CreatorPage } from '../../core/projectStore/composition';
import type { PlaybackClock, PlaybackState, ProjectedClip } from '../../core/playback';
import type { RootStackParamList } from '../../../navigation/types';
import type { useHaptic } from '../../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * The subset of the screen's StyleSheet styles the canvas stage renders.
 * The parent passes its full `styles` object; only these keys are read.
 */
export interface PosterCanvasStageStyles {
  canvasStage: ViewStyle;
  canvasDimOverlay: ViewStyle;
  filterHudPill: ViewStyle;
  filterHudText: TextStyle;
  canvasLoadingOverlay: ViewStyle;
  canvasLoadingPill: ViewStyle;
  canvasLoadingText: TextStyle;
  canvasEmptyHint: ViewStyle;
  canvasEmptyHintTitle: TextStyle;
  canvasEmptyHintSubtitle: TextStyle;
  canvasErrorOverlay: ViewStyle;
  canvasErrorTitle: TextStyle;
  canvasErrorSubtitle: TextStyle;
  canvasErrorRetry: ViewStyle;
  canvasErrorRetryText: TextStyle;
  safeZoneOverlay: ViewStyle;
  safeZoneTop: ViewStyle;
  safeZoneBottom: ViewStyle;
  safeZoneContent: ViewStyle;
}

export interface PosterCanvasStageProps {
  /** Frame-swipe pan gesture (horizontal frame nav / swipe-to-filter). */
  frameSwipeGesture: PanGesture;
  /** Screen styles (the parent's full createStyles() object). */
  styles: PosterCanvasStageStyles;
  /** Theme colors. */
  colors: ThemeColors;
  /** Safe-area insets (filter HUD offset, safe-zone guides). */
  insets: EdgeInsets;
  /** The composition document. */
  document: CreatorDocument;
  /** The active page being edited. */
  page: CreatorPage;
  /** Authored canvas geometry (immutable 9:16 aspect for posters). */
  canvasWidth: number;
  canvasHeight: number;
  /** Vertical letterbox offset of the authored canvas within the viewport. */
  canvasVerticalOffset: number;
  screenWidth: number;
  screenHeight: number;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  selectedLayer: CreatorLayer | null;
  multiSelectMode: boolean;
  /** Haptic engine for canvas feedback. */
  haptic: Haptic;
  handleLayerPress: (layerId: string) => void;
  handleCanvasPress: () => void;
  commitLayerTransform: (id: string, updates: Partial<CreatorLayer>, label: string, isAutoLayout?: boolean) => void;
  handleOverlapCycle: (layerId: string) => void;
  setEditingTextLayerId: (id: string | null) => void;
  setMultiSelectMode: (active: boolean) => void;
  selectLayers: (ids: string[] | null) => void;
  handleMultiDragStart: () => void;
  handleMultiDragCommit: (deltaXNorm: number, deltaYNorm: number) => void;
  removeLayer: (id: string) => void;
  /** The single playback clock driving temporal layers. */
  playbackClock: PlaybackClock;
  /** Playback snapshot (currentTimeMs drives clip-relative layer state). */
  playbackState: PlaybackState;
  /** The clip under the playhead (freeze preview, timed overlays). */
  canvasActiveClip: ProjectedClip | null;
  /** Populated by the canvas with the active video layer's player. */
  videoPlayerRef: React.MutableRefObject<VideoPlayerRef | null>;
  /** 1 while a layer manipulation gesture is active (drives chrome fade + trash zone). */
  manipulationActiveSV: SharedValue<number>;
  setIsManipulating: (active: boolean) => void;
  /** 1 while the dragged layer's center is inside the trash zone. */
  isInTrashZoneSV: SharedValue<number>;
  /** Long-press compare-to-original toggle. */
  compareOriginal: boolean;
  setCompareOriginal: (active: boolean) => void;
  /** Floating layer action bubble state. */
  floatingMenuVisible: boolean;
  isManipulating: boolean;
  floatingMenuActions: LayerFloatingMenuAction[];
  floatingMenuPos: { x: number; y: number };
  /** Swipe-to-filter HUD (Instagram/Snapchat pattern). */
  filterHudName: string | null;
  filterHudAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  /** In-place text editing target. */
  editingTextLayerId: string | null;
  updateLayer: (id: string, updates: Partial<CreatorLayer>, label?: string) => void;
  /** Draft loading / error / empty states. */
  isLoadingDraft: boolean;
  hasContent: boolean;
  draftError: string | null;
  entryComplete: boolean;
  /** Route params (draftId/sourceDocumentId) for the error retry action. */
  route: RouteProp<RootStackParamList, 'CreatorStudio'>;
  retryDraftLoad: (id: string) => void;
  /** Safe-zone overlay toggle (advanced, behind More). */
  showSafeZone: boolean;
}

export function PosterCanvasStage({
  frameSwipeGesture,
  styles,
  colors,
  insets,
  document,
  page,
  canvasWidth,
  canvasHeight,
  canvasVerticalOffset,
  screenWidth,
  screenHeight,
  selectedLayerId,
  selectedLayerIds,
  selectedLayer,
  multiSelectMode,
  haptic,
  handleLayerPress,
  handleCanvasPress,
  commitLayerTransform,
  handleOverlapCycle,
  setEditingTextLayerId,
  setMultiSelectMode,
  selectLayers,
  handleMultiDragStart,
  handleMultiDragCommit,
  removeLayer,
  playbackClock,
  playbackState,
  canvasActiveClip,
  videoPlayerRef,
  manipulationActiveSV,
  setIsManipulating,
  isInTrashZoneSV,
  compareOriginal,
  setCompareOriginal,
  floatingMenuVisible,
  isManipulating,
  floatingMenuActions,
  floatingMenuPos,
  filterHudName,
  filterHudAnimatedStyle,
  editingTextLayerId,
  updateLayer,
  isLoadingDraft,
  hasContent,
  draftError,
  entryComplete,
  route,
  retryDraftLoad,
  showSafeZone,
}: PosterCanvasStageProps) {
  return (
    <GestureDetector gesture={frameSwipeGesture}>
      <View style={styles.canvasStage}>
        <View style={{ position: 'absolute', top: canvasVerticalOffset, left: 0, right: 0 }}>
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
            onLayerTransformChange={(layerId, updates) => commitLayerTransform(layerId, updates, 'Transform layer')}
            onLayerDoubleTap={(layerId) => {
              if (multiSelectMode) {
                handleOverlapCycle(layerId);
                return;
              }
              const l = page?.layers.find((x) => x.id === layerId);
              if (l?.type === 'text') {
                // In-place content editing ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â the TextInput renders AT the
                // layer's position on the canvas. The canvas stays visible.
                setEditingTextLayerId(l.id);
              }
            }}
            onLayerLongPress={(layerId) => {
              // Long-press enters multi-select mode and selects the layer —
              // same grammar as the Look composer (Snapchat/IG pattern).
              // The layers sheet stays reachable via the rail's Layers tool.
              if (!multiSelectMode) {
                haptic.medium();
                setMultiSelectMode(true);
                selectLayers([layerId]);
              }
            }}
            onMultiDragStart={handleMultiDragStart}
            onMultiDragCommit={handleMultiDragCommit}
            onLayerDelete={removeLayer}
            onTrashZoneEnter={() => {
              // Medium haptic when the dragged layer enters the trash
              // zone ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â "you're about to delete" feedback.
              haptic.medium();
            }}
            playbackClock={playbackClock}
            currentTimeMs={playbackState.currentTimeMs}
            activeClip={canvasActiveClip}
            videoPlayerRef={videoPlayerRef}
            manipulationActiveSV={manipulationActiveSV}
            onManipulationChange={setIsManipulating}
            isInTrashZoneSV={isInTrashZoneSV}
            compareOriginal={compareOriginal}
            onCanvasLongPress={() => {
              // Only compare when a media layer with effects is selected.
              if (selectedLayer?.type === 'media' && (selectedLayer.payload.effects?.length ?? 0) > 0) {
                setCompareOriginal(true);
                haptic.light();
              }
            }}
            onCanvasLongPressEnd={() => setCompareOriginal(false)}
          />
          {/* Drag-to-trash overlay ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â fades in during layer drag, highlights
              when the dragged layer enters the bottom zone. Visual-only. */}
          <TrashZone
            manipulationActiveSV={manipulationActiveSV}
            isInTrashZoneSV={isInTrashZoneSV}
          />
        </View>

        {/* Canvas dim overlay — emphasises selected layers in multi-select */}
        {multiSelectMode && (
          <View style={styles.canvasDimOverlay} pointerEvents="none" />
        )}

        {/* Floating layer actions — z-order/duplicate/lock/delete bubble
            anchored above the selected layer (Look parity). Hidden during
            active manipulation so it doesn't float over a live drag. */}
        <LayerFloatingMenu
          visible={floatingMenuVisible && !isManipulating}
          actions={floatingMenuActions}
          x={floatingMenuPos.x}
          y={floatingMenuPos.y}
        />

        {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Filter HUD pill (Instagram/Snapchat swipe-to-filter indicator) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
        {filterHudName && (
          <Reanimated.View
            style={[styles.filterHudPill, filterHudAnimatedStyle, { top: insets.top + 64 }]}
            pointerEvents="none"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.filterHudText}>{filterHudName}</Text>
          </Reanimated.View>
        )}

        {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ In-place text content editor (Snapchat/Instagram pattern) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
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
                  payload: { ...editingTextLayer.payload, text, ...(styleUpdates ?? {}) },
                } as Partial<CreatorLayer>, 'Edit text content');
              }}
              onDismiss={() => setEditingTextLayerId(null)}
            />
          );
        })()}

        {/* Canvas loading overlay */}
        {isLoadingDraft && (
          <View style={styles.canvasLoadingOverlay} pointerEvents="none">
            <View style={[styles.canvasLoadingPill, { backgroundColor: colors.surfaceElevated }]}>
              <ActivityIndicator size="small" color={colors.textPrimary} />
              <Text style={[styles.canvasLoadingText, { color: colors.textPrimary }]}>LoadingÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦</Text>
            </View>
          </View>
        )}

        {/* Empty frame hint ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â authored two-line empty state */}
        {!hasContent && !isLoadingDraft && !draftError && entryComplete && !selectedLayer && (
          <View style={styles.canvasEmptyHint} pointerEvents="none">
            <Text style={[styles.canvasEmptyHintTitle, { color: colors.textSecondary }]}>
              Add media
            </Text>
            <Text style={styles.canvasEmptyHintSubtitle}>
              Add clips or capture video to start editing
            </Text>
          </View>
        )}

        {/* Draft load error overlay ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â visible when loading failed */}
        {!isLoadingDraft && draftError && (
          <View style={styles.canvasErrorOverlay}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.danger} />
            <Text style={[styles.canvasErrorTitle, { color: colors.textPrimary }]}>
              Couldn't load draft
            </Text>
            <Text style={[styles.canvasErrorSubtitle, { color: colors.textSecondary }]}>
              Saved locally
            </Text>
            <Pressable
              onPress={() => {
                const id = route.params?.draftId ?? route.params?.sourceDocumentId;
                if (id) retryDraftLoad(id);
              }}
              style={styles.canvasErrorRetry}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
              accessibilityLabel="Retry loading draft"
              accessibilityHint="Reloads the draft"
              accessibilityRole="button"
            >
              <Text style={[styles.canvasErrorRetryText, { color: colors.brand }]}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {/* Safe zone overlay (advanced ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â behind More) */}
        {showSafeZone && (
          <View style={styles.safeZoneOverlay} pointerEvents="none">
            <View style={[styles.safeZoneTop, { top: 0, height: safeZoneInsets(insets).top }]} />
            <View style={[styles.safeZoneBottom, { bottom: 0, height: safeZoneInsets(insets).bottom }]} />
            <View style={[styles.safeZoneContent, { top: safeZoneInsets(insets).top, bottom: safeZoneInsets(insets).bottom }]} />
          </View>
        )}
      </View>
    </GestureDetector>
  );
}
