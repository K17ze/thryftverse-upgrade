import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Space, Radius, FontFamily} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import type { CreatorLayer, CreatorDocument, CreatorPage } from '../core/projectStore/composition';
import { getVisibleLayersSorted, hasFullBleedMedia, isDefaultBackground } from '../core/projectStore/composition';
// Scene evaluator + render profiles — the single pure owner of scene state.
// The canvas evaluates the scene once per render and passes resolved
// per-layer data down to the layer renderers.
import {
  evaluateScene,
  type ResolvedLayer,
  type ResolvedScene } from '../engine/evaluateScene';
import {
  getRenderProfile,
  type RenderProfile,
  type RenderProfileId } from '../engine/renderProfiles';
// Playback pipeline — single clock, keyframe evaluator, effect evaluator
import type { PlaybackClock } from '../core/playback/PlaybackClock';
import type { ProjectedClip } from '../core/playback';
import { getCanvasLabel, CANVAS_ACCESSIBILITY_ACTIONS } from '../core/a11y/CanvasAccessibilityLabels';
import { SafeZoneOverlay } from '../surfaces/SafeZoneOverlay';
import type { VideoPlayerRef } from './layers/layerContentShared';
import { LayerRenderer, type MultiDragChannel, type LayerPositionRegistry } from './layers/LayerRenderer';
import { AlignmentGuides } from './layers/AlignmentGuides';
export type { VideoPlayerRef };

// Shared empty array for the (impossible) case where a layer id is not in
// the memoised sibling map — avoids allocating a fresh [] on each render.
const EMPTY_LAYERS: CreatorLayer[] = [];

// ── Layer type accent colors ───────────────────────────────────────
// Premium selection visuals use distinct accent colors per layer category.
// Now imported from shared/layerAccents.ts so the poster composition
// surface, the creator canvas, and the layers sheet share one source of
// truth for layer-type accent colouring.

