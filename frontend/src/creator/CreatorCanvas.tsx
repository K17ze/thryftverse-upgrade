import React, { useCallback, useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, type ViewStyle, type TextStyle } from 'react-native';
import { CachedImage } from '../components/CachedImage';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  withSpring,
  cancelAnimation,
  Easing,
  type SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Canvas as SkiaCanvas,
  Path as SkiaPath,
  Skia,
  Image as SkiaImage,
  ColorMatrix as SkiaColorMatrix,
  Mask as SkiaMask,
  useImage as useSkiaImage,
  useVideo as useSkiaVideo,
  Fit as SkiaFit,
  fitbox as skiaFitbox,
  rect as skiaRect } from '@shopify/react-native-skia';
import { Space, Radius, Typography, IconGrammar, Stroke, Elevation} from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Motion } from '../theme/motionTokens';
import { Video, ResizeMode } from '../components/compat/Video';
import type { CreatorLayer, CreatorDocument, CreatorPage } from './composition';
import { getVisibleLayersSorted, hasFullBleedMedia, isDefaultBackground } from './composition';
// Scene evaluator + render profiles — the single pure owner of scene state
// (AGENTS.md §6.3). The canvas evaluates the scene once per render and
// passes resolved per-layer data (effect graph, Skia-video-frame gating)
// down to the layer renderers.
import {
  evaluateScene,
  type ResolvedLayer,
  type ResolvedScene } from './engine/evaluateScene';
import {
  getRenderProfile,
  type RenderProfile,
  type RenderProfileId } from './engine/renderProfiles';
// Playback pipeline — single clock, keyframe evaluator, effect evaluator
import type { PlaybackClock } from './core/playback/PlaybackClock';
import { evaluateKeyframes } from './core/playback/KeyframeEvaluator';
import {
  evaluateCompositionEffectStack,
  multiplyMatrix,
  type EvaluatedEffect } from './core/playback/EffectEvaluator';
import {
  getActiveAdjustmentLayers,
  applyAdjustmentLayersToClip } from './core/playback/AdjustmentLayerEvaluator';
import { getCanvasLabel, CANVAS_ACCESSIBILITY_ACTIONS } from './core/a11y/CanvasAccessibilityLabels';
// Shared layer primitives — single source of truth for accent colours,
// context menus, and gesture handling across poster + creator surfaces.
import {
  getLayerAccentColor,
  getLayerCategoryLabel } from '../components/poster/shared/layerAccents';
import { ContextMenu, type ContextMenuAction } from '../components/poster/shared/ContextMenu';
import { SafeZoneOverlay } from './surfaces/SafeZoneOverlay';
import { GestureBadge } from './surfaces/GestureBadge';

const RAD_TO_DEG = 180 / Math.PI;

function normaliseDegrees(deg: number): number {
  let result = deg % 360;
  if (result < 0) result += 360;
  return result;
}

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
  onMultiDragStart?: () => void;
  onMultiDragUpdate?: (deltaXNorm: number, deltaYNorm: number) => void;
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
  onMultiDragUpdate,
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
  manipulationActiveSV,
  onManipulationChange,
  isInTrashZoneSV,
  onTrashZoneEnter }: CreatorCanvasProps) {
  const { canvas } = document;
  const visibleLayers = getVisibleLayersSorted(page);
  const { colors } = useAppTheme();
  const isEmpty = visibleLayers.length === 0;

  // ── Scene evaluation pipeline (AGENTS.md §6.3) ───────────────────
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
  const resolvedScene: ResolvedScene = useMemo(
    () =>
      evaluateScene({
        document,
        page,
        timeMs: currentTimeMs,
        viewport: { width: canvasWidth, height: canvasHeight },
        profile: renderProfile,
        compareOriginal }),
    [document, page, currentTimeMs, canvasWidth, canvasHeight, renderProfile, compareOriginal],
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

  // Context menu state — long-press opens an ActionSheet with layer actions.
  // The per-layer gesture composition calls onContextMenu(layer) to set this;
  // the shared <ContextMenu> sheet is then driven by `visible`.
  const [contextMenuLayer, setContextMenuLayer] = useState<CreatorLayer | null>(null);

  // Build the context-menu action list from the active layer + callbacks.
  // Mirrors the previous inline LayerContextMenu action set (duplicate,
  // front/back, lock/unlock, flip, delete) but via the shared ContextMenu API.
  const contextMenuActions = useMemo<ContextMenuAction[]>(() => {
    if (!contextMenuLayer) return [];
    const id = contextMenuLayer.id;
    const isLocked = !!contextMenuLayer.locked;
    const actions: ContextMenuAction[] = [];
    if (onLayerDuplicate) {
      actions.push({ id: 'duplicate', label: 'Duplicate', icon: 'copy-outline', onPress: () => onLayerDuplicate(id) });
    }
    if (onLayerReorder) {
      actions.push({ id: 'front', label: 'Front', icon: 'arrow-up-circle-outline', onPress: () => onLayerReorder(id, 'front') });
      actions.push({ id: 'back', label: 'Back', icon: 'arrow-down-circle-outline', onPress: () => onLayerReorder(id, 'back') });
    }
    if (onLayerToggleLock) {
      actions.push({
        id: 'lock',
        label: isLocked ? 'Unlock' : 'Lock',
        icon: isLocked ? 'lock-open-outline' : 'lock-closed-outline',
        onPress: () => onLayerToggleLock(id) });
    }
    // Flip: reset rotation to 0 (2D flip equivalent)
    actions.push({
      id: 'flip',
      label: 'Flip',
      icon: 'swap-horizontal-outline',
      onPress: () => onLayerTransformChange?.(id, { rotation: 0 }) });
    if (onLayerDelete) {
      actions.push({ id: 'delete', label: 'Delete', icon: 'trash-outline', danger: true, onPress: () => onLayerDelete(id) });
    }
    return actions;
  }, [contextMenuLayer, onLayerDuplicate, onLayerDelete, onLayerReorder, onLayerToggleLock, onLayerTransformChange]);

  const contextMenuTitle = contextMenuLayer ? getLayerCategoryLabel(contextMenuLayer.type) : 'Options';
  const contextMenuAccent = contextMenuLayer ? getLayerAccentColor(contextMenuLayer.type) : undefined;

  const renderBackground = () => {
    // When a full-bleed media layer is present AND the background is still
    // the factory default (no user customisation), skip the background fill.
    // The media IS the canvas surface — edits land directly on it, not on
    // an intermediate card. This is the Snapchat/Instagram architecture:
    // SCREEN = MEDIA, edits are siblings on the media, chrome floats over.
    // A user-customised background (gradient, image, non-default color) is
    // still rendered — the user chose it.
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
        return (
        <LayerRenderer
          key={layer.id}
          layer={layer}
          siblingLayers={visibleLayers.filter((l) => l.id !== layer.id)}
          resolvedLayer={resolvedByLayerId.get(layer.id)}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          mode={mode}
          isSelected={isSelected}
          isPrimarySelected={isPrimarySelected}
          isMultiSelectActive={isInMultiSelect && isSelected && (selectedLayerIds?.length ?? 0) > 1}
          onPress={onLayerPress}
          onTransformChange={onLayerTransformChange}
          onDoubleTap={onLayerDoubleTap}
          onLongPress={onLayerLongPress}
          onMultiDragStart={onMultiDragStart}
          onMultiDragUpdate={onMultiDragUpdate}
          onMultiDragCommit={onMultiDragCommit}
          onContextMenu={(l) => setContextMenuLayer(l)}
          onDuplicate={onLayerDuplicate}
          onDelete={onLayerDelete}
          onReorder={onLayerReorder}
          onToggleLock={onLayerToggleLock}
          playbackClock={playbackClock}
          currentTimeMs={currentTimeMs}
          manipulationActiveSV={manipulationActiveSV}
          onManipulationChange={onManipulationChange}
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

      {/* Long-press context menu — shared ContextMenu sheet with layer actions.
          The per-layer gesture composition sets contextMenuLayer on long-press;
          the shared <ContextMenu> renders the spring-entrance sheet driven by
          `visible`. `enabled={false}` disables the wrapper's own long-press
          (each LayerRenderer manages its own long-press inside its gesture race). */}
      {mode === 'edit' && (
        <ContextMenu
          actions={contextMenuActions}
          visible={!!contextMenuLayer}
          onDismiss={() => setContextMenuLayer(null)}
          onOpen={() => setContextMenuLayer(contextMenuLayer)}
          enabled={false}
          title={contextMenuTitle}
          accentColor={contextMenuAccent}
        >
          <View />
        </ContextMenu>
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
    </GestureHandlerRootView>
  );
}

// ── Empty canvas state ─────────────────────────────────────────────
// Premium empty state with layered icon, title, and guidance.
// Not just a pulsing icon — a proper designed empty surface.
function EmptyCanvasState({ colors }: { colors: ReturnType<typeof useAppTheme>['colors'] }) {
  const reducedMotion = useReducedMotion();
  const scaleSV = useSharedValue(reducedMotion ? 1 : 0.9);
  const opacitySV = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      // WCAG 2.2 §2.3.3 — instant, no animation when Reduce Motion is on
      cancelAnimation(scaleSV);
      cancelAnimation(opacitySV);
      scaleSV.value = 1;
      opacitySV.value = 1;
      return;
    }
    // One-time entrance: fade in + scale from 0.9 → 1.0, then stop.
    // No continuous pulsing (AGENTS.md §17).
    scaleSV.value = withTiming(1, { duration: Motion.duration.slower, easing: Easing.out(Easing.cubic) });
    opacitySV.value = withTiming(1, { duration: Motion.duration.slow, easing: Easing.out(Easing.ease) });
    return () => {
      cancelAnimation(scaleSV);
      cancelAnimation(opacitySV);
    };
  }, [scaleSV, opacitySV, reducedMotion]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleSV.value }],
    opacity: opacitySV.value }));

  return (
    <View style={styles.emptyState} pointerEvents="none" accessibilityLabel="Empty canvas, tap a tool to start" accessibilityRole="text">
      <View style={styles.emptyStateIconWrap}>
        <Reanimated.View style={animatedIconStyle}>
          <Ionicons name="add-circle-outline" size={IconGrammar.hero} color="rgba(255,255,255,0.4)" aria-hidden={true} />
        </Reanimated.View>
      </View>
      <Text style={styles.emptyStateTitle}>
        Tap a tool to start
      </Text>
      <Text style={styles.emptyStateSubtitle}>
        Media · Text · Product · Elements · Layout
      </Text>
    </View>
  );
}

interface LayerRendererProps {
  layer: CreatorLayer;
  siblingLayers: CreatorLayer[];
  /** Resolved scene data for this layer from evaluateScene. Carries the
   *  effect graph and Skia-video-frame gating decision so the renderer
   *  does not re-derive them. Optional — absent when the layer was filtered
   *  out by the evaluator (e.g. temporally invisible in a static context). */
  resolvedLayer?: ResolvedLayer;
  canvasWidth: number;
  canvasHeight: number;
  mode: 'edit' | 'preview' | 'view';
  isSelected: boolean;
  /** True for the first (primary) layer in a multi-select set. */
  isPrimarySelected?: boolean;
  /** True when this layer is selected AND multiple layers are selected. */
  isMultiSelectActive?: boolean;
  onPress?: (layerId: string) => void;
  onTransformChange?: (layerId: string, updates: Partial<CreatorLayer>) => void;
  onDoubleTap?: (layerId: string) => void;
  onLongPress?: (layerId: string) => void;
  onMultiDragStart?: () => void;
  onMultiDragUpdate?: (deltaXNorm: number, deltaYNorm: number) => void;
  onMultiDragCommit?: (deltaXNorm: number, deltaYNorm: number) => void;
  onContextMenu?: (layer: CreatorLayer) => void;
  onDuplicate?: (layerId: string) => void;
  onDelete?: (layerId: string) => void;
  onReorder?: (layerId: string, direction: 'front' | 'back') => void;
  onToggleLock?: (layerId: string) => void;
  /** Playback clock — drives temporal visibility, keyframes, video play/pause/seek. */
  playbackClock?: PlaybackClock | null;
  /** Current playback time (ms) — used for temporal visibility and keyframe evaluation. */
  currentTimeMs?: number;
  /** Shared value set to 1 during active gesture, 0 when idle. */
  manipulationActiveSV?: SharedValue<number>;
  onManipulationChange?: (active: boolean) => void;
  /** Shared value set to 1 while the dragged layer is in the trash zone. */
  isInTrashZoneSV?: SharedValue<number>;
  /** Fires when the dragged layer's center enters the trash zone. */
  onTrashZoneEnter?: (layerId: string) => void;
  /** When true, media layers render without effects (compare-to-original). */
  compareOriginal?: boolean;
}

