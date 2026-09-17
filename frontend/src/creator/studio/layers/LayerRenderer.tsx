// ── Layer renderer ─────────────────────────────────────────────────
// The per-layer chrome + gesture orchestrator for the creator canvas.
// Extracted from CreatorCanvas.tsx — gesture construction lives in
// useLayerGestures, temporal/keyframe evaluation in
// useLayerTemporalPlayback, alignment-guide computation in
// useSmartGuides, per-type content dispatch in renderLayerContent, and
// the numeric contracts in layerGeometry. Behavior is unchanged.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  type SharedValue } from 'react-native-reanimated';
import { Radius, Typography, IconGrammar, Stroke } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useHaptic } from '../../../hooks/useHaptic';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import type { CreatorLayer, CreatorDocument } from '../../core/projectStore/composition';
import type { ResolvedLayer } from '../../engine/evaluateScene';
import type { PlaybackClock } from '../../core/playback/PlaybackClock';
import type { ProjectedClip } from '../../core/playback';
import { getLayerCategoryLabel } from '../../../components/poster/shared/layerAccents';
import { GestureBadge } from '../../surfaces/GestureBadge';
import type { VideoPlayerRef } from './layerContentShared';
import { normaliseDegrees } from './layerGeometry';
import { renderLayerContent, getLayerRadius } from './renderLayerContent';
import { useLayerGestures, type MultiDragChannel, type LayerPositionRegistry } from './useLayerGestures';
import { useLayerTemporalPlayback } from './useLayerTemporalPlayback';
import { useSmartGuides } from './useSmartGuides';
import { SelectionHandles } from './SelectionHandles';

export type { MultiDragChannel, LayerPositionRegistry };

export interface LayerRendererProps {
  layer: CreatorLayer;
  siblingLayers: CreatorLayer[];
  documentType: CreatorDocument['type'];
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
  /** 1-based index within the multi-select set; 0 when not multi-selected. */
  multiSelectIndex?: number;
  onPress?: (layerId: string) => void;
  onTransformChange?: (layerId: string, updates: Partial<CreatorLayer>) => void;
  onDoubleTap?: (layerId: string) => void;
  onLongPress?: (layerId: string) => void;
  onMultiDragStart?: () => void;
  onMultiDragCommit?: (deltaXNorm: number, deltaYNorm: number) => void;
  /** Canvas-level multi-drag channel — the gesture owner writes its pixel
   *  delta; selected peers follow it on the UI thread. */
  multiDrag?: MultiDragChannel;
  /** Registry of selected layers' position shared values — lets the drag
   *  owner snap peers to committed positions atomically with the shared
   *  delta release. */
  layerPosSVs?: React.MutableRefObject<LayerPositionRegistry>;
  onContextMenu?: (layer: CreatorLayer) => void;
  onDuplicate?: (layerId: string) => void;
  onDelete?: (layerId: string) => void;
  onReorder?: (layerId: string, direction: 'front' | 'back') => void;
  onToggleLock?: (layerId: string) => void;
  /** Playback clock — drives temporal visibility, keyframes, video play/pause/seek. */
  playbackClock?: PlaybackClock | null;
  /** Current playback time (ms) — absolute timeline clock, used for
   *  temporal visibility (`layer.timeRange` is absolute). */
  currentTimeMs?: number;
  /** Clip-relative playback time (ms) — keyframes are authored against
   *  clip-local time, so keyframe evaluation uses this base. */
  clipTimeMs?: number;
  /** The clip active at the playhead, or null. Used by the media layer to
   *  render a truthful freeze-frame overlay when the playhead is inside the
   *  active clip's freeze window. */
  activeClip?: ProjectedClip | null;
  /** Ref populated with the active video layer's expo-video player instance. */
  videoPlayerRef?: React.MutableRefObject<VideoPlayerRef | null>;
  /** Shared value set to 1 during active gesture, 0 when idle. */
  manipulationActiveSV?: SharedValue<number>;
  onManipulationChange?: (active: boolean) => void;
  /** Sink for canvas-space alignment-guide state — the parent renders the
   *  overlay at stage level so guides aren't displaced by this layer's
   *  transform. null hides the overlay. */
  onGuidesChange?: (guides: { vertical: number[]; horizontal: number[]; center: boolean } | null) => void;
  /** Shared value set to 1 while the dragged layer is in the trash zone. */
  isInTrashZoneSV?: SharedValue<number>;
  /** Fires when the dragged layer's center enters the trash zone. */
  onTrashZoneEnter?: (layerId: string) => void;
  /** When true, media layers render without effects (compare-to-original). */
  compareOriginal?: boolean;
}