export interface CreatorCanvasProps {
  document: CreatorDocument;
  page: CreatorPage;
  canvasWidth: number;
  canvasHeight: number;
  mode: 'edit' | 'preview' | 'view';
  selectedLayerId?: string | null;
  /** Full multi-select set. When non-empty, all listed layers show selection. */
  selectedLayerIds?: string[];
  onLayerPress?: (layerId: string) => void;
  onCanvasPress?: () => void;
  /** Fires when the user long-presses the canvas background (not a layer).
   *  Used by the host to drive the Lightroom-style compare-to-original: while
   *  the long-press is held, the host sets `compareOriginal` to true and the
   *  canvas renders the selected media layer without effects/filters. */
  onCanvasLongPress?: () => void;
  /** Fires when the long-press is released (touch up). The host sets
   *  `compareOriginal` back to false. */
  onCanvasLongPressEnd?: () => void;
  /** When true, media layers render without their effect stack (color
   *  matrices, LUTs, blur, vignette) — the "original" image. Used for the
   *  Lightroom long-press compare pattern. */
  compareOriginal?: boolean;
  onLayerPositionChange?: (layerId: string, x: number, y: number) => void;
  onLayerTransformChange?: (layerId: string, updates: Partial<CreatorLayer>) => void;
  onLayerDoubleTap?: (layerId: string) => void;
  onLayerLongPress?: (layerId: string) => void;
  // Multi-select drag callbacks. When a selected layer is dragged and
  // multiple layers are selected, these fire so the parent can move all
  // selected layers together. Deltas are in normalized (0–1) canvas coords.
  // Live drag updates travel on the UI thread via canvas-level shared
  // values — the parent only receives the start snapshot request and the
  // final commit, so no per-frame JS bridge traffic during the gesture.
  onMultiDragStart?: () => void;
  onMultiDragCommit?: (deltaXNorm: number, deltaYNorm: number) => void;
  // Context menu actions (long-press). Optional — when omitted the context
  // menu shows only the actions that can be served by onLayerTransformChange.
  onLayerDuplicate?: (layerId: string) => void;
  onLayerDelete?: (layerId: string) => void;
  onLayerReorder?: (layerId: string, direction: 'front' | 'back') => void;
  onLayerToggleLock?: (layerId: string) => void;
  /** When true, renders the shared SafeZoneOverlay inside the canvas.
   *  Parent composers manage when to show it (manual toggle under More,
   *  or auto-while-dragging near reserved top/bottom UI areas). */
  showSafeZone?: boolean;
  /** Height (px) of the top reserved chrome region for the safe zone. */
  safeZoneTop?: number;
  /** Height (px) of the bottom reserved tool dock for the safe zone. */
  safeZoneBottom?: number;
  /** Playback clock — when provided, video play/pause/seek follows the clock
   *  instead of hardcoded shouldPlay. Drives temporal visibility, keyframes,
   *  and timeline-driven playback. Optional — absent in Look composer and
   *  viewer contexts (backward compatible). */
  playbackClock?: PlaybackClock | null;
  /** Current playback time (ms) — when provided with playbackClock, drives
   *  temporal visibility, keyframe evaluation, and overlay time ranges.
   *  When absent, layers render in their static (non-temporal) state. */
  currentTimeMs?: number;
  /** The clip active at the current playhead, or null. When the active clip
   *  has a freeze-frame edit and the playhead is inside its freeze window,
   *  the canvas renders the decoded frozen frame as a Skia overlay on top
   *  of the (paused) native video player — a truthful freeze preview. */
  activeClip?: ProjectedClip | null;
  /** Optional ref that the canvas populates with the active video layer's
   *  expo-video player instance. The parent can use this to issue imperative
   *  seek / play / pause / rate commands (e.g. from a PlaybackClock video
   *  adapter). Only the first (primary) video layer on the current page
   *  populates the ref — a poster page has at most one media layer. */
  videoPlayerRef?: React.MutableRefObject<VideoPlayerRef | null>;
  /** Shared value that the canvas sets to 1 during an active layer
   *  manipulation gesture (pan/pinch/rotate) and 0 when idle. The parent
   *  can drive chrome-recedes-during-manipulation from this value. */
  manipulationActiveSV?: SharedValue<number>;
  /** Mirrors manipulation state to React-owned chrome so hit testing changes
   *  in the same gesture lifecycle as the Reanimated fade. */
  onManipulationChange?: (active: boolean) => void;
  /** Shared value the canvas sets to 1 while the actively dragged layer's
   *  center is inside the bottom trash zone, 0 when outside/idle. The parent
   *  renders the TrashZone overlay driven by this value. */
  isInTrashZoneSV?: SharedValue<number>;
  /** Fires when the dragged layer's center enters the trash zone (with the
   *  layer id). Used by the parent to trigger a medium haptic. */
  onTrashZoneEnter?: (layerId: string) => void;
}