const SNAP_THRESHOLD = 0.02;
const SAFE_MARGIN = 0.05;
const ROTATION_SNAP_DEG = 15;
// Drag-to-trash: normalized y (0–1) past which the bottom trash zone
// activates. 0.85 = lower 15% of the canvas (Snapchat/Instagram pattern).
const TRASH_ZONE_THRESHOLD = 0.85;

const LayerRenderer = React.memo(function LayerRenderer({
  layer,
  siblingLayers,
  resolvedLayer,
  canvasWidth,
  canvasHeight,
  mode,
  isSelected,
  isPrimarySelected,
  isMultiSelectActive,
  onPress,
  onTransformChange,
  onDoubleTap,
  onLongPress,
  onMultiDragStart,
  onMultiDragUpdate,
  onMultiDragCommit,
  onContextMenu,
  onDelete,
  playbackClock,
  currentTimeMs,
  manipulationActiveSV,
  onManipulationChange,
  isInTrashZoneSV,
  onTrashZoneEnter,
  compareOriginal }: LayerRendererProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const accentColor = getLayerAccentColor(layer.type);
  const translateX = useSharedValue(layer.x * canvasWidth);
  const translateY = useSharedValue(layer.y * canvasHeight);
  const scaleSV = useSharedValue(layer.scale);
  const rotationSV = useSharedValue(layer.rotation);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);
  // During-drag: show basic center guides only. On drag end: compute smart guides.
  const [showGuides, setShowGuides] = useState(false);
  // Smart alignment guides — vertical/horizontal pixel positions where the
  // dragged layer's edges/centre align with a sibling's edges/centre.
  const [smartGuides, setSmartGuides] = useState<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] });
  // Center guide visibility — only show center lines when the layer's center
  // is within 8pt of the canvas center (Canva/Figma/Instagram Stories pattern)
  const [centerGuideVisible, setCenterGuideVisible] = useState(false);
  // Guide appearance animation — spring scale + fade
  const guideOpacity = useSharedValue(0);
  // Throttle: last position at which smart guides were computed, to avoid
  // running the O(n²) computation + JS bridge hop on every animation frame.
  const lastGuideX = useSharedValue(0);
  const lastGuideY = useSharedValue(0);
  const GUIDE_THROTTLE_PX = 2;

  // Selection animation: border + handles fade/scale in.
  // Per §5.14: replace decorative scale-from-0.8 spring with a quiet timing
  // transition. Selection is a state change, not direct manipulation — use
  // ease-out timing instead of spring bounce.
  const selectionOpacity = useSharedValue(0);
  const handleScale = useSharedValue(0.8);
  // Gesture lift shadow — increases during active gesture
  const liftSV = useSharedValue(0);
  // Trash-zone drag-to-delete — tracks whether the dragged layer's center
  // was inside the trash zone on the previous update, so we only fire the
  // enter haptic / callback on the rising edge (not every frame).
  const wasInTrashZoneSV = useSharedValue(0);

  useEffect(() => {
    if (isSelected) {
      selectionOpacity.value = reducedMotion ? withTiming(1, { duration: 0 }) : withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
      handleScale.value = reducedMotion ? withTiming(1, { duration: 0 }) : withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
      if (!reducedMotion) haptic.light();
    } else {
      selectionOpacity.value = reducedMotion ? withTiming(0, { duration: 0 }) : withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) });
      handleScale.value = reducedMotion ? withTiming(0.8, { duration: 0 }) : withTiming(0.8, { duration: 180, easing: Easing.in(Easing.cubic) });
      if (!reducedMotion) haptic.light();
    }
  }, [isSelected, selectionOpacity, handleScale, reducedMotion, haptic]);

  // Gesture feedback badges (scale % and rotation angle)
  const [gestureBadge, setGestureBadge] = useState<string | null>(null);

  // Sync shared values when document state changes (undo/redo/draft load/page change).
  // Per §5.14: spring is reserved for direct manipulation, not every state sync.
  // These are programmatic position updates (undo/redo, draft load, page change),
  // not user gestures — use a quiet timing transition instead of spring bounce.
  useEffect(() => {
    if (reducedMotion) {
      // WCAG 2.2 §2.3.3 — instant snap, no animation when Reduce Motion is on
      translateX.value = withTiming(layer.x * canvasWidth, { duration: 0 });
      translateY.value = withTiming(layer.y * canvasHeight, { duration: 0 });
      scaleSV.value = withTiming(layer.scale, { duration: 0 });
      rotationSV.value = withTiming(normaliseDegrees(layer.rotation), { duration: 0 });
    } else {
      const settle = { duration: 250, easing: Easing.out(Easing.cubic) };
      translateX.value = withTiming(layer.x * canvasWidth, settle);
      translateY.value = withTiming(layer.y * canvasHeight, settle);
      scaleSV.value = withTiming(layer.scale, settle);
      rotationSV.value = withTiming(normaliseDegrees(layer.rotation), settle);
    }
  }, [layer.x, layer.y, layer.scale, layer.rotation, canvasWidth, canvasHeight, reducedMotion]);

  const handlePress = useCallback(() => {
    if (mode === 'edit' && onPress) {
      onPress(layer.id);
    }
  }, [mode, onPress, layer.id]);

  const handleDoubleTap = useCallback(() => {
    if (mode === 'edit' && onDoubleTap) {
      onDoubleTap(layer.id);
    }
  }, [mode, onDoubleTap, layer.id]);

  const handleLongPress = useCallback(() => {
    if (mode === 'edit') {
      // When onLongPress is provided, long-press enters multi-select mode
      // (the parent's onLongPress handler) and the context menu is suppressed
      // to avoid a conflicting double-sheet. When onLongPress is absent,
      // long-press falls back to the context menu.
      if (onLongPress) {
        onLongPress(layer.id);
      } else if (onContextMenu) {
        onContextMenu(layer);
      }
    }
  }, [mode, onLongPress, onContextMenu, layer]);

  const handlePositionCommit = useCallback((finalX: number, finalY: number) => {
    let normX = finalX / canvasWidth;
    let normY = finalY / canvasHeight;
    let snappedX = false;
    let snappedY = false;

    // Snapping to center
    if (Math.abs(normX - 0.5) < SNAP_THRESHOLD) { normX = 0.5; snappedX = true; }
    if (Math.abs(normY - 0.5) < SNAP_THRESHOLD) { normY = 0.5; snappedY = true; }

    // Safe-zone clamping accounting for layer width, height and scale
    const halfW = (layer.width * layer.scale) / 2;
    const halfH = (layer.height * layer.scale) / 2;
    const minX = Math.max(SAFE_MARGIN, halfW);
    const maxX = Math.min(1 - SAFE_MARGIN, 1 - halfW);
    const minY = Math.max(SAFE_MARGIN, halfH);
    const maxY = Math.min(1 - SAFE_MARGIN, 1 - halfH);
    normX = Math.max(minX, Math.min(maxX, normX));
    normY = Math.max(minY, Math.min(maxY, normY));

    // Spring settle for natural position commit (spring physics)
    translateX.value = withSpring(normX * canvasWidth, spring.settle);
    translateY.value = withSpring(normY * canvasHeight, spring.settle);

    if (snappedX || snappedY) haptic.light();
    setShowGuides(false);
    setSmartGuides({ vertical: [], horizontal: [] });
    setCenterGuideVisible(false);

    onTransformChange?.(layer.id, { x: normX, y: normY });
  }, [canvasWidth, canvasHeight, layer.id, layer.width, layer.height, layer.scale, onTransformChange, translateX, translateY, reducedMotion, haptic]);

  const handleTransformCommit = useCallback((finalScale: number, finalRotation: number) => {
    const clampedScale = Math.max(0.2, Math.min(5, finalScale));
    const normalisedRotation = normaliseDegrees(finalRotation);

    // Snap rotation to 15-degree increments if close
    let snappedRotation = normalisedRotation;
    const nearestSnap = Math.round(normalisedRotation / ROTATION_SNAP_DEG) * ROTATION_SNAP_DEG;
    if (Math.abs(normalisedRotation - nearestSnap) < 5) {
      snappedRotation = nearestSnap % 360;
      haptic.light();
    }

    // Spring settle for natural transform commit (spring physics)
    scaleSV.value = withSpring(clampedScale, spring.settle);
    rotationSV.value = withSpring(snappedRotation, spring.settle);
    onTransformChange?.(layer.id, { scale: clampedScale, rotation: snappedRotation });
  }, [layer.id, onTransformChange, scaleSV, rotationSV, reducedMotion, haptic]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(mode === 'edit' && !layer.locked)
        .minDistance(5)
        .onStart(() => {
          startX.value = translateX.value;
          startY.value = translateY.value;
          if (manipulationActiveSV) manipulationActiveSV.value = 1;
          if (onManipulationChange) runOnJS(onManipulationChange)(true);
          // Reset trash-zone tracking at the start of every drag.
          wasInTrashZoneSV.value = 0;
          if (isInTrashZoneSV) isInTrashZoneSV.value = 0;
          runOnJS(handlePress)();
          runOnJS(setShowGuides)(true);
          if (isMultiSelectActive && onMultiDragStart) {
            runOnJS(onMultiDragStart)();
          }
        })
        .onUpdate((e) => {
          translateX.value = startX.value + e.translationX;
          translateY.value = startY.value + e.translationY;
          if (isMultiSelectActive && onMultiDragUpdate) {
            runOnJS(onMultiDragUpdate)(e.translationX / canvasWidth, e.translationY / canvasHeight);
          } else if (isInTrashZoneSV) {
            // Drag-to-trash (Snapchat/Instagram pattern): when the layer's
            // center passes the bottom threshold, mark it as inside the
            // trash zone. Rising edge fires the enter haptic + parent
            // callback; falling edge clears the highlight.
            const normY = (startY.value + e.translationY) / canvasHeight;
            const inside = normY > TRASH_ZONE_THRESHOLD ? 1 : 0;
            if (inside !== wasInTrashZoneSV.value) {
              wasInTrashZoneSV.value = inside;
              isInTrashZoneSV.value = inside;
              if (inside === 1 && onTrashZoneEnter) {
                runOnJS(onTrashZoneEnter)(layer.id);
              }
            }
          }
        })
        .onEnd((e) => {
          // Capture trash-zone state before resetting.
          const wasInTrash = wasInTrashZoneSV.value === 1;
          wasInTrashZoneSV.value = 0;
          if (isInTrashZoneSV) isInTrashZoneSV.value = 0;
          // Drag-to-trash commit: if the layer was released inside the
          // trash zone, delete it instead of committing the position.
          if (!isMultiSelectActive && wasInTrash && onDelete) {
            runOnJS(haptic.heavy)();
            runOnJS(onDelete)(layer.id);
            runOnJS(setShowGuides)(false);
            runOnJS(setSmartGuides)({ vertical: [], horizontal: [] });
            runOnJS(setCenterGuideVisible)(false);
            return;
          }
          if (isMultiSelectActive && onMultiDragCommit) {
            // Multi-select: the parent commits positions for ALL selected
            // layers (including this one) in a single history entry.
            runOnJS(onMultiDragCommit)(e.translationX / canvasWidth, e.translationY / canvasHeight);
            runOnJS(setShowGuides)(false);
            runOnJS(setSmartGuides)({ vertical: [], horizontal: [] });
            runOnJS(setCenterGuideVisible)(false);
          } else {
            const finalX = startX.value + e.translationX;
            const finalY = startY.value + e.translationY;
            runOnJS(handlePositionCommit)(finalX, finalY);
          }
        })
        .onFinalize(() => {
          if (manipulationActiveSV) manipulationActiveSV.value = 0;
          if (onManipulationChange) runOnJS(onManipulationChange)(false);
        }),
    [mode, layer.locked, layer.id, translateX, translateY, startX, startY, onPress, handlePositionCommit, isMultiSelectActive, onMultiDragStart, onMultiDragUpdate, onMultiDragCommit, canvasWidth, canvasHeight, manipulationActiveSV, onManipulationChange, isInTrashZoneSV, onTrashZoneEnter, onDelete, haptic]
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(mode === 'edit' && !layer.locked)
        .onStart(() => {
          startScale.value = scaleSV.value;
          if (manipulationActiveSV) manipulationActiveSV.value = 1;
          if (onManipulationChange) runOnJS(onManipulationChange)(true);
        })
        .onUpdate((e) => {
          scaleSV.value = startScale.value * e.scale;
          runOnJS(setGestureBadge)(`${Math.round(startScale.value * e.scale * 100)}%`);
        })
        .onEnd(() => {
          runOnJS(setGestureBadge)(null);
          runOnJS(handleTransformCommit)(scaleSV.value, rotationSV.value);
        })
        .onFinalize(() => {
          if (manipulationActiveSV) manipulationActiveSV.value = 0;
          if (onManipulationChange) runOnJS(onManipulationChange)(false);
        }),
    [mode, layer.locked, scaleSV, startScale, rotationSV, handleTransformCommit, manipulationActiveSV, onManipulationChange]
  );

  const rotationGesture = useMemo(
    () =>
      Gesture.Rotation()
        .enabled(mode === 'edit' && !layer.locked)
        .onStart(() => {
          startRotation.value = rotationSV.value;
          if (manipulationActiveSV) manipulationActiveSV.value = 1;
          if (onManipulationChange) runOnJS(onManipulationChange)(true);
        })
        .onUpdate((e) => {
          // Convert gesture radians to degrees at the boundary
          rotationSV.value = startRotation.value + e.rotation * RAD_TO_DEG;
          const deg = Math.round(normaliseDegrees(startRotation.value + e.rotation * RAD_TO_DEG));
          runOnJS(setGestureBadge)(`${deg}°`);
        })
        .onEnd(() => {
          runOnJS(setGestureBadge)(null);
          runOnJS(handleTransformCommit)(scaleSV.value, rotationSV.value);
        })
        .onFinalize(() => {
          if (manipulationActiveSV) manipulationActiveSV.value = 0;
          if (onManipulationChange) runOnJS(onManipulationChange)(false);
        }),
    [mode, layer.locked, rotationSV, startRotation, scaleSV, handleTransformCommit, manipulationActiveSV, onManipulationChange]
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(mode === 'edit')
        .onEnd(() => {
          runOnJS(handlePress)();
        }),
    [mode, handlePress]
  );

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(mode === 'edit' && !layer.locked)
        .numberOfTaps(2)
        .onEnd(() => {
          runOnJS(handleDoubleTap)();
        }),
    [mode, layer.locked, handleDoubleTap]
  );

  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .enabled(mode === 'edit')
        .minDuration(400)
        .onEnd(() => {
          runOnJS(handleLongPress)();
        }),
    [mode, handleLongPress]
  );

  // ── Simultaneous gestures (Instagram Stories / Canva pattern) ──
  // Pan, pinch, and rotation all work together simultaneously so the user
  // can drag + resize + rotate a layer in one fluid motion. Tap,
  // double-tap, and long-press race with the transform gestures so they
  // don't fire mid-drag.
  const composedGesture = useMemo(
    () => Gesture.Race(
      Gesture.Simultaneous(panGesture, pinchGesture, rotationGesture),
      doubleTapGesture,
      longPressGesture,
      tapGesture,
    ),
    [panGesture, pinchGesture, rotationGesture, tapGesture, doubleTapGesture, longPressGesture]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const baseWidth = layer.width * canvasWidth;
    const baseHeight = layer.height * canvasHeight;
    const w = baseWidth * scaleSV.value;
    const h = baseHeight * scaleSV.value;
    return {
      position: 'absolute' as const,
      left: translateX.value - w / 2,
      top: translateY.value - h / 2,
      width: w,
      height: h,
      transform: [
        { rotate: `${rotationSV.value}deg` },
      ],
      opacity: effectiveOpacity,
      zIndex: layer.zIndex };
  });

  // ── Temporal visibility & keyframe evaluation ───────────────────
  // When a playback clock is provided, layers with a timeRange are only
  // visible during that time window. Layers with keyframes have their
  // position/scale/rotation/opacity interpolated at the current time.
  const hasPlaybackClock = !!playbackClock;
  const timeMs = currentTimeMs ?? 0;

  // Temporal visibility: if the layer has a timeRange and we have a clock,
  // check whether the current time is within the range.
  const isTemporallyVisible = useMemo(() => {
    if (!hasPlaybackClock) return true;
    if (!layer.timeRange) return true;
    return timeMs >= layer.timeRange.startMs && timeMs < layer.timeRange.endMs;
  }, [hasPlaybackClock, layer.timeRange, timeMs]);

  // Keyframe evaluation: if the layer has keyframes and we have a clock,
  // compute the interpolated values at the current time.
  const keyframeValues = useMemo(() => {
    if (!hasPlaybackClock || !layer.keyframes || layer.keyframes.length === 0) return null;
    const result: Partial<Record<'position' | 'scale' | 'rotation' | 'opacity', number>> = {};
    const props: Array<'position' | 'scale' | 'rotation' | 'opacity'> = ['position', 'scale', 'rotation', 'opacity'];
    for (const prop of props) {
      const val = evaluateKeyframes(layer.keyframes!, timeMs, prop);
      if (val !== null) result[prop] = val;
    }
    return Object.keys(result).length > 0 ? result : null;
  }, [hasPlaybackClock, layer.keyframes, timeMs]);

  // Apply keyframe values to shared values when in playback mode
  useEffect(() => {
    if (!hasPlaybackClock || !keyframeValues) return;
    if (keyframeValues.position !== undefined) {
      // Position keyframes drive the center position (normalized 0-1)
      // The keyframe value is interpreted as a normalized position
      translateX.value = keyframeValues.position * canvasWidth;
    }
    if (keyframeValues.scale !== undefined) {
      scaleSV.value = keyframeValues.scale;
    }
    if (keyframeValues.rotation !== undefined) {
      rotationSV.value = keyframeValues.rotation;
    }
  }, [hasPlaybackClock, keyframeValues, canvasWidth, canvasHeight, translateX, scaleSV, rotationSV]);

  // Compute effective opacity (layer opacity * keyframe opacity * temporal visibility)
  const effectiveOpacity = useMemo(() => {
    let opacity = layer.opacity;
    if (keyframeValues?.opacity !== undefined) {
      opacity *= keyframeValues.opacity;
    }
    if (hasPlaybackClock && !isTemporallyVisible) {
      opacity = 0;
    }
    return opacity;
  }, [layer.opacity, keyframeValues, hasPlaybackClock, isTemporallyVisible]);

  const content = renderLayerContent(layer, layer.width * canvasWidth, layer.height * canvasHeight, playbackClock, currentTimeMs, siblingLayers, compareOriginal, resolvedLayer);

  // Smart alignment guides: while dragging, detect when this layer's
  // left/right/centre aligns with a sibling's left/right/centre (vertical
  // guide) or top/bottom/centre (horizontal guide). Computed on the UI
  // thread from the live translate shared values and committed sibling
  // geometry, then mirrored to JS state for rendering.
  const SMART_GUIDE_THRESHOLD_PX = 4;
  const computeSmartGuides = useCallback(
    (cx: number, cy: number) => {
      const halfW = (layer.width * layer.scale * canvasWidth) / 2;
      const halfH = (layer.height * layer.scale * canvasHeight) / 2;
      const myLeft = cx - halfW;
      const myRight = cx + halfW;
      const myCenterX = cx;
      const myTop = cy - halfH;
      const myBottom = cy + halfH;
      const myCenterY = cy;
      const vertical = new Set<number>();
      const horizontal = new Set<number>();
      for (const sib of siblingLayers) {
        const sHalfW = (sib.width * sib.scale * canvasWidth) / 2;
        const sHalfH = (sib.height * sib.scale * canvasHeight) / 2;
        const sCx = sib.x * canvasWidth;
        const sCy = sib.y * canvasHeight;
        const sLeft = sCx - sHalfW;
        const sRight = sCx + sHalfW;
        const sCenterX = sCx;
        const sTop = sCy - sHalfH;
        const sBottom = sCy + sHalfH;
        const sCenterY = sCy;
        const xCandidates = [myLeft, myRight, myCenterX];
        const xTargets = [sLeft, sRight, sCenterX];
        for (const mc of xCandidates) {
          for (const st of xTargets) {
            if (Math.abs(mc - st) < SMART_GUIDE_THRESHOLD_PX) vertical.add(st);
          }
        }
        const yCandidates = [myTop, myBottom, myCenterY];
        const yTargets = [sTop, sBottom, sCenterY];
        for (const mc of yCandidates) {
          for (const st of yTargets) {
            if (Math.abs(mc - st) < SMART_GUIDE_THRESHOLD_PX) horizontal.add(st);
          }
        }
      }
      setSmartGuides({ vertical: Array.from(vertical), horizontal: Array.from(horizontal) });
      // Center guide: show when the layer's center is within 8pt of canvas center
      const centerThreshold = 8;
      const nearCenterX = Math.abs(cx - canvasWidth / 2) < centerThreshold;
      const nearCenterY = Math.abs(cy - canvasHeight / 2) < centerThreshold;
      setCenterGuideVisible(nearCenterX || nearCenterY);
    },
    [layer.width, layer.height, layer.scale, canvasWidth, canvasHeight, siblingLayers],
  );

  useAnimatedReaction(
    () => ({ x: translateX.value, y: translateY.value }),
    (pos) => {
      if (showGuides) {
        // Throttle: only recompute when the layer has moved more than
        // GUIDE_THROTTLE_PX since the last computation. This avoids running
        // the O(n²) alignment check + JS bridge hop on every animation frame.
        const dx = Math.abs(pos.x - lastGuideX.value);
        const dy = Math.abs(pos.y - lastGuideY.value);
        if (dx >= GUIDE_THROTTLE_PX || dy >= GUIDE_THROTTLE_PX) {
          lastGuideX.value = pos.x;
          lastGuideY.value = pos.y;
          runOnJS(computeSmartGuides)(pos.x, pos.y);
        }
      }
    },
    [showGuides, computeSmartGuides],
  );

  // Per-type corner radius: media = 0 (full-bleed), text = conditional,
  // product/mention/look/vote = 8px (pill content), decorative = 0
  const layerRadius = getLayerRadius(layer);

  // Animated selection border style. The primary selection in a
  // multi-select set uses a thicker (3pt) outline; secondary selections
  // use the standard 2pt. Both use the brand colour.
  const selectionBorderStyle = useAnimatedStyle(() => ({
    borderWidth: isPrimarySelected ? 3 : 2,
    borderColor: layer.locked
      ? colors.warning
      : colors.brand,
    borderRadius: layerRadius,
    opacity: selectionOpacity.value,
    borderStyle: layer.locked ? 'dashed' as const : 'solid' as const }));

  if (mode === 'edit') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <GestureDetector gesture={composedGesture}>
          <Reanimated.View
            style={animatedStyle}
            accessibilityLabel={`${getLayerCategoryLabel(layer.type)} layer${layer.locked ? ', locked' : ''}${layer.hidden ? ', hidden' : ''}${isSelected ? ', selected' : ''}`}
            accessibilityRole="adjustable"
            accessibilityHint="Drag to move, pinch to resize, rotate to rotate, double-tap to edit, long-press for options"
          >
            <View style={[styles.layerInner, { borderRadius: layerRadius }]}>
              {content}
            </View>
            {/* Animated selection border — fades in with spring */}
            {isSelected && (
              <Reanimated.View style={[StyleSheet.absoluteFill, selectionBorderStyle]} pointerEvents="none" />
            )}
            {/* Selection handles — draggable corner + rotation handles.
                Hidden in multi-select mode; only the primary shows handles. */}
            {isSelected && !isMultiSelectActive && (
              <SelectionHandles
                handleScaleSV={handleScale}
                colors={colors}
                layerLocked={layer.locked}
                scaleSV={scaleSV}
                rotationSV={rotationSV}
                onScaleChange={(s) => setGestureBadge(`${Math.round(s * 100)}%`)}
                onRotationChange={(r) => setGestureBadge(`${r}°`)}
                onCommit={() => {
                  setGestureBadge(null);
                  handleTransformCommit(scaleSV.value, rotationSV.value);
                }}
              />
            )}
            {/* Locked badge */}
            {isSelected && layer.locked && (
              <View style={[styles.lockedBadge, { backgroundColor: colors.warning }]} pointerEvents="none" accessibilityLabel="Layer locked" accessibilityRole="image">
                <Ionicons name="lock-closed" size={IconGrammar.badge} color={colors.scrimTextPrimary} aria-hidden={true} />
              </View>
            )}
            {showGuides && <AlignmentGuides canvasWidth={canvasWidth} canvasHeight={canvasHeight} colors={colors} smartGuides={smartGuides} centerGuideVisible={centerGuideVisible} />}
          </Reanimated.View>
        </GestureDetector>
        {/* Gesture feedback badge — floating pill near the manipulated layer
            (Snapchat/Instagram pattern). Positioned by shared values so it
            tracks the layer center in real-time during drag/pinch/rotate.
            Visual-only — pointerEvents="none". */}
        <GestureBadge
          badgeText={gestureBadge}
          positionXSv={translateX}
          positionYSv={translateY}
        />
      </View>
    );
  }

  // Non-edit (preview/view) render path — apply keyframe-driven transform
  // and temporal opacity when a playback clock is present.
  const previewScale = keyframeValues?.scale ?? layer.scale;
  const previewRotation = keyframeValues?.rotation ?? layer.rotation;
  const previewLeft = (keyframeValues?.position !== undefined ? keyframeValues.position : layer.x) * canvasWidth;
  const previewTop = layer.y * canvasHeight;
  const width = layer.width * canvasWidth * previewScale;
  const height = layer.height * canvasHeight * previewScale;

  return (
    <View
      style={{
        position: 'absolute',
        left: previewLeft - width / 2,
        top: previewTop - height / 2,
        width,
        height,
        transform: [{ rotate: `${previewRotation}deg` }],
        opacity: effectiveOpacity,
        zIndex: layer.zIndex }}
      pointerEvents="none"
      accessibilityLabel={`${getLayerCategoryLabel(layer.type)} layer${layer.locked ? ', locked' : ''}${layer.hidden ? ', hidden' : ''}`}
      accessibilityRole="image"
    >
      <View style={[styles.layerInner, { borderRadius: getLayerRadius(layer) }]}>
        {content}
      </View>
    </View>
  );
});