export const LayerRenderer = React.memo(function LayerRenderer({
  layer,
  siblingLayers,
  documentType,
  resolvedLayer,
  canvasWidth,
  canvasHeight,
  mode,
  isSelected,
  isMultiSelectActive,
  multiSelectIndex,
  onPress,
  onTransformChange,
  onDoubleTap,
  onLongPress,
  onMultiDragStart,
  onMultiDragCommit,
  multiDrag,
  layerPosSVs,
  onContextMenu,
  onDelete,
  playbackClock,
  currentTimeMs,
  clipTimeMs,
  activeClip,
  videoPlayerRef,
  manipulationActiveSV,
  onManipulationChange,
  onGuidesChange,
  isInTrashZoneSV,
  onTrashZoneEnter,
  compareOriginal }: LayerRendererProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const translateX = useSharedValue(layer.x * canvasWidth);
  const translateY = useSharedValue(layer.y * canvasHeight);
  const scaleSV = useSharedValue(layer.scale);
  const rotationSV = useSharedValue(layer.rotation);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);
  // During-drag: compute guides. Guide state is pushed to the parent via
  // onGuidesChange — the overlay renders at stage level in canvas space.
  const [showGuides, setShowGuides] = useState(false);
  // Throttle: last position at which smart guides were computed, to avoid
  // running the O(n²) computation + JS bridge hop on every animation frame.
  const lastGuideX = useSharedValue(0);
  const lastGuideY = useSharedValue(0);

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
  const didSnap = useSharedValue(0);
  // Multi-drag bookkeeping: whether this gesture already dispatched its
  // commit to JS (onEnd) — lets onFinalize distinguish a cancelled drag
  // (clear the shared delta) from a committed one (delta cleared after the
  // peer positions land).
  const commitDispatchedSV = useSharedValue(0);
  // Last gesture-badge value emitted to JS — dedupe so badge updates only
  // cross the bridge when the displayed number actually changes.
  const lastBadgeSV = useSharedValue(-1);

  // Register this layer's position SVs while it belongs to the multi-
  // selection so the drag owner can snap peers to committed positions.
  useEffect(() => {
    const registry = layerPosSVs?.current;
    if (!registry || !isMultiSelectActive) return;
    registry[layer.id] = { x: translateX, y: translateY };
    return () => { delete registry[layer.id]; };
  }, [layer.id, isMultiSelectActive, layerPosSVs, translateX, translateY]);

  useEffect(() => {
    if (isSelected) {
      selectionOpacity.value = withSpring(1, spring.tap);
      handleScale.value = withSpring(1, spring.tap);
      if (!reducedMotion) haptic.light();
    } else {
      selectionOpacity.value = withSpring(0, spring.settle);
      handleScale.value = withSpring(0.8, spring.settle);
    }
  }, [isSelected, selectionOpacity, handleScale, reducedMotion, haptic, spring.settle, spring.tap]);

  // Sync shared values when document state changes (undo/redo/draft load/page change).
  // Per §5.14: spring is reserved for direct manipulation, not every state sync.
  // These are programmatic position updates (undo/redo, draft load, page change),
  // not user gestures — use a quiet timing transition instead of spring bounce.
  useEffect(() => {
    if (reducedMotion) {
      // Instant snap, no animation when Reduce Motion is on
      translateX.value = withTiming(layer.x * canvasWidth, { duration: 0 });
      translateY.value = withTiming(layer.y * canvasHeight, { duration: 0 });
      scaleSV.value = withTiming(layer.scale, { duration: 0 });
      rotationSV.value = withTiming(normaliseDegrees(layer.rotation), { duration: 0 });
    } else {
      translateX.value = withSpring(layer.x * canvasWidth, spring.settle);
      translateY.value = withSpring(layer.y * canvasHeight, spring.settle);
      scaleSV.value = withSpring(layer.scale, spring.settle);
      rotationSV.value = withSpring(normaliseDegrees(layer.rotation), spring.settle);
    }
  }, [layer.x, layer.y, layer.scale, layer.rotation, canvasWidth, canvasHeight, reducedMotion, rotationSV, scaleSV, translateX, translateY, spring.settle]);

  // All manipulation gestures (pan/pinch/rotate/tap/double-tap/long-press)
  // plus their commit handlers — extracted to useLayerGestures.
  const { composedGesture, gestureBadge, handleTransformCommit } = useLayerGestures({
    layer,
    siblingLayers,
    mode,
    canvasWidth,
    canvasHeight,
    isMultiSelectActive,
    onPress,
    onTransformChange,
    onDoubleTap,
    onLongPress,
    onContextMenu,
    onDelete,
    onMultiDragStart,
    onMultiDragCommit,
    multiDrag,
    layerPosSVs,
    manipulationActiveSV,
    onManipulationChange,
    onGuidesChange,
    isInTrashZoneSV,
    onTrashZoneEnter,
    translateX,
    translateY,
    scaleSV,
    rotationSV,
    startX,
    startY,
    startScale,
    startRotation,
    liftSV,
    wasInTrashZoneSV,
    didSnap,
    commitDispatchedSV,
    lastBadgeSV,
    setShowGuides,
    haptic,
    spring,
  });

  // Temporal visibility + keyframe evaluation — two time bases preserved:
  // `currentTimeMs` (absolute) gates timeRange; `clipTimeMs` (clip-relative)
  // feeds keyframe interpolation. See useLayerTemporalPlayback.
  const { effectiveOpacity, keyframeValues } = useLayerTemporalPlayback({
    layer,
    playbackClock,
    currentTimeMs,
    clipTimeMs,
    canvasWidth,
    canvasHeight,
    reducedMotion,
    spring,
    translateX,
    scaleSV,
    rotationSV,
  });

  const animatedStyle = useAnimatedStyle(() => {
    const baseWidth = layer.width * canvasWidth;
    const baseHeight = layer.height * canvasHeight;
    const w = baseWidth * scaleSV.value;
    const h = baseHeight * scaleSV.value;
    const lift = liftSV.value;
    // Selected peers follow the multi-drag delta on the UI thread. The
    // gesture owner already includes the translation in its own SVs.
    const followPeer = multiDrag != null && isMultiSelectActive === true
      && multiDrag.active.value === 1
      && multiDrag.owner.value !== layer.id;
    const peerDX = followPeer ? multiDrag.dx.value : 0;
    const peerDY = followPeer ? multiDrag.dy.value : 0;
    return {
      position: 'absolute' as const,
      left: translateX.value + peerDX - w / 2,
      top: translateY.value + peerDY - h / 2,
      width: w,
      height: h,
      transform: [
        { rotate: `${rotationSV.value}deg` },
        { scale: 1 + lift * 0.02 },
      ],
      opacity: effectiveOpacity,
      shadowColor: colors.shadow,
      shadowOpacity: lift * 0.08,
      shadowRadius: lift * 8,
      shadowOffset: { width: 0, height: lift * 6 },
      elevation: lift * 4 };
  });

  const content = renderLayerContent(layer, layer.width * canvasWidth, layer.height * canvasHeight, playbackClock, currentTimeMs, activeClip, videoPlayerRef, siblingLayers, compareOriginal, resolvedLayer, documentType);

  // Smart alignment guides: while dragging, detect when this layer's
  // left/right/centre aligns with a sibling's left/right/centre (vertical
  // guide) or top/bottom/centre (horizontal guide). Computed on the UI
  // thread from the live translate shared values and committed sibling
  // geometry, then mirrored to JS state for rendering.
  useSmartGuides({
    layer,
    siblingLayers,
    canvasWidth,
    canvasHeight,
    showGuides,
    lastGuideX,
    lastGuideY,
    translateX,
    translateY,
    onGuidesChange,
  });

  // Per-type corner radius: media = 0 (full-bleed), text = conditional,
  // product/mention/look/vote = 8px (pill content), decorative = 0
  const layerRadius = getLayerRadius(layer);

  const selectionBorderStyle = useAnimatedStyle(() => ({
    borderWidth: Stroke.emphasis,
    borderColor: layer.locked ? colors.warning : colors.brand,
    borderRadius: layerRadius,
    opacity: selectionOpacity.value }));

  if (mode === 'edit') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <GestureDetector gesture={composedGesture}>
          <Reanimated.View
            style={[animatedStyle, { zIndex: layer.zIndex }]}
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
            {/* Multi-select index badge — 16pt circle, brand bg, white text, top-right */}
            {isSelected && isMultiSelectActive && (multiSelectIndex ?? 0) > 0 && (
              <View style={[styles.multiSelectBadge, { backgroundColor: colors.brand }]} pointerEvents="none" accessibilityLabel={`Selected ${multiSelectIndex}`} accessibilityRole="text" accessibilityHint="Shows this layer's order in the multi-selection">
                <Text style={[styles.multiSelectBadgeText, { color: colors.scrimTextPrimary }]}>{multiSelectIndex}</Text>
              </View>
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
                layerWidth={layer.width * canvasWidth}
                layerHeight={layer.height * canvasHeight}
                onCommit={() => {
                  handleTransformCommit(scaleSV.value, rotationSV.value);
                }}
              />
            )}
            {/* Locked badge */}
            {isSelected && layer.locked && (
              <View style={[styles.lockedBadge, { backgroundColor: colors.warning }]} pointerEvents="none" accessibilityLabel="Layer locked" accessibilityRole="image" accessibilityHint="Indicates this layer cannot be edited until unlocked">
                <Ionicons name="lock-closed" size={IconGrammar.badge} color={colors.scrimTextPrimary} aria-hidden={true} />
              </View>
            )}

          </Reanimated.View>
        </GestureDetector>
        {/* Gesture feedback badge — floating pill near the manipulated layer.
            Positioned by shared values so it tracks the layer center in
            real-time during drag/pinch/rotate. Visual-only — pointerEvents="none". */}
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
      accessibilityHint="Preview only; not editable in this mode"
    >
      <View style={[styles.layerInner, { borderRadius: getLayerRadius(layer) }]}>
        {content}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  layerInner: {
    width: '100%',
    height: '100%',
    overflow: 'hidden' },
  multiSelectBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 16,
    height: 16,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center' },
  multiSelectBadgeText: {
    fontSize: Typography.size.micro,
    lineHeight: 12,
    fontFamily: Typography.family.semibold,
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