export function CreatorCanvas({
  document,
  page,
  canvasWidth,
  canvasHeight,
  mode,
  selectedLayerId,
  selectedLayerIds,
  onLayerPress,
  onCanvasPress,
  onCanvasLongPress,
  onCanvasLongPressEnd,
  compareOriginal,
  onLayerTransformChange,
  onLayerDoubleTap,
  onLayerLongPress,
  onMultiDragStart,
  onMultiDragCommit,
  onLayerDuplicate,
  onLayerDelete,
  onLayerReorder,
  onLayerToggleLock,
  showSafeZone,
  safeZoneTop = 0,
  safeZoneBottom = 0,
  playbackClock = null,
  currentTimeMs,
  activeClip,
  videoPlayerRef,
  manipulationActiveSV,
  onManipulationChange,
  isInTrashZoneSV,
  onTrashZoneEnter }: CreatorCanvasProps) {
  const { canvas } = document;
  // Memoize the visible+sorted layer list so its reference is stable across
  // renders when `page` hasn't changed. Without this, getVisibleLayersSorted
  // returns a fresh array every render, which would force every memoised
  // child (LayerRenderer is React.memo) to re-render and re-allocate.
  const visibleLayers = useMemo(
    () => getVisibleLayersSorted(page),
    [page],
  );
  // Pre-compute the sibling set for every layer once per visibleLayers
  // change, instead of filtering inside the .map() (which allocated N
  // arrays of size N-1 on every render). The map is keyed by layer id so
  // each LayerRenderer receives a stable siblingLayers reference until the
  // page's visible layer set actually changes.
  const siblingLayersByLayerId = useMemo(() => {
    const map = new Map<string, CreatorLayer[]>();
    for (const layer of visibleLayers) {
      map.set(
        layer.id,
        visibleLayers.filter((l) => l.id !== layer.id),
      );
    }
    return map;
  }, [visibleLayers]);
  const { colors } = useAppTheme();
  const isEmpty = visibleLayers.length === 0;

  // ── Multi-select drag channel (UI thread) ────────────────────────
  // The dragged layer writes its pixel delta here every frame; selected
  // peer layers follow it inside their own useAnimatedStyle. This keeps
  // multi-drag at 60fps with zero JS bridge crossings — the old path
  // re-rendered every selected layer via React state on every move event.
  const multiDragDX = useSharedValue(0);
  const multiDragDY = useSharedValue(0);
  const multiDragActive = useSharedValue(0);
  const multiDragOwner = useSharedValue('');
  const multiDragEpoch = useSharedValue(0);
  const multiDrag = useMemo<MultiDragChannel>(
    () => ({
      dx: multiDragDX,
      dy: multiDragDY,
      active: multiDragActive,
      owner: multiDragOwner,
      epoch: multiDragEpoch,
    }),
    [multiDragDX, multiDragDY, multiDragActive, multiDragOwner, multiDragEpoch],
  );
  // Registry of each multi-selected layer's position shared values. On
  // multi-drag commit the owner writes every peer's committed position
  // into its SVs before releasing the shared delta — the swap is atomic
  // on the UI thread, so peers never flash at start or 2× offset.
  const layerPosSVs = useRef<LayerPositionRegistry>({});

  // Canvas-level alignment guide overlay. Guides are computed per dragged
  // layer (canvas-space pixel positions) but must render at stage level —
  // inside the layer's transformed view they would be displaced, rotated
  // and clipped by the layer's own geometry. Layer renderers push guide
  // state here; null = hidden.
  const [guideOverlay, setGuideOverlay] = useState<{
    vertical: number[];
    horizontal: number[];
    center: boolean;
  } | null>(null);
  const handleGuidesChange = useCallback(
    (g: { vertical: number[]; horizontal: number[]; center: boolean } | null) => {
      setGuideOverlay(g);
    },
    [],
  );
  // The canvas evaluates the scene once per render through the pure
  // evaluateScene function. The resolved scene carries per-layer effect
  // graphs, transforms, and the Skia-video-frame gating decision. Layer
  // renderers consume the resolved data instead of re-deriving it, so
  // edit / preview / viewer / thumbnail / export all share one evaluator.
  //
  // The render profile is derived from `mode`: edit/preview use the editor
  // column, view uses the viewer column. The profile gates capabilities —
  // e.g. skiaVideoFrames is only live when the registry says so for the
  // active column AND the platform meets Android API 26+.
  const renderProfileId: RenderProfileId = mode === 'view' ? 'viewer' : mode;
  const renderProfile: RenderProfile = useMemo(
    () => getRenderProfile(renderProfileId),
    [renderProfileId],
  );
  // Two time bases: `timeRange` and adjustment-layer windows are stored
  // in ABSOLUTE timeline ms (TimelineProjector contract), while keyframes
  // are authored in clip-relative ms. evaluateScene needs both — the
  // absolute clock for temporal visibility, clip time for interpolation.
  // activeClip is null for single-page/legacy callers, where currentTimeMs
  // is already page-relative.
  const clipTimeMs = activeClip
    ? Math.max(0, Math.min((currentTimeMs ?? 0) - activeClip.timelineStartMs, activeClip.durationMs))
    : currentTimeMs;
  const resolvedScene: ResolvedScene = useMemo(
    () =>
      evaluateScene({
        document,
        page,
        timeMs: currentTimeMs,
        clipTimeMs,
        viewport: { width: canvasWidth, height: canvasHeight },
        profile: renderProfile,
        compareOriginal }),
    [document, page, currentTimeMs, clipTimeMs, canvasWidth, canvasHeight, renderProfile, compareOriginal],
  );
  // Lookup: layerId → resolved layer, so LayerRenderer/MediaLayerContent
  // can read their effect graph and Skia-video gating without re-evaluating.
  const resolvedByLayerId = useMemo(() => {
    const map = new Map<string, ResolvedLayer>();
    for (const rl of resolvedScene.layers) map.set(rl.layer.id, rl);
    return map;
  }, [resolvedScene]);

  // Track whether a compare-to-original long-press is active so onPressOut
  // only fires the end callback when a compare was actually in progress
  // (not on a regular tap release).
  const comparingRef = React.useRef(false);

  const renderBackground = () => {
    // When a full-bleed media layer is present AND the background is still
    // the factory default (no user customisation), skip the background fill.
    // The media IS the canvas surface — edits land directly on it, not on
    // an intermediate card. A user-customised background (gradient, image,
    // non-default color) is still rendered — the user chose it.
    if (hasFullBleedMedia(page) && isDefaultBackground(canvas.background, document.type)) {
      return null;
    }
    if (canvas.background.type === 'color') {
      // 'transparent' is a valid RN color — renders nothing, lets the
      // workspace/screen background show through (correct for letterboxed
      // media in 'contain' mode).
      return <View style={[StyleSheet.absoluteFill, { backgroundColor: canvas.background.value }]} />;
    }
    if (canvas.background.type === 'gradient' && canvas.background.secondaryValue) {
      return (
        <LinearGradient
          colors={[canvas.background.value, canvas.background.secondaryValue]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      );
    }
    if (canvas.background.type === 'image' && canvas.background.value) {
      return (
        <ExpoImage
          source={{ uri: canvas.background.value }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={canvas.background.imageBlur ?? 0}
          cachePolicy="memory-disk"
        />
      );
    }
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt }]} />;
  };

  // Canvas borderRadius: Radius.none in edit mode (the canvas IS the stage),
  // rounded in view/preview mode (thumbnails, publish preview).
  const canvasRadius = mode === 'edit' ? 0 : Radius.lg;

  return (
    <GestureHandlerRootView
      style={[
        styles.canvas,
        {
          width: canvasWidth,
          height: canvasHeight,
          borderRadius: canvasRadius },
      ]}
      accessibilityLabel={getCanvasLabel(visibleLayers.length, mode)}
      accessibilityRole="image"
      accessibilityHint="Use custom actions to select the next, previous, top, or bottom layer"
      accessibilityActions={CANVAS_ACCESSIBILITY_ACTIONS}
      onAccessibilityAction={(event) => {
        const actionName = (event as { actionName?: string }).actionName;
        if (actionName === 'selectNextLayer' && onLayerPress) {
          const next = visibleLayers.find((l) => l.id !== selectedLayerId);
          if (next) onLayerPress(next.id);
        } else if (actionName === 'selectPreviousLayer' && onLayerPress) {
          const prev = [...visibleLayers].reverse().find((l) => l.id !== selectedLayerId);
          if (prev) onLayerPress(prev.id);
        } else if (actionName === 'selectTopLayer' && onLayerPress) {
          const top = visibleLayers[visibleLayers.length - 1];
          if (top) onLayerPress(top.id);
        } else if (actionName === 'selectBottomLayer' && onLayerPress) {
          const bottom = visibleLayers[0];
          if (bottom) onLayerPress(bottom.id);
        }
      }}
    >
      {renderBackground()}

      {mode === 'edit' && (
        <Pressable
          style={styles.backgroundPressLayer}
          onPress={onCanvasPress}
          onLongPress={() => {
            if (onCanvasLongPress) {
              comparingRef.current = true;
              onCanvasLongPress();
            }
          }}
          onPressOut={() => {
            // If a compare-to-original long-press is active, end it on touch-up.
            if (comparingRef.current) {
              comparingRef.current = false;
              onCanvasLongPressEnd?.();
            }
          }}
          delayLongPress={300}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Canvas background, tap to deselect, long-press to compare original"
          accessibilityHint="Taps the canvas to deselect the current layer. Long-press to temporarily hide effects and compare against the original."
          accessibilityRole="button"
        />
      )}

      {visibleLayers.map((layer) => {
        const isInMultiSelect = !!(selectedLayerIds && selectedLayerIds.length > 0);
        const isSelected = isInMultiSelect
          ? selectedLayerIds.includes(layer.id)
          : selectedLayerId === layer.id;
        const isPrimarySelected = isInMultiSelect
          ? selectedLayerIds[0] === layer.id
          : false;
        const multiSelectIndex = isInMultiSelect
          ? selectedLayerIds.indexOf(layer.id) + 1
          : 0;
        return (
        <LayerRenderer
          key={layer.id}
          layer={layer}
          siblingLayers={siblingLayersByLayerId.get(layer.id) ?? EMPTY_LAYERS}
          documentType={document.type}
          resolvedLayer={resolvedByLayerId.get(layer.id)}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          mode={mode}
          isSelected={isSelected}
          isPrimarySelected={isPrimarySelected}
          isMultiSelectActive={isInMultiSelect && isSelected && (selectedLayerIds?.length ?? 0) > 1}
          multiSelectIndex={multiSelectIndex}
          onPress={onLayerPress}
          onTransformChange={onLayerTransformChange}
          onDoubleTap={onLayerDoubleTap}
          onLongPress={onLayerLongPress}
          onMultiDragStart={onMultiDragStart}
          onMultiDragCommit={onMultiDragCommit}
          multiDrag={multiDrag}
          layerPosSVs={layerPosSVs}
          onDuplicate={onLayerDuplicate}
          onDelete={onLayerDelete}
          onReorder={onLayerReorder}
          onToggleLock={onLayerToggleLock}
          playbackClock={playbackClock}
          currentTimeMs={currentTimeMs}
          clipTimeMs={clipTimeMs}
          activeClip={activeClip}
          videoPlayerRef={videoPlayerRef}
          manipulationActiveSV={manipulationActiveSV}
          onManipulationChange={onManipulationChange}
          onGuidesChange={handleGuidesChange}
          isInTrashZoneSV={isInTrashZoneSV}
          onTrashZoneEnter={onTrashZoneEnter}
          compareOriginal={compareOriginal}
        />
        );
      })}

      {/* Empty canvas state — guides the user to start creating */}
      {mode === 'edit' && isEmpty && (
        <EmptyCanvasState colors={colors} />
      )}

      {/* Safe zone overlay — shared visual guide for reserved top/bottom
          UI areas. Rendered when the parent passes showSafeZone (manual
          toggle under More, or auto-while-dragging). pointerEvents none. */}
      {mode === 'edit' && showSafeZone && (
        <SafeZoneOverlay
          visible={showSafeZone}
          topHeight={safeZoneTop}
          bottomHeight={safeZoneBottom}
        />
      )}

      {/* Alignment guides — canvas-space lines, rendered at stage level so
          they are not displaced/rotated by the dragged layer's transform. */}
      {mode === 'edit' && guideOverlay && (
        <AlignmentGuides
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          colors={colors}
          smartGuides={{ vertical: guideOverlay.vertical, horizontal: guideOverlay.horizontal }}
          centerGuideVisible={guideOverlay.center}
        />
      )}
    </GestureHandlerRootView>
  );
}

// ── Empty canvas state ─────────────────────────────────────────────
// Confident typography placed directly on the canvas surface.
function EmptyCanvasState({ colors }: { colors: ReturnType<typeof useAppTheme>['colors'] }) {
  return (
    <View style={styles.emptyState} pointerEvents="none" accessibilityLabel="Empty canvas, add media to begin" accessibilityRole="text" accessibilityHint="Shown when the canvas has no layers">
      <Text
        style={[
          styles.emptyStateTitle,
          { color: colors.textSecondary },
        ]}
      >
        Add media to begin
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    overflow: 'hidden',
    position: 'relative' },
  backgroundPressLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 0 },
  emptyState: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.xl },
  emptyStateTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    textAlign: 'center' } });