// ── Per-type layer corner radius ───────────────────────────────────
// Media: 0 (full-bleed), text: conditional on background, pill content: 8px, decorative: 0
function getLayerRadius(layer: CreatorLayer): number {
  switch (layer.type) {
    case 'media':
      return 0;
    case 'text':
      return layer.payload.backgroundColor ? Radius.md : 0;
    case 'product':
    case 'mention':
    case 'look':
    case 'vote':
      return Radius.md;
    case 'quiz':
      return Radius.md;
    case 'question':
      return Radius.md;
    case 'emojiSlider':
      return Radius.lg;
    case 'countdown':
      return Radius.md;
    case 'decorative':
      return 0;
    case 'draw':
      return 0;
    case 'gif':
      return Radius.sm;
    case 'music':
      return Radius.md;
    case 'link':
    case 'location':
    case 'hashtag':
    case 'time':
    case 'weather':
      return Radius.md;
    default:
      return 0;
  }
}

function renderLayerContent(
  layer: CreatorLayer,
  width: number,
  height: number,
  playbackClock?: PlaybackClock | null,
  currentTimeMs?: number,
  siblingLayers?: CreatorLayer[],
  compareOriginal?: boolean,
  resolvedLayer?: ResolvedLayer,
): React.ReactNode {
  switch (layer.type) {
    case 'media':
      return <MediaLayerContent layer={layer} width={width} height={height} playbackClock={playbackClock} currentTimeMs={currentTimeMs} siblingLayers={siblingLayers} compareOriginal={compareOriginal} resolvedLayer={resolvedLayer} />;
    case 'text':
      return <TextLayerContent layer={layer} />;
    case 'product':
      return <ProductLayerContent layer={layer} />;
    case 'mention':
      return <MentionLayerContent layer={layer} />;
    case 'look':
      return <LookLayerContent layer={layer} />;
    case 'vote':
      return <VoteLayerContent layer={layer} />;
    case 'quiz':
      return <QuizLayerContent layer={layer} />;
    case 'question':
      return <QuestionLayerContent layer={layer} />;
    case 'emojiSlider':
      return <EmojiSliderLayerContent layer={layer} />;
    case 'countdown':
      return <CountdownLayerContent layer={layer} />;
    case 'decorative':
      return <DecorativeLayerContent layer={layer} width={width} height={height} />;
    case 'draw':
      return <DrawLayerContent layer={layer} width={width} height={height} />;
    case 'gif':
      return <GifLayerContent layer={layer} />;
    case 'music':
      return <MusicLayerContent layer={layer} />;
    case 'link':
      return <LinkLayerContent layer={layer} />;
    case 'location':
      return <LocationLayerContent layer={layer} />;
    case 'hashtag':
      return <HashtagLayerContent layer={layer} />;
    case 'time':
      return <TimeLayerContent layer={layer} />;
    case 'weather':
      return <WeatherLayerContent layer={layer} />;
    default:
      return null;
  }
}

// ── Skia video frame layer ──────────────────────────────────────────
// Renders a video through Skia's useVideo hook so the current frame is a
// SkImage inside a Canvas — enabling the same ColorMatrix / Mask / shader
// pipeline used for images. This path is gated by the render profile's
// skiaVideoFrames + videoEffects capabilities (both hidden in the registry
// today). useVideo is a React hook, so this must be its own component —
// it cannot be called conditionally inside MediaLayerContent.
//
// API (react-native-skia 2.6.2+, stable):
//   const { currentFrame, currentTime, duration, framerate, rotation, size }
//     = useVideo(uri, { paused, seek, looping, volume });
//   currentFrame is a SharedValue<SkImage | null> — render via <SkiaImage>.
function SkiaVideoLayerContent({
  layer,
  width,
  height,
  effectGraph,
  shouldPlay,
  isMuted,
  isLooping,
  volume,
  onError,
  colors }: {
  layer: Extract<CreatorLayer, { type: 'media' }>;
  width: number;
  height: number;
  effectGraph?: import('./engine/evaluateScene').ResolvedEffectGraph;
  shouldPlay: boolean;
  isMuted: boolean;
  isLooping: boolean;
  volume: number;
  onError: () => void;
  colors: ThemeColors;
}) {
  const { payload } = layer;
  const paused = useSharedValue(!shouldPlay);
  const looping = useSharedValue(isLooping);

  // Keep the paused shared value in sync with the shouldPlay prop. useVideo
  // reads `paused` as a shared value so changes do not re-instantiate the
  // video decoder.
  useEffect(() => {
    paused.value = !shouldPlay;
  }, [shouldPlay, paused]);
  useEffect(() => {
    looping.value = isLooping;
  }, [isLooping, looping]);

  // useVideo is the stable Skia video decode hook. It returns the current
  // frame as a SharedValue<SkImage | null>. When the URI is invalid or the
  // platform cannot decode, currentFrame stays null and we fall back to
  // the thumbnail / error state.
  const { currentFrame, rotation, size } = useSkiaVideo(payload.mediaUri, {
    paused,
    looping,
    volume });

  const contentFitMap: Record<string, SkiaFit> = {
    cover: 'cover',
    contain: 'contain',
    fill: 'fill' };
  const fit = contentFitMap[payload.contentFit] ?? 'cover';

  const hasColorMatrix = !!effectGraph?.colorMatrix && effectGraph.colorMatrix.length === 20;
  const maskUri = effectGraph?.maskUri ?? layer.maskRef ?? null;
  const skiaMaskImage = useSkiaImage(maskUri);
  const hasMask = !!skiaMaskImage;

  // Rotation + scale correction via Skia's fitbox (per the official Skia
  // video docs). useVideo returns a rotation of 0/90/180/270 and the source
  // dimensions; fitbox computes the matrix that maps the source rect into
  // the destination rect with the correct rotation and aspect-fit.
  const videoTransform = useMemo(() => {
    if (!rotation || (size.width === 0 && size.height === 0)) return undefined;
    const src = skiaRect(0, 0, size.width, size.height);
    const dst = skiaRect(0, 0, width, height);
    return skiaFitbox(fit === 'cover' ? 'cover' : 'contain', src, dst, rotation);
  }, [rotation, size.width, size.height, width, height, fit]);

  // Thumbnail fallback while the first frame decodes (or when the platform
  // cannot decode the video through Skia).
  const [showThumbnail, setShowThumbnail] = useState(true);
  useAnimatedReaction(
    () => currentFrame.value,
    (frame) => {
      if (frame !== null && showThumbnail) runOnJS(setShowThumbnail)(false);
    },
    [showThumbnail],
  );

  // If after a reasonable delay no frame has decoded, surface the error so
  // the parent can fall back to the native VideoView.
  useEffect(() => {
    if (showThumbnail) {
      const t = setTimeout(() => {
        // If we still have no frame, treat as a decode error so the caller
        // can fall back. This is conservative — Skia video decode failing
        // should not leave a blank surface.
        onError();
      }, 4000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [showThumbnail, onError]);

  return (
    <>
      {showThumbnail && payload.thumbnailUri && (
        <CachedImage
          uri={payload.thumbnailUri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      )}
      <SkiaCanvas style={{ width, height }} accessibilityLabel="Video media layer with effects" accessibilityRole="image">
        {hasMask && skiaMaskImage ? (
          <SkiaMask
            mode="alpha"
            mask={
              <SkiaImage
                image={skiaMaskImage}
                x={0}
                y={0}
                width={width}
                height={height}
                fit={fit}
              />
            }
          >
            <SkiaImage
              image={currentFrame}
              x={0}
              y={0}
              width={width}
              height={height}
              fit={fit}
              transform={videoTransform}
            >
              {hasColorMatrix && (
                <SkiaColorMatrix matrix={effectGraph!.colorMatrix!} />
              )}
            </SkiaImage>
          </SkiaMask>
        ) : (
          <SkiaImage
            image={currentFrame}
            x={0}
            y={0}
            width={width}
            height={height}
            fit={fit}
            transform={videoTransform}
          >
            {hasColorMatrix && (
              <SkiaColorMatrix matrix={effectGraph!.colorMatrix!} />
            )}
          </SkiaImage>
        )}
      </SkiaCanvas>
      <View style={mediaStyles.videoBadge} pointerEvents="none" accessibilityLabel="Video media layer" accessibilityRole="image">
        <Ionicons name="videocam" size={IconGrammar.badge} color={colors.scrimTextPrimary} aria-hidden={true} />
      </View>
    </>
  );
}

function MediaLayerContent({
  layer,
  width,
  height,
  playbackClock,
  currentTimeMs,
  siblingLayers,
  compareOriginal,
  resolvedLayer }: {
  layer: Extract<CreatorLayer, { type: 'media' }>;
  width: number;
  height: number;
  playbackClock?: PlaybackClock | null;
  currentTimeMs?: number;
  siblingLayers?: CreatorLayer[];
  compareOriginal?: boolean;
  resolvedLayer?: ResolvedLayer;
}) {
  const { colors } = useAppTheme();
  const { payload } = layer;
  const [videoError, setVideoError] = React.useState(false);
  const hasPlaybackClock = !!playbackClock;
  const timeMs = currentTimeMs ?? 0;

  // ── Scene-evaluator gating (AGENTS.md §6.3) ─────────────────────
  // The resolved scene carries the authoritative decision on whether this
  // video layer should render through Skia video frames (useVideo) with
  // per-pixel effects, or fall back to the native VideoView without
  // effects. This is gated by the render profile's skiaVideoFrames +
  // videoEffects capabilities — both hidden in the registry today, so the
  // native path is preserved. When the capabilities flip to supported,
  // the Skia video path activates automatically.
  const useSkiaVideoFrames = resolvedLayer?.useSkiaVideoFrames ?? false;
  const resolvedEffectGraph = resolvedLayer?.effectGraph;

  // ── Effect evaluation ───────────────────────────────────────────
  // Evaluate the clip's own effect stack, then merge any active adjustment
  // layers (Meta Edits August 2026). Adjustment layers apply a global grade
  // on top of per-clip adjustments; their opacity blends the contribution.
  // Each segment is evaluated independently with its intensity (the
  // EffectEvaluator interpolates color matrices toward identity for
  // intensity < 1), then the per-segment EvaluatedEffects are combined:
  //   - color matrices are multiplied (composes the grades)
  //   - blur radii take the maximum
  //   - vignette / grain amounts are summed (clamped to 0..1)
  const evaluatedEffect = useMemo<EvaluatedEffect>(() => {
    // Compare-to-original: when the user long-presses the canvas background,
    // skip all effect evaluation so they see the ungraded image (Lightroom
    // long-press compare pattern — recognition over recall, AGENTS.md §4).
    if (compareOriginal) return {};
    const clipEffects = payload.effects ?? [];
    // Resolve active adjustment layers from the sibling set at the current
    // time. siblingLayers excludes this clip but includes adjustment layers
    // (they are separate layers). getActiveAdjustmentLayers filters by
    // type, enabled, hidden, and temporal range.
    const adjustmentLayers = siblingLayers
      ? getActiveAdjustmentLayers(siblingLayers, timeMs)
      : [];

    // No adjustment layers -> evaluate the clip's own effects directly
    // (preserves the original fast path).
    if (adjustmentLayers.length === 0) {
      if (clipEffects.length === 0) return {};
      return evaluateCompositionEffectStack(clipEffects, 1);
    }

    // Build the combined segment stack: clip effects first, then each
    // applicable adjustment layer's effects scaled by its opacity.
    const combined = applyAdjustmentLayersToClip(
      { id: layer.id, effects: clipEffects },
      adjustmentLayers,
      timeMs,
    );

    // Evaluate each segment with its own intensity and merge.
    let colorMatrix: number[] | undefined;
    let blurRadius = 0;
    let vignetteAmount = 0;
    let hasBlur = false;
    let hasVignette = false;

    for (const segment of combined.segments) {
      const segResult = evaluateCompositionEffectStack(segment.effects, segment.intensity);
      if (segResult.colorMatrix) {
        if (colorMatrix) {
          // Multiply matrices to compose the grades.
          colorMatrix = multiplyMatrix(colorMatrix, segResult.colorMatrix);
        } else {
          colorMatrix = [...segResult.colorMatrix];
        }
      }
      if (segResult.blurRadius !== undefined && segResult.blurRadius > 0) {
        blurRadius = Math.max(blurRadius, segResult.blurRadius);
        hasBlur = true;
      }
      if (segResult.vignetteAmount !== undefined && segResult.vignetteAmount > 0) {
        vignetteAmount += segResult.vignetteAmount;
        hasVignette = true;
      }
    }

    const result: EvaluatedEffect = {};
    if (colorMatrix) result.colorMatrix = colorMatrix;
    if (hasBlur && blurRadius > 0) result.blurRadius = blurRadius;
    if (hasVignette && vignetteAmount > 0) result.vignetteAmount = Math.min(1, vignetteAmount);
    return result;
  }, [payload.effects, siblingLayers, timeMs, layer.id, compareOriginal]);

  const hasColorMatrix = !!evaluatedEffect?.colorMatrix && evaluatedEffect.colorMatrix.length === 20;

  // ── Mask evaluation ──────────────────────────────────────────────
  // If the layer has a maskRef, we composite the media with the mask
  // using Skia's Mask component (alpha mode). The mask URI is resolved
  // from the layer's maskRef field (which stores the mask URI directly
  // in the current schema).
  const maskUri = layer.maskRef ?? null;
  const skiaMaskImage = useSkiaImage(maskUri);
  const hasMask = !!skiaMaskImage;

  // ── Skia image for effect/mask rendering ─────────────────────────
  // For images with effects or masks, we load the image via Skia's
  // useImage hook so we can render it inside a Skia Canvas with
  // ColorMatrix and Mask components.
  const skiaImage = useSkiaImage(payload.mediaUri);
  const useSkiaRendering = (hasColorMatrix || hasMask) && !!skiaImage;

  // ── Video playback state ─────────────────────────────────────────
  // When a playback clock is provided, video play/pause follows the clock.
  // When no clock is present (Look composer, viewer), fall back to the
  // legacy behavior: shouldPlay=true, muted=true, looping=true.
  const volume = payload.volume ?? 1;
  const speed = payload.speed ?? 1;
  const isMuted = hasPlaybackClock ? volume === 0 : true;
  const shouldPlay = hasPlaybackClock ? (playbackClock?.isPlaying ?? false) : true;
  const isLooping = !hasPlaybackClock;

  // ── Video seek driven by playback clock ──────────────────────────
  // When the clock's currentTimeMs changes, seek the video to the
  // corresponding source position. The seek is handled by the Video
  // compat component's internal effect on `shouldPlay` and the
  // playback clock's registered adapter. For simplicity, we use the
  // currentTimeMs prop to drive seeks via a ref to the Video player.
  // The actual seek is performed by the playback clock's video adapter,
  // which is registered by the timeline screen. Here we just pass the
  // playback state as props.

  if (payload.mediaType === 'video' && !videoError) {
    // Skia video frame path: when the render profile supports
    // skiaVideoFrames, decode the video via useVideo and render the
    // current frame as a Skia image inside a Canvas — the same
    // ColorMatrix / Mask / shader pipeline used for images. This is
    // gated by the capability registry (skiaVideoFrames + videoEffect
    // both hidden today), so the native VideoView path below remains
    // the live path until the capabilities are flipped to supported.
    if (useSkiaVideoFrames) {
      return (
        <SkiaVideoLayerContent
          layer={layer}
          width={width}
          height={height}
          effectGraph={resolvedEffectGraph}
          shouldPlay={shouldPlay}
          isMuted={isMuted}
          isLooping={isLooping}
          volume={volume}
          onError={() => setVideoError(true)}
          colors={colors}
        />
      );
    }
    return (
      <>
        {payload.thumbnailUri && !hasPlaybackClock && (
          <CachedImage
            uri={payload.thumbnailUri}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        )}
        <Video
          key={`${layer.id}-${payload.mediaUri}`}
          source={{ uri: payload.mediaUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={shouldPlay}
          isMuted={isMuted}
          isLooping={isLooping}
          onError={() => setVideoError(true)}
        />
        {/* Video effects: the native expo-video VideoView renders natively
            and cannot be wrapped in a Skia Canvas, so per-pixel effects
            (color matrix, mask, shader) are NOT applied on this path.
            The scene evaluator returns no effect graph for video layers
            when the videoEffect capability is hidden (§6.4 — no
            metadata-only effect is advertised as a visible result). The
            Skia video frame path above renders the full effect graph
            when the capability is supported. */}
        <View style={mediaStyles.videoBadge} pointerEvents="none" accessibilityLabel="Video media layer" accessibilityRole="image">
          <Ionicons name="videocam" size={IconGrammar.badge} color={colors.scrimTextPrimary} aria-hidden={true} />
        </View>
      </>
    );
  }

  // ── Image rendering with Skia effects/mask ───────────────────────
  // When the image has effects (color matrix) or a mask, render it via
  // a Skia Canvas with ColorMatrix and Mask components. Otherwise, use
  // the standard CachedImage for memory/disk caching and BlurHash support.
  if (useSkiaRendering) {
    const contentFitMap: Record<string, SkiaFit> = {
      cover: 'cover',
      contain: 'contain',
      fill: 'fill' };
    const fit = contentFitMap[payload.contentFit] ?? 'cover';

    return (
      <SkiaCanvas style={{ width, height }} accessibilityLabel="Media layer with effects" accessibilityRole="image">
        {hasMask && skiaMaskImage ? (
          <SkiaMask
            mode="alpha"
            mask={
              <SkiaImage
                image={skiaMaskImage}
                x={0}
                y={0}
                width={width}
                height={height}
                fit={fit}
              />
            }
          >
            <SkiaImage
              image={skiaImage!}
              x={0}
              y={0}
              width={width}
              height={height}
              fit={fit}
            >
              {hasColorMatrix && (
                <SkiaColorMatrix matrix={evaluatedEffect!.colorMatrix!} />
              )}
            </SkiaImage>
          </SkiaMask>
        ) : (
          <SkiaImage
            image={skiaImage!}
            x={0}
            y={0}
            width={width}
            height={height}
            fit={fit}
          >
            {hasColorMatrix && (
              <SkiaColorMatrix matrix={evaluatedEffect!.colorMatrix!} />
            )}
          </SkiaImage>
        )}
      </SkiaCanvas>
    );
  }

  // Image layers use the shared CachedImage system for memory/disk caching,
  // BlurHash placeholder support, and CDN downscale support — consistent
  // with the rest of the app. CachedImage handles its own loading shimmer
  // and error fallback graphic internally.
  return (
    <CachedImage
      uri={payload.mediaUri}
      style={StyleSheet.absoluteFill}
      contentFit={payload.contentFit === 'contain' ? 'contain' : payload.contentFit === 'fill' ? 'fill' : 'cover'}
    />
  );
}

function TextLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'text' }> }) {
  const { payload } = layer;
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();

  // Text entrance animation (Instagram 2025-2026: typewriter, bounce, fade, slide)
  const animProgress = useSharedValue(0);
  const animOpacity = useSharedValue(0);
  const animTranslateY = useSharedValue(0);
  const [typewriterText, setTypewriterText] = useState(payload.text);

  useEffect(() => {
    const animation = payload.textAnimation ?? 'none';
    animProgress.value = 0;
    animOpacity.value = 0;
    animTranslateY.value = 0;
    if (animation === 'none' || reducedMotion) {
      // WCAG 2.2 §2.3.3 — show text immediately with no animation when Reduce Motion is on
      animOpacity.value = 1;
      animProgress.value = 1;
      animTranslateY.value = 0;
      setTypewriterText(payload.text);
      return;
    }
    if (animation === 'fade') {
      animOpacity.value = withTiming(1, { duration: Motion.duration.crawl, easing: Easing.out(Easing.ease) });
      setTypewriterText(payload.text);
    } else if (animation === 'slide') {
      animTranslateY.value = 24;
      animOpacity.value = 0;
      animOpacity.value = withTiming(1, { duration: Motion.duration.slower, easing: Easing.out(Easing.ease) });
      animTranslateY.value = withTiming(0, { duration: Motion.duration.slower, easing: Easing.out(Easing.exp) });
      setTypewriterText(payload.text);
    } else if (animation === 'bounce') {
      animOpacity.value = 1;
      animTranslateY.value = -16;
      animTranslateY.value = withSpring(0, spring.success);
      setTypewriterText(payload.text);
    } else if (animation === 'typewriter') {
      animOpacity.value = 1;
      setTypewriterText('');
      animProgress.value = withTiming(1, { duration: Math.max(800, (payload.text?.length ?? 0) * 60), easing: Easing.linear });
    }
  }, [payload.textAnimation, payload.text, animProgress, animOpacity, animTranslateY, reducedMotion, spring]);

  // Typewriter: react to progress shared value and update visible substring on JS thread
  useAnimatedReaction(
    () => animProgress.value,
    (progress) => {
      const full = payload.text ?? '';
      runOnJS(setTypewriterText)(full.substring(0, Math.ceil(progress * full.length)));
    },
    [payload.text],
  );

  const animStyle = useAnimatedStyle(() => ({
    opacity: animOpacity.value,
    transform: [{ translateY: animTranslateY.value }] }));

  // Per-style typography — real visual distinction, not just font size
  // Instagram 2025-2026: 10 fonts with distinct visual character
  const styleMap: Record<string, any> = {
    headline: {
      // Anton — display/impact for cover statements
      fontFamily: 'Anton_400Regular',
      fontSize: TypographyV2.screenTitle.size + 4,
      lineHeight: (TypographyV2.screenTitle.size + 4) * 1.15,
      textShadowColor: 'rgba(0,0,0,0.4)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4 },
    editorial: {
      // Playfair Display Bold — editorial serif for issue/collection titles
      fontFamily: 'PlayfairDisplay_700Bold',
      fontSize: TypographyV2.screenTitle.size + 1,
      lineHeight: (TypographyV2.screenTitle.size + 1) * 1.2,
      textShadowColor: 'rgba(0,0,0,0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3 },
    clean: {
      // Inter Regular — clean modern sans (lighter weight)
      fontFamily: 'Inter_400Regular',
      fontSize: TypographyV2.body.size + 1,
      lineHeight: (TypographyV2.body.size + 1) * 1.35,
      textShadowColor: 'rgba(0,0,0,0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2 },
    compact: {
      // Inter SemiBold — uppercase labels (kept as-is)
      fontFamily: 'Inter_600SemiBold',
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.size * 1.3,
      letterSpacing: 0.8,
      textTransform: 'uppercase' },
    handwritten: {
      // Caveat — genuine handwriting font
      fontFamily: 'Caveat_400Regular',
      fontSize: TypographyV2.body.size + 2,
      lineHeight: (TypographyV2.body.size + 2) * 1.3 },
    bubble: {
      // Playfair Display Regular — editorial serif for a restrained,
      // non-template feel (replaces round script Pacifico)
      fontFamily: 'PlayfairDisplay_400Regular',
      fontSize: TypographyV2.bodyStrong.size + 6,
      lineHeight: (TypographyV2.bodyStrong.size + 6) * 1.2,
      letterSpacing: 0.5 },
    deco: {
      // Anton — strong display (replaces retro Lobster for a more
      // cohesive, less template-like feel)
      fontFamily: 'Anton_400Regular',
      fontSize: TypographyV2.bodyStrong.size + 2,
      lineHeight: (TypographyV2.bodyStrong.size + 2) * 1.3,
      letterSpacing: 1.5 },
    poster: {
      // Bebas Neue — condensed display for poster titles
      fontFamily: 'BebasNeue_400Regular',
      fontSize: TypographyV2.screenTitle.size - 2,
      lineHeight: (TypographyV2.screenTitle.size - 2) * 1.1,
      letterSpacing: -0.5 },
    squeeze: {
      // Bebas Neue — condensed display (tighter feel)
      fontFamily: 'BebasNeue_400Regular',
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.size * 1.1,
      letterSpacing: -0.3 },
    signature: {
      // Playfair Display Regular italic — refined serif signature
      // (replaces generic Dancing Script for a more editorial feel)
      fontFamily: 'PlayfairDisplay_400Regular',
      fontStyle: 'italic',
      fontSize: TypographyV2.bodyStrong.size + 2,
      lineHeight: (TypographyV2.bodyStrong.size + 2) * 1.4 } };

  // Text effect styles (Instagram 2025-2026)
  const effectStyle: TextStyle = {};
  if (payload.textEffect === 'shadow') {
    effectStyle.textShadowColor = 'rgba(0,0,0,0.6)';
    effectStyle.textShadowOffset = { width: 2, height: 2 };
    effectStyle.textShadowRadius = 4;
  } else if (payload.textEffect === 'neon') {
    effectStyle.textShadowColor = payload.textColor;
    effectStyle.textShadowOffset = { width: 0, height: 0 };
    effectStyle.textShadowRadius = 8;
  } else if (payload.textEffect === 'glow') {
    effectStyle.textShadowColor = payload.textColor;
    effectStyle.textShadowOffset = { width: 0, height: 0 };
    effectStyle.textShadowRadius = 12;
  } else if (payload.textEffect === 'outline') {
    effectStyle.textShadowColor = '#000';
    effectStyle.textShadowOffset = { width: 0, height: 0 };
    effectStyle.textShadowRadius = 1;
  }

  return (
    <View
      style={[
        textStyles.container,
        payload.backgroundColor ? { backgroundColor: payload.backgroundColor } : null,
        payload.alignment === 'left' && { alignItems: 'flex-start' },
        payload.alignment === 'right' && { alignItems: 'flex-end' },
      ]}
      accessibilityLabel={`Text, ${payload.text}`}
      accessibilityRole="text"
    >
      <Reanimated.View style={animStyle}>
        <Text
          style={[
            textStyles.text,
            { color: payload.textColor },
            styleMap[payload.textStyle] ?? styleMap.clean,
            effectStyle,
          ]}
          numberOfLines={undefined}
        >
          {typewriterText}
        </Text>
      </Reanimated.View>
    </View>
  );
}

function ProductLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'product' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();
  const productStyles = React.useMemo(() => createProductStyles(colors), [colors]);
  const isSold = payload.availability === 'sold';
  const isDeleted = payload.availability === 'deleted';
  const hasImage = !!payload.snapshotImageUrl;
  const hasHotspot = !!payload.hotspotLabel;

  if (hasImage) {
    return (
      <View
        style={productStyles.imageContainer}
        accessibilityLabel={`Product layer, ${payload.snapshotTitle || 'Listing'}${payload.snapshotPriceGbp !== undefined ? `, ${currencySymbol}${payload.snapshotPriceGbp.toFixed(0)}` : ''}${isSold ? ', sold' : ''}`}
        accessibilityRole="link"
      >
        <ExpoImage
          source={{ uri: payload.snapshotImageUrl! }}
          style={productStyles.thumbnail}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={payload.snapshotImageUrl!}
          enforceEarlyResizing
        />
        <View style={productStyles.imageOverlay}>
          <Text style={productStyles.imageTitle} numberOfLines={1}>
            {payload.snapshotTitle || 'Listing'}
          </Text>
          {payload.snapshotPriceGbp !== undefined && (
            <Text style={[productStyles.imagePrice, isSold && productStyles.soldPrice]}>
              {isSold ? 'SOLD' : `${currencySymbol}${payload.snapshotPriceGbp.toFixed(0)}`}
            </Text>
          )}
        </View>
        {isSold && (
          <View style={productStyles.soldBadge}>
            <Text style={productStyles.soldBadgeText}>SOLD</Text>
          </View>
        )}
      </View>
    );
  }

  if (hasHotspot) {
    return (
      <View
        style={productStyles.hotspotContainer}
        accessibilityLabel={`Product hotspot, ${payload.hotspotLabel}${payload.snapshotPriceGbp !== undefined ? `, ${currencySymbol}${payload.snapshotPriceGbp.toFixed(0)}` : ''}`}
        accessibilityRole="link"
      >
        <View style={productStyles.hotspotDot} />
        <Text style={productStyles.hotspotLabel} numberOfLines={1}>
          {payload.hotspotLabel}
        </Text>
        {payload.snapshotPriceGbp !== undefined && !isSold && (
          <Text style={productStyles.hotspotPrice}>
            {currencySymbol}{payload.snapshotPriceGbp.toFixed(0)}
          </Text>
        )}
      </View>
    );
  }

  // Fallback: compact tag with icon — premium shoppable pin style

  return (
    <View
      style={productStyles.container}
      accessibilityLabel={`Product layer, ${payload.snapshotTitle || 'Listing'}${payload.snapshotPriceGbp !== undefined ? `, ${currencySymbol}${payload.snapshotPriceGbp.toFixed(0)}` : ''}${isSold ? ', sold' : ''}${isDeleted ? ', unavailable' : ''}`}
      accessibilityRole="link"
    >
      <View style={productStyles.row}>
        <Ionicons name="pricetag" size={IconGrammar.badge} color={colors.scrimTextPrimary} aria-hidden={true} />
        <Text style={productStyles.title} numberOfLines={1}>{payload.snapshotTitle || 'Listing'}</Text>
      </View>
      {payload.snapshotPriceGbp !== undefined && (
        <Text style={[productStyles.price, isSold && productStyles.soldPrice, isDeleted && productStyles.deletedPrice]}>
          {isSold ? 'SOLD' : isDeleted ? 'UNAVAILABLE' : `${currencySymbol}${payload.snapshotPriceGbp.toFixed(0)}`}
        </Text>
      )}
    </View>
  );
}

function MentionLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'mention' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const mentionStyles = React.useMemo(() => createMentionStyles(colors), [colors]);
  return (
    <View style={mentionStyles.container} accessibilityLabel={`Mention @${payload.username}`} accessibilityRole="link">
      <Text style={mentionStyles.text}>@{payload.username}</Text>
    </View>
  );
}

function LookLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'look' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const lookStyles = React.useMemo(() => createLookStyles(colors), [colors]);
  return (
    <View style={lookStyles.container} accessibilityLabel={`Look, ${payload.snapshotCaption || 'View look'}`} accessibilityRole="link">
      <Ionicons name="shirt-outline" size={IconGrammar.badge} color={colors.scrimTextPrimary} aria-hidden={true} />
      <Text style={lookStyles.text} numberOfLines={1}>{payload.snapshotCaption || 'View look'}</Text>
    </View>
  );
}

function VoteLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'vote' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const voteStyles = React.useMemo(() => createVoteStyles(colors), [colors]);
  const hasTimer = payload.timerMs !== undefined && payload.timerMs > 0;
  const timerSeconds = hasTimer ? Math.round(payload.timerMs! / 1000) : 0;
  const timerLabel = timerSeconds >= 3600
    ? `${Math.floor(timerSeconds / 3600)}h`
    : timerSeconds >= 60
      ? `${Math.floor(timerSeconds / 60)}m`
      : `${timerSeconds}s`;

  return (
    <View
      style={[voteStyles.container, payload.backgroundColor && { backgroundColor: payload.backgroundColor }]}
      accessibilityLabel={`Poll, ${payload.question}${hasTimer ? `, ${timerLabel} timer` : ''}`}
      accessibilityRole="summary"
    >
      <View style={voteStyles.headerRow}>
        <Text style={voteStyles.question}>{payload.question}</Text>
        {hasTimer && (
          <View style={voteStyles.timerBadge}>
            <Ionicons name="timer-outline" size={IconGrammar.badge} color="#fff" aria-hidden={true} />
            <Text style={voteStyles.timerText}>{timerLabel}</Text>
          </View>
        )}
      </View>
      <View style={voteStyles.optionsRow}>
        {payload.options.map((opt) => (
          <View key={opt.id} style={voteStyles.option}>
            <Text style={voteStyles.optionText} numberOfLines={1}>{opt.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Quiz layer content ─────────────────────────────────────────────
// Instagram 2026: multiple-choice quiz with emoji and correct answer indicator.
// Premium rendering: gradient surface, proper button styling, filled correct badge.
function QuizLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'quiz' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const quizStyles = React.useMemo(() => createQuizStyles(colors), [colors]);
  return (
    <View style={quizStyles.container} accessibilityLabel={`Quiz, ${payload.emoji} ${payload.question}`} accessibilityRole="summary">
      <View style={quizStyles.header}>
        <Text style={quizStyles.emoji}>{payload.emoji}</Text>
        <Text style={quizStyles.question}>{payload.question}</Text>
      </View>
      <View style={quizStyles.optionsCol}>
        {payload.options.map((opt, i) => {
          const isCorrect = opt.id === payload.correctOptionId;
          return (
            <View key={opt.id} style={[
              quizStyles.option,
              isCorrect && quizStyles.optionCorrect,
            ]}>
              <Text style={[quizStyles.optionText, isCorrect && quizStyles.optionTextCorrect]}>
                {opt.label}
              </Text>
              {isCorrect && (
                <View style={quizStyles.correctBadge}>
                  <Ionicons name="checkmark" size={IconGrammar.badge} color="#1a1a1a" aria-hidden={true} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Question box layer content ─────────────────────────────────────
// Instagram 2026: open-ended question box sticker.
// Premium rendering: gradient background, input affordance with cursor hint.
function QuestionLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'question' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const questionStyles = React.useMemo(() => createQuestionStyles(colors), [colors]);
  return (
    <View style={[questionStyles.container, { backgroundColor: payload.backgroundColor }]} accessibilityLabel={`Question box, ${payload.prompt}`} accessibilityRole="search">
      <Text style={questionStyles.prompt}>{payload.prompt}</Text>
      <View style={questionStyles.inputAffordance}>
        <Ionicons name="chatbubbles-outline" size={IconGrammar.metadata} color="rgba(255,255,255,0.5)" aria-hidden={true} />
        <Text style={questionStyles.placeholder}>{payload.placeholder}</Text>
        <View style={questionStyles.sendHint}>
          <Ionicons name="arrow-up" size={IconGrammar.badge} color="rgba(255,255,255,0.4)" aria-hidden={true} />
        </View>
      </View>
    </View>
  );
}

// ── Emoji slider layer content ─────────────────────────────────────
// Instagram 2026: emoji slider for intensity measurement.
// Premium rendering: dark glass surface, proper slider track with thumb.
function EmojiSliderLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'emojiSlider' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const sliderStyles = React.useMemo(() => createSliderStyles(colors), [colors]);
  return (
    <View style={sliderStyles.container} accessibilityLabel={`Emoji slider, ${payload.emoji} ${payload.question}`} accessibilityRole="adjustable">
      <Text style={sliderStyles.question}>{payload.question}</Text>
      <View style={sliderStyles.sliderRow}>
        <Text style={sliderStyles.emoji}>{payload.emoji}</Text>
        <View style={sliderStyles.track}>
          <View style={[sliderStyles.trackFill, { backgroundColor: payload.sliderColor }]} />
          <View style={[sliderStyles.thumb, { borderColor: payload.sliderColor }]} />
        </View>
        {payload.endLabel ? (
          <Text style={sliderStyles.endLabel}>{payload.endLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Countdown layer content ────────────────────────────────────────
// Instagram 2026: countdown to a date/time with live timer.
// Premium rendering: card with depth, gradient surface, tabular time display.
function CountdownLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'countdown' }> }) {
  const { payload } = layer;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const endMs = new Date(payload.endDateTime).getTime();
  const remaining = Math.max(0, endMs - now);
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const days = Math.floor(hours / 24);
  const displayHours = hours % 24;

  const timeStr = days > 0
    ? `${days}d ${displayHours}h ${mins}m`
    : `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <View style={[countdownStyles.container, { backgroundColor: payload.color }]} accessibilityLabel={`Countdown, ${payload.label}, ${timeStr}`} accessibilityRole="timer">
      <View style={countdownStyles.iconRow}>
        <Ionicons name="time-outline" size={IconGrammar.badge} color={payload.textColor} aria-hidden={true} />
        <Text style={countdownStyles.label}>{payload.label}</Text>
      </View>
      <Text style={countdownStyles.time}>{timeStr}</Text>
    </View>
  );
}

function DecorativeLayerContent({ layer, width, height }: { layer: Extract<CreatorLayer, { type: 'decorative' }>; width: number; height: number }) {
  const { colors } = useAppTheme();
  const { payload } = layer;
  const fillColor = payload.fillColor ?? colors.brand;
  const subtleShadow = {
    ...Elevation.floating };
  const iconSize = Math.min(width, height);

  switch (payload.shape) {
    case 'circle':
      return (
        <View
          style={{
            width: '100%',
            height: '100%',
            borderRadius: width / 2,
            backgroundColor: fillColor,
            opacity: payload.opacity,
            ...subtleShadow }}
          accessibilityLabel="Decorative circle shape"
          accessibilityRole="image"
        />
      );
    case 'square':
      return (
        <View
          style={{
            width: '100%',
            height: '100%',
            borderRadius: Radius.md,
            backgroundColor: fillColor,
            opacity: payload.opacity,
            ...subtleShadow }}
          accessibilityLabel="Decorative square shape"
          accessibilityRole="image"
        />
      );
    case 'line':
      return (
        <View
          style={{
            width: '100%',
            height: 4,
            borderRadius: Radius.sm,
            backgroundColor: fillColor,
            opacity: payload.opacity,
            marginTop: height / 2 - 2 }}
        />
      );
    case 'arrow':
      return (
        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', opacity: payload.opacity }}>
          <Ionicons
            name="arrow-up"
            size={iconSize}
            color={fillColor}
            style={{ transform: [{ rotate: `${layer.rotation}deg` }] }}
          />
        </View>
      );
    case 'star':
      return (
        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', opacity: payload.opacity, ...subtleShadow }} accessibilityLabel="Decorative star shape" accessibilityRole="image">
          <Ionicons name="star" size={iconSize} color={fillColor} />
        </View>
      );
    case 'heart':
      return (
        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', opacity: payload.opacity, ...subtleShadow }} accessibilityLabel="Decorative heart shape" accessibilityRole="image">
          <Ionicons name="heart" size={iconSize} color={fillColor} />
        </View>
      );
    case 'triangle':
      return (
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: width / 2,
            borderRightWidth: width / 2,
            borderBottomWidth: height,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: fillColor,
            opacity: payload.opacity,
            alignSelf: 'center' }}
        />
      );
    case 'hexagon':
      return (
        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', opacity: payload.opacity, ...subtleShadow }}>
          <Ionicons name="stop" size={iconSize} color={fillColor} style={{ transform: [{ rotate: '45deg' }] }} />
        </View>
      );
    default:
      return null;
  }
}

// ── Draw layer content ─────────────────────────────────────────────
// Renders freehand strokes using Skia. Points are normalized 0-1
// relative to the layer bounds; scaled to the rendered pixel size.
function DrawLayerContent({ layer, width, height }: { layer: Extract<CreatorLayer, { type: 'draw' }>; width: number; height: number }) {
  const { payload } = layer;

  const strokePaths = useMemo(() => {
    return payload.strokes.map((stroke, i) => {
      if (stroke.points.length === 0) return null;
      const path = Skia.Path.Make();
      const first = stroke.points[0];
      path.moveTo(first.x * width, first.y * height);
      for (let j = 1; j < stroke.points.length; j++) {
        const prev = stroke.points[j - 1];
        const curr = stroke.points[j];
        const midX = ((prev.x + curr.x) / 2) * width;
        const midY = ((prev.y + curr.y) / 2) * height;
        path.quadTo(prev.x * width, prev.y * height, midX, midY);
      }
      const last = stroke.points[stroke.points.length - 1];
      path.lineTo(last.x * width, last.y * height);
      return { key: i, path, stroke };
    }).filter(Boolean);
  }, [payload.strokes, width, height]);

  return (
    <SkiaCanvas style={{ width, height }} accessibilityLabel="Drawing layer" accessibilityRole="image">
      {strokePaths.map((sp: any) => {
        const isEraser = sp.stroke.tool === 'eraser';
        const isMarker = sp.stroke.tool === 'marker';
        const isHighlighter = sp.stroke.tool === 'highlighter';
        const isNeon = sp.stroke.tool === 'neon';
        return (
          <SkiaPath
            key={sp.key}
            path={sp.path}
            style="stroke"
            strokeWidth={sp.stroke.width}
            color={sp.stroke.color}
            strokeCap="round"
            strokeJoin="round"
            opacity={isHighlighter ? 0.35 : isMarker ? 0.6 : 1}
            blendMode={isEraser ? "clear" : isNeon ? "screen" : "srcOver"}
          />
        );
      })}
    </SkiaCanvas>
  );
}

// ── GIF layer content ──────────────────────────────────────────────
// Renders animated GIF using expo-image (supports animated GIF playback).
function GifLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'gif' }> }) {
  const { payload } = layer;
  return (
    <ExpoImage
      source={{ uri: payload.gifUrl }}
      style={{ width: '100%', height: '100%' }}
      contentFit="contain"
      cachePolicy="memory-disk"
      recyclingKey={payload.gifUrl}
      transition={300}
      enforceEarlyResizing
      accessible
      accessibilityLabel={payload.altText || 'GIF sticker'}
    />
  );
}

// ── Music layer content ────────────────────────────────────────────
// Instagram-style music sticker: album art + track name + artist.
// Premium rendering: darker glass surface, proper album art with shadow.
function MusicLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'music' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: Radius.lg,
        backgroundColor: 'rgba(0,0,0,0.75)',
        minWidth: 160,
        maxWidth: '100%' }}
      accessibilityLabel={`Music, ${payload.trackName}${payload.artistName ? ` by ${payload.artistName}` : ''}`}
      accessibilityRole="button"
    >
      {payload.artworkUrl ? (
        <ExpoImage
          source={{ uri: payload.artworkUrl }}
          style={{
            width: 40,
            height: 40,
            borderRadius: Radius.sm,
            ...Elevation.modal }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={payload.artworkUrl}
          enforceEarlyResizing
        />
      ) : (
        <View style={{
          width: 40,
          height: 40,
          borderRadius: Radius.sm,
          backgroundColor: 'rgba(201,164,106,0.2)',
          justifyContent: 'center',
          alignItems: 'center' }}>
          <Ionicons name="musical-notes" size={IconGrammar.metadata} color="rgba(201,164,106,0.8)" aria-hidden={true} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size + 1, color: '#fff' }} numberOfLines={1}>
          {payload.trackName}
        </Text>
        {payload.artistName ? (
          <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: 'rgba(255,255,255,0.6)' }} numberOfLines={1}>
            {payload.artistName}
          </Text>
        ) : null}
      </View>
      <View style={{
        width: 22,
        height: 22,
        borderRadius: Radius.full,
        backgroundColor: 'rgba(255,255,255,0.12)',
        justifyContent: 'center',
        alignItems: 'center' }}>
        <Ionicons name="play" size={IconGrammar.badge} color={colors.scrimTextPrimary} aria-hidden={true} />
      </View>
    </View>
  );
}

// ── Link layer content ─────────────────────────────────────────────
function LinkLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'link' }> }) {
  const { payload } = layer;
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: Radius.md,
      backgroundColor: payload.backgroundColor,
      minWidth: 120 }} accessibilityLabel={`Link, ${payload.ctaText}`} accessibilityRole="link">
      <Ionicons name="link-outline" size={IconGrammar.metadata} color={payload.textColor} aria-hidden={true} />
      <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size + 1, color: payload.textColor }} numberOfLines={1}>
        {payload.ctaText}
      </Text>
    </View>
  );
}

// ── Location layer content ─────────────────────────────────────────
function LocationLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'location' }> }) {
  const { payload } = layer;
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: 'rgba(0,0,0,0.6)',
      minWidth: 100 }} accessibilityLabel={`Location, ${payload.placeName}`} accessibilityRole="link">
      <Ionicons name="location-outline" size={IconGrammar.metadata} color="#fff" aria-hidden={true} />
      <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size + 1, color: '#fff' }} numberOfLines={1}>
        {payload.placeName}
      </Text>
    </View>
  );
}

// ── Hashtag layer content ──────────────────────────────────────────
function HashtagLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'hashtag' }> }) {
  const { payload } = layer;
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: payload.backgroundColor,
      minWidth: 80 }} accessibilityLabel={`Hashtag, ${payload.tag}`} accessibilityRole="link">
      <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size + 1, color: payload.textColor }} numberOfLines={1}>
        #{payload.tag}
      </Text>
    </View>
  );
}

// ── Time layer content ─────────────────────────────────────────────
function TimeLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'time' }> }) {
  const { payload } = layer;
  const date = new Date(payload.displayTime);
  const timeStr = payload.format === 'time'
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : payload.format === 'date'
    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: payload.backgroundColor ?? 'rgba(0,0,0,0.6)',
      minWidth: 80 }} accessibilityLabel={`Time, ${timeStr}`} accessibilityRole="text">
      <Ionicons name="time-outline" size={IconGrammar.metadata} color={payload.textColor} aria-hidden={true} />
      <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size + 1, color: payload.textColor }} numberOfLines={1}>
        {timeStr}
      </Text>
    </View>
  );
}

// ── Weather layer content ──────────────────────────────────────────
function WeatherLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'weather' }> }) {
  const { payload } = layer;
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: Radius.md,
      backgroundColor: payload.backgroundColor ?? 'rgba(0,0,0,0.6)',
      minWidth: 120 }} accessibilityLabel={`Weather, ${payload.temperature}° ${payload.condition}${payload.locationName ? `, ${payload.locationName}` : ''}`} accessibilityRole="text">
      <Text style={{ fontSize: TypographyV2.priceList.size }}>{payload.emoji}</Text>
      <View style={{ gap: 1 }}>
        <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size + 1, color: payload.textColor }} numberOfLines={1}>
          {payload.temperature}° {payload.condition}
        </Text>
        {payload.locationName ? (
          <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: payload.textColor, opacity: 0.7 }} numberOfLines={1}>
            {payload.locationName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Selection handles ──────────────────────────────────────────────
// 20px visible handles with shadow, 44pt invisible touch targets,
// spring scale-in animation, and a rotation handle above top-center.
function SelectionHandles({
  handleScaleSV,
  colors,
  layerLocked,
  scaleSV,
  rotationSV,
  onScaleChange,
  onRotationChange,
  onCommit }: {
  handleScaleSV: ReturnType<typeof useSharedValue<number>>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  layerLocked: boolean;
  scaleSV: ReturnType<typeof useSharedValue<number>>;
  rotationSV: ReturnType<typeof useSharedValue<number>>;
  onScaleChange: (scale: number) => void;
  onRotationChange: (rotation: number) => void;
  onCommit: () => void;
}) {
  const handleColor = layerLocked ? colors.warning : colors.brand;
  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);

  const animatedHandleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: handleScaleSV.value }] }));

  // ── Corner handle: drag to resize (scale) ──
  // The handle is at a corner. Dragging away from center = scale up,
  // dragging toward center = scale down. We use the Y component of
  // the drag (in the layer's rotated space) as the primary axis.
  const cornerPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!layerLocked)
        .minDistance(3)
        .onStart(() => {
          startScale.value = scaleSV.value;
        })
        .onUpdate((e) => {
          // Use absolute translation distance for scale change
          // Positive Y (drag down/away) = scale up
          const scaleDelta = 1 + (e.translationY * 0.005);
          const newScale = Math.max(0.2, Math.min(5, startScale.value * scaleDelta));
          scaleSV.value = newScale;
          runOnJS(onScaleChange)(Math.round(newScale * 100) / 100);
        })
        .onEnd(() => {
          runOnJS(onCommit)();
        }),
    [layerLocked, scaleSV, startScale, onScaleChange, onCommit]
  );

  // ── Rotation handle: drag to rotate ──
  // The handle is above the top-center. Dragging left/right rotates.
  const rotationPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!layerLocked)
        .minDistance(3)
        .onStart(() => {
          startRotation.value = rotationSV.value;
        })
        .onUpdate((e) => {
          // Convert drag translation to rotation degrees
          // 1px of horizontal drag = ~0.5 degrees
          const rotationDelta = e.translationX * 0.5;
          const newRotation = normaliseDegrees(startRotation.value + rotationDelta);
          rotationSV.value = newRotation;
          runOnJS(onRotationChange)(Math.round(newRotation));
        })
        .onEnd(() => {
          runOnJS(onCommit)();
        }),
    [layerLocked, rotationSV, startRotation, onRotationChange, onCommit]
  );

  const handleBase: ViewStyle = {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: handleColor,
    ...Elevation.modal };

  // Invisible hit zone — 44pt for touch compliance
  const hitZone: ViewStyle = {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: Radius.full };

  return (
    <Reanimated.View style={[StyleSheet.absoluteFill, animatedHandleStyle]} accessibilityLabel="Layer selection handles" accessibilityRole="adjustable">
      {/* Corner handles — 20px visible, 44pt hit zone, draggable */}
      {/* Top-left */}
      <GestureDetector gesture={cornerPan}>
        <Reanimated.View style={[hitZone, { top: -22, left: -22 }]} accessibilityLabel="Resize handle, top left" accessibilityRole="adjustable" accessibilityHint="Drag to resize the layer">
          <View style={[handleBase, { top: 12, left: 12 }]} pointerEvents="none" />
        </Reanimated.View>
      </GestureDetector>
      {/* Top-right */}
      <GestureDetector gesture={cornerPan}>
        <Reanimated.View style={[hitZone, { top: -22, right: -22 }]} accessibilityLabel="Resize handle, top right" accessibilityRole="adjustable" accessibilityHint="Drag to resize the layer">
          <View style={[handleBase, { top: 12, right: 12 }]} pointerEvents="none" />
        </Reanimated.View>
      </GestureDetector>
      {/* Bottom-left */}
      <GestureDetector gesture={cornerPan}>
        <Reanimated.View style={[hitZone, { bottom: -22, left: -22 }]} accessibilityLabel="Resize handle, bottom left" accessibilityRole="adjustable" accessibilityHint="Drag to resize the layer">
          <View style={[handleBase, { bottom: 12, left: 12 }]} pointerEvents="none" />
        </Reanimated.View>
      </GestureDetector>
      {/* Bottom-right */}
      <GestureDetector gesture={cornerPan}>
        <Reanimated.View style={[hitZone, { bottom: -22, right: -22 }]} accessibilityLabel="Resize handle, bottom right" accessibilityRole="adjustable" accessibilityHint="Drag to resize the layer">
          <View style={[handleBase, { bottom: 12, right: 12 }]} pointerEvents="none" />
        </Reanimated.View>
      </GestureDetector>

      {/* Rotation handle — above top-center, connected by a line */}
      <View
        style={{
          position: 'absolute',
          top: -28,
          left: '50%',
          marginLeft: -1,
          width: 2,
          height: 18,
          backgroundColor: handleColor }}
        pointerEvents="none"
      />
      <GestureDetector gesture={rotationPan}>
        <Reanimated.View style={[hitZone, { top: -50, left: '50%', marginLeft: -22 }]} accessibilityLabel="Rotation handle" accessibilityRole="adjustable" accessibilityHint="Drag to rotate the layer">
          <View style={[handleBase, { top: 12, left: 12 }]} pointerEvents="none">
            <Ionicons name="refresh" size={IconGrammar.badge} color={handleColor} style={{ textAlign: 'center', lineHeight: 16 }} aria-hidden={true} />
          </View>
        </Reanimated.View>
      </GestureDetector>
    </Reanimated.View>
  );
}

function AlignmentGuides({
  canvasWidth,
  canvasHeight,
  colors,
  smartGuides,
  centerGuideVisible }: {
  canvasWidth: number;
  canvasHeight: number;
  colors: ReturnType<typeof useAppTheme>['colors'];
  smartGuides?: { vertical: number[]; horizontal: number[] };
  centerGuideVisible?: boolean;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Center-line guides — appear only when the layer's center is within
          8pt of canvas center (Canva/Figma/Instagram Stories pattern).
          1pt guide line with colors.brand at 50% opacity. */}
      {centerGuideVisible && (
        <>
          {/* Horizontal centre line — 1px, brand color at 50% opacity */}
          <View style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: canvasHeight / 2 - 0.5,
            height: 1,
            backgroundColor: colors.brand,
            opacity: 0.5 }} />
          {/* Vertical centre line */}
          <View style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: canvasWidth / 2 - 0.5,
            width: 1,
            backgroundColor: colors.brand,
            opacity: 0.5 }} />
          {/* Center dot at intersection */}
          <View style={{
            position: 'absolute',
            left: canvasWidth / 2 - 3,
            top: canvasHeight / 2 - 3,
            width: 6,
            height: 6,
            borderRadius: Radius.full,
            backgroundColor: colors.brand,
            opacity: 0.6 }} />
        </>
      )}
      {/* Safe-zone edges — 1px dashed, muted at 25% opacity */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: canvasHeight * SAFE_MARGIN, height: 1, backgroundColor: colors.textMuted, opacity: 0.25 }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: canvasHeight * SAFE_MARGIN, height: 1, backgroundColor: colors.textMuted, opacity: 0.25 }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: canvasWidth * SAFE_MARGIN, width: 1, backgroundColor: colors.textMuted, opacity: 0.25 }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, right: canvasWidth * SAFE_MARGIN, width: 1, backgroundColor: colors.textMuted, opacity: 0.25 }} />
      {/* Smart guides — vertical */}
      {(smartGuides?.vertical ?? []).map((x, i) => (
        <View key={`v${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: x, width: 1, backgroundColor: colors.brand, opacity: 0.7 }} />
      ))}
      {/* Smart guides — horizontal */}
      {(smartGuides?.horizontal ?? []).map((y, i) => (
        <View key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: y, height: 1, backgroundColor: colors.brand, opacity: 0.7 }} />
      ))}
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
  layerInner: {
    width: '100%',
    height: '100%',
    overflow: 'hidden' },
  // Empty state — premium designed surface
  emptyState: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.sm },
  emptyStateIconWrap: {
    marginBottom: Space.xs },
  emptyStateTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.screenTitle.size,
    color: 'rgba(255,255,255,0.85)' },
  emptyStateSubtitle: {
    fontFamily: TypographyV2.screenTitle.fontFamily,
    fontSize: TypographyV2.body.size,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center' },
  // Locked badge
  lockedBadge: {
    position: 'absolute',
    top: -10,
    left: -10,
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' } });

const mediaStyles = StyleSheet.create({
  videoBadge: {
    position: 'absolute',
    top: Space.xs,
    left: Space.xs,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.sm,
    paddingHorizontal: Space.xs,
    paddingVertical: 2 } });

const textStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.sm },
  text: {
    fontFamily: TypographyV2.body.fontFamily,
    fontSize: TypographyV2.body.size + 1,
    textAlign: 'center',
    flexWrap: 'wrap' } });

function createProductStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    gap: 2,
    justifyContent: 'center',
    alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4 },
  title: {
    color: colors.scrimTextPrimary,
    fontFamily: TypographyV2.body.fontFamily,
    fontSize: TypographyV2.meta.size },
  price: {
    color: colors.brand,
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: TypographyV2.body.size },
  soldPrice: {
    color: colors.danger },
  deletedPrice: {
    color: colors.textMuted },
  imageContainer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    width: '100%',
    height: '100%' },
  thumbnail: {
    width: '100%',
    height: '100%',
    position: 'absolute' },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xs,
    gap: 1 },
  imageTitle: {
    color: '#fff',
    fontFamily: TypographyV2.body.fontFamily,
    fontSize: TypographyV2.meta.size },
  imagePrice: {
    color: colors.brand,
    fontFamily: TypographyV2.body.fontFamily,
    fontSize: TypographyV2.meta.size },
  soldBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: colors.danger,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2 },
  soldBadgeText: {
    color: '#fff',
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: TypographyV2.meta.size },
  hotspotContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.smMd,
    paddingVertical: 6,
    ...Elevation.modal },
  hotspotDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
    backgroundColor: '#fff',
    borderWidth: Stroke.standard,
    borderColor: colors.brand },
  hotspotLabel: {
    color: '#fff',
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: TypographyV2.meta.size,
    flex: 1 },
  hotspotPrice: {
    color: colors.brand,
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: TypographyV2.meta.size } });
}

function createMentionStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: Radius.full,
      paddingHorizontal: Space.smMd,
      paddingVertical: Space.xs,
      justifyContent: 'center',
      alignItems: 'center' },
    text: {
      color: colors.scrimTextPrimary,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size } });
}

function createLookStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: Radius.full,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs,
      justifyContent: 'center' },
    text: {
      color: colors.scrimTextPrimary,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size } });
}

function createVoteStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: 'rgba(0,0,0,0.75)',
      borderRadius: Radius.lg,
      paddingHorizontal: Space.md + 2,
      paddingVertical: Space.sm + 2,
      gap: 8,
      minWidth: 160,
      justifyContent: 'center',
      alignItems: 'center' },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
      justifyContent: 'center' },
    question: {
      color: colors.scrimTextPrimary,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      textAlign: 'center',
      flexShrink: 1 },
    timerBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: Radius.md,
      paddingHorizontal: 6,
      paddingVertical: 2 },
    timerText: {
      color: colors.scrimTextPrimary,
      fontFamily: TypographyV2.body.fontFamily,
      fontSize: TypographyV2.meta.size },
    optionsRow: {
      flexDirection: 'row',
      gap: 6,
      flexWrap: 'wrap',
      justifyContent: 'center' },
    option: {
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: Radius.sm,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      alignItems: 'center',
      minWidth: 60,
      flex: 1,
      maxWidth: '48%' },
    optionFirst: {
      // Both options equal weight — no visual hierarchy difference
    },
    optionText: {
      color: colors.scrimTextPrimary,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size + 1 } });
}

function createQuizStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: 'rgba(0,0,0,0.78)',
      borderRadius: Radius.lg,
      paddingHorizontal: Space.md + 2,
      paddingVertical: Space.sm + 2,
      gap: 10,
      minWidth: 180 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6 },
    emoji: {
      fontSize: TypographyV2.sectionTitle.size },
    question: {
      color: colors.scrimTextPrimary,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      fontSize: TypographyV2.body.size,
      flex: 1 },
    optionsCol: {
      gap: 6 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: Radius.sm,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.08)' },
    optionCorrect: {
      backgroundColor: 'rgba(201,164,106,0.25)',
      borderColor: 'rgba(201,164,106,0.6)' },
    optionText: {
      color: colors.scrimTextPrimary,
      fontFamily: TypographyV2.body.fontFamily,
      fontSize: TypographyV2.meta.size + 1,
      flex: 1 },
    optionTextCorrect: {
      color: colors.antiqueGold,
      fontFamily: TypographyV2.meta.fontFamily },
    correctBadge: {
      width: 18,
      height: 18,
      borderRadius: Radius.full,
      backgroundColor: colors.antiqueGold,
      justifyContent: 'center',
      alignItems: 'center' } });
}

function createQuestionStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      borderRadius: Radius.lg,
      paddingHorizontal: Space.md + 2,
      paddingVertical: Space.sm + 2,
      minWidth: 180,
      maxWidth: '100%' },
    prompt: {
      color: colors.scrimTextPrimary,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      marginBottom: Space.sm },
    inputAffordance: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: Radius.md,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm },
    placeholder: {
      flex: 1,
      color: 'rgba(255,255,255,0.55)',
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontSize: TypographyV2.meta.size },
    sendHint: {
      width: 18,
      height: 18,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(255,255,255,0.15)',
      justifyContent: 'center',
      alignItems: 'center' } });
}

function createSliderStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: 'rgba(0,0,0,0.78)',
      borderRadius: Radius.lg,
      paddingHorizontal: Space.md + 2,
      paddingVertical: Space.sm + 2,
      minWidth: 200,
      maxWidth: '100%' },
    question: {
      color: colors.scrimTextPrimary,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      marginBottom: 10,
      textAlign: 'center' },
    sliderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10 },
    emoji: {
      fontSize: TypographyV2.display.size },
    track: {
      flex: 1,
      height: 6,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(255,255,255,0.15)',
      justifyContent: 'center' },
    trackFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '50%',
      borderRadius: Radius.full },
    thumb: {
      width: 14,
      height: 14,
      borderRadius: Radius.full,
      backgroundColor: colors.scrimTextPrimary,
      borderWidth: 2,
      position: 'absolute',
      left: '50%',
      marginLeft: -7 },
    endLabel: {
      color: 'rgba(255,255,255,0.7)',
      fontFamily: TypographyV2.display.fontFamily,
      fontSize: TypographyV2.meta.size } });
}

const countdownStyles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm + 2,
    minWidth: 150,
    maxWidth: '100%',
    alignItems: 'center' },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2 },
  label: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size - 1,
    letterSpacing: 0.3,
    textTransform: 'uppercase' },
  time: {
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: TypographyV2.screenTitle.size,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5 } });
