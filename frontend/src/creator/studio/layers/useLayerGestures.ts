// ── Layer manipulation gestures ────────────────────────────────────
// All gesture construction + commit handlers for a single canvas layer.
// Extracted verbatim from CreatorCanvas.tsx's LayerRenderer — gesture
// definitions, snapping thresholds, multi-drag channel protocol, and
// trash-zone tracking are unchanged.
import { useCallback, useMemo, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  runOnUI,
  withSpring,
  type SharedValue } from 'react-native-reanimated';
import type { CreatorLayer } from '../../core/projectStore/composition';
import type { useHaptic } from '../../../hooks/useHaptic';
import type { useMotionConfig } from '../../../hooks/useMotionConfig';
import {
  RAD_TO_DEG,
  SNAP_THRESHOLD,
  SAFE_MARGIN,
  ROTATION_SNAP_DEG,
  SMART_GUIDE_THRESHOLD_PX,
  TRASH_ZONE_THRESHOLD,
  normaliseDegrees } from './layerGeometry';

export type MultiDragChannel = {
  dx: SharedValue<number>;
  dy: SharedValue<number>;
  active: SharedValue<number>;
  owner: SharedValue<string>;
  epoch: SharedValue<number>;
};

/** Registry of each multi-selected layer's position shared values. */
export type LayerPositionRegistry = Record<string, { x: SharedValue<number>; y: SharedValue<number> }>;

// Commit a multi-drag entirely on the UI thread: snap every peer's
// position SVs to start+delta and release the shared channel in ONE
// evaluation — atomic, so peers never paint at their pre-drag position or
// at 2× the offset. The epoch guard drops stale commits if a newer drag
// claimed the channel before this one landed.
function commitPeersOnUI(
  registry: LayerPositionRegistry,
  channel: MultiDragChannel,
  dxPx: number,
  dyPx: number,
  epoch: number,
) {
  'worklet';
  if (channel.epoch.value !== epoch) return;
  const ownerId = channel.owner.value;
  for (const id of Object.keys(registry)) {
    if (id === ownerId) continue;
    registry[id].x.value = registry[id].x.value + dxPx;
    registry[id].y.value = registry[id].y.value + dyPx;
  }
  channel.active.value = 0;
  channel.dx.value = 0;
  channel.dy.value = 0;
  channel.owner.value = '';
}

export interface LayerGestureParams {
  layer: CreatorLayer;
  siblingLayers: CreatorLayer[];
  mode: 'edit' | 'preview' | 'view';
  canvasWidth: number;
  canvasHeight: number;
  isMultiSelectActive?: boolean;
  onPress?: (layerId: string) => void;
  onTransformChange?: (layerId: string, updates: Partial<CreatorLayer>) => void;
  onDoubleTap?: (layerId: string) => void;
  onLongPress?: (layerId: string) => void;
  onContextMenu?: (layer: CreatorLayer) => void;
  onDelete?: (layerId: string) => void;
  onMultiDragStart?: () => void;
  onMultiDragCommit?: (deltaXNorm: number, deltaYNorm: number) => void;
  multiDrag?: MultiDragChannel;
  layerPosSVs?: React.MutableRefObject<LayerPositionRegistry>;
  manipulationActiveSV?: SharedValue<number>;
  onManipulationChange?: (active: boolean) => void;
  onGuidesChange?: (guides: { vertical: number[]; horizontal: number[]; center: boolean } | null) => void;
  isInTrashZoneSV?: SharedValue<number>;
  onTrashZoneEnter?: (layerId: string) => void;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scaleSV: SharedValue<number>;
  rotationSV: SharedValue<number>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  startScale: SharedValue<number>;
  startRotation: SharedValue<number>;
  liftSV: SharedValue<number>;
  wasInTrashZoneSV: SharedValue<number>;
  didSnap: SharedValue<number>;
  commitDispatchedSV: SharedValue<number>;
  lastBadgeSV: SharedValue<number>;
  setShowGuides: (show: boolean) => void;
  haptic: ReturnType<typeof useHaptic>;
  spring: ReturnType<typeof useMotionConfig>['spring'];
}

export function useLayerGestures({
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
  spring }: LayerGestureParams) {
  // Gesture feedback badges (scale % and rotation angle)
  const [gestureBadge, setGestureBadge] = useState<string | null>(null);

  const handlePress = useCallback(() => {
    if (mode === 'edit' && onPress) {
      onPress(layer.id);
    }
  }, [mode, onPress, layer.id]);

  // Commit a multi-select drag. The peer snap + channel release runs as a
  // single UI-thread evaluation (commitPeersOnUI) — atomic, no in-between
  // frame — and is epoch-guarded so a newer drag's claim can't be clobbered
  // by this stale commit. The parent then writes committed positions into
  // document state as a single history entry.
  const commitMultiDrag = useCallback((dxPx: number, dyPx: number, epoch: number) => {
    if (multiDrag && layerPosSVs) {
      runOnUI(commitPeersOnUI)(layerPosSVs.current, multiDrag, dxPx, dyPx, epoch);
    }
    onMultiDragCommit?.(dxPx / canvasWidth, dyPx / canvasHeight);
  }, [onMultiDragCommit, canvasWidth, canvasHeight, multiDrag, layerPosSVs]);

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

    // Half-dimensions in normalized coords (accounting for scale)
    const halfW = (layer.width * layer.scale) / 2;
    const halfH = (layer.height * layer.scale) / 2;

    // Snapping: center, then canvas edges (layer edge flush with canvas edge)
    if (Math.abs(normX - 0.5) < SNAP_THRESHOLD) {
      normX = 0.5; snappedX = true;
    } else if (Math.abs(normX - halfW) < SNAP_THRESHOLD) {
      normX = halfW; snappedX = true;
    } else if (Math.abs(normX - (1 - halfW)) < SNAP_THRESHOLD) {
      normX = 1 - halfW; snappedX = true;
    }
    if (Math.abs(normY - 0.5) < SNAP_THRESHOLD) {
      normY = 0.5; snappedY = true;
    } else if (Math.abs(normY - halfH) < SNAP_THRESHOLD) {
      normY = halfH; snappedY = true;
    } else if (Math.abs(normY - (1 - halfH)) < SNAP_THRESHOLD) {
      normY = 1 - halfH; snappedY = true;
    }

    // Safe-zone clamping accounting for layer width, height and scale
    const minX = Math.max(SAFE_MARGIN, halfW);
    const maxX = Math.min(1 - SAFE_MARGIN, 1 - halfW);
    const minY = Math.max(SAFE_MARGIN, halfH);
    const maxY = Math.min(1 - SAFE_MARGIN, 1 - halfH);
    normX = Math.max(minX, Math.min(maxX, normX));
    normY = Math.max(minY, Math.min(maxY, normY));

    translateX.value = withSpring(normX * canvasWidth, snappedX || snappedY ? spring.snapTo : spring.settle);
    translateY.value = withSpring(normY * canvasHeight, snappedX || snappedY ? spring.snapTo : spring.settle);

    if (snappedX || snappedY) haptic.light();
    setShowGuides(false);
    onGuidesChange?.(null);

    onTransformChange?.(layer.id, { x: normX, y: normY });
  }, [canvasWidth, canvasHeight, layer.id, layer.width, layer.height, layer.scale, onTransformChange, onGuidesChange, translateX, translateY, haptic, spring.settle, spring.snapTo, setShowGuides]);

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

    const didSnapRotation = snappedRotation !== normalisedRotation;
    scaleSV.value = withSpring(clampedScale, spring.settle);
    rotationSV.value = withSpring(snappedRotation, didSnapRotation ? spring.snapTo : spring.settle);
    onTransformChange?.(layer.id, { scale: clampedScale, rotation: snappedRotation });
  }, [layer.id, onTransformChange, scaleSV, rotationSV, haptic, spring.settle, spring.snapTo]);

  const snapTargetX = useMemo(() => {
    const halfW = (layer.width * layer.scale * canvasWidth) / 2;
    const targets: number[] = [canvasWidth / 2];
    for (const sib of siblingLayers) {
      const sHalfW = (sib.width * sib.scale * canvasWidth) / 2;
      const sCx = sib.x * canvasWidth;
      const sLeft = sCx - sHalfW;
      const sRight = sCx + sHalfW;
      targets.push(sLeft + halfW, sRight + halfW, sLeft - halfW, sRight - halfW, sCx);
    }
    return targets;
  }, [layer.width, layer.scale, canvasWidth, siblingLayers]);

  const snapTargetY = useMemo(() => {
    const halfH = (layer.height * layer.scale * canvasHeight) / 2;
    const targets: number[] = [canvasHeight / 2];
    for (const sib of siblingLayers) {
      const sHalfH = (sib.height * sib.scale * canvasHeight) / 2;
      const sCy = sib.y * canvasHeight;
      const sTop = sCy - sHalfH;
      const sBottom = sCy + sHalfH;
      targets.push(sTop + halfH, sBottom + halfH, sTop - halfH, sBottom - halfH, sCy);
    }
    return targets;
  }, [layer.height, layer.scale, canvasHeight, siblingLayers]);

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
          liftSV.value = 1;
          // Reset trash-zone tracking at the start of every drag.
          wasInTrashZoneSV.value = 0;
          if (isInTrashZoneSV) isInTrashZoneSV.value = 0;
          didSnap.value = 0;
          commitDispatchedSV.value = 0;
          // Claim the shared multi-drag channel before the JS round-trip —
          // peers start following on the very next UI frame. The epoch bump
          // invalidates any still-in-flight commit from a previous drag.
          if (isMultiSelectActive && multiDrag) {
            multiDrag.epoch.value = multiDrag.epoch.value + 1;
            multiDrag.owner.value = layer.id;
            multiDrag.dx.value = 0;
            multiDrag.dy.value = 0;
            multiDrag.active.value = 1;
          }
          // When this layer is part of an active multi-selection, do NOT
          // fire the press — the parent's press handler toggles/selects,
          // which would eject the dragged layer from the selection set
          // mid-gesture while the multi-drag channel is already claimed.
          // Tap-to-toggle still works: tapGesture owns non-drag presses.
          if (!isMultiSelectActive) {
            runOnJS(handlePress)();
          }
          runOnJS(setShowGuides)(true);
          if (isMultiSelectActive && onMultiDragStart) {
            runOnJS(onMultiDragStart)();
          }
        })
        .onUpdate((e) => {
          let newX = startX.value + e.translationX;
          let newY = startY.value + e.translationY;
          if (!isMultiSelectActive) {
            let snapped = false;
            for (let i = 0; i < snapTargetX.length; i++) {
              if (Math.abs(newX - snapTargetX[i]) < SMART_GUIDE_THRESHOLD_PX) {
                newX = snapTargetX[i];
                snapped = true;
                break;
              }
            }
            for (let i = 0; i < snapTargetY.length; i++) {
              if (Math.abs(newY - snapTargetY[i]) < SMART_GUIDE_THRESHOLD_PX) {
                newY = snapTargetY[i];
                snapped = true;
                break;
              }
            }
            if (snapped && didSnap.value === 0) {
              didSnap.value = 1;
              runOnJS(haptic.selection)();
            } else if (!snapped && didSnap.value === 1) {
              didSnap.value = 0;
            }
          }
          translateX.value = newX;
          translateY.value = newY;
          if (isMultiSelectActive && multiDrag) {
            // Peer layers follow these shared values on the UI thread —
            // no runOnJS, no React re-render per frame.
            multiDrag.dx.value = e.translationX;
            multiDrag.dy.value = e.translationY;
          } else if (isInTrashZoneSV) {
            const normY = newY / canvasHeight;
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
            if (onGuidesChange) runOnJS(onGuidesChange)(null);
            return;
          }
          if (isMultiSelectActive && multiDrag && onMultiDragCommit) {
            // Multi-select: commit via JS — commitMultiDrag snaps peers to
            // their committed positions and releases the delta atomically.
            commitDispatchedSV.value = 1;
            runOnJS(commitMultiDrag)(e.translationX, e.translationY, multiDrag.epoch.value);
            runOnJS(setShowGuides)(false);
            if (onGuidesChange) runOnJS(onGuidesChange)(null);
          } else {
            const finalX = startX.value + e.translationX;
            const finalY = startY.value + e.translationY;
            runOnJS(handlePositionCommit)(finalX, finalY);
          }
        })
        .onFinalize(() => {
          // Cancelled multi-drag (interrupted before onEnd): release the
          // shared channel so peers snap back to their base position.
          if (
            isMultiSelectActive && multiDrag
            && multiDrag.owner.value === layer.id
            && multiDrag.active.value === 1
            && commitDispatchedSV.value === 0
          ) {
            multiDrag.active.value = 0;
            multiDrag.dx.value = 0;
            multiDrag.dy.value = 0;
            multiDrag.owner.value = '';
          }
          if (manipulationActiveSV) manipulationActiveSV.value = 0;
          if (onManipulationChange) runOnJS(onManipulationChange)(false);
          // Cancelled drag (interrupted before onEnd) — hide the guide
          // overlay so stale lines don't linger.
          runOnJS(setShowGuides)(false);
          if (onGuidesChange) runOnJS(onGuidesChange)(null);
          liftSV.value = 0;
        }),
    [mode, layer.locked, layer.id, translateX, translateY, startX, startY, handlePositionCommit, isMultiSelectActive, onMultiDragStart, onMultiDragCommit, commitMultiDrag, canvasHeight, manipulationActiveSV, onManipulationChange, onGuidesChange, isInTrashZoneSV, wasInTrashZoneSV, onTrashZoneEnter, onDelete, haptic, liftSV, snapTargetX, snapTargetY, didSnap, multiDrag, commitDispatchedSV, handlePress, setShowGuides]
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(mode === 'edit' && !layer.locked)
        .onStart(() => {
          startScale.value = scaleSV.value;
          lastBadgeSV.value = -1;
          if (manipulationActiveSV) manipulationActiveSV.value = 1;
          if (onManipulationChange) runOnJS(onManipulationChange)(true);
          liftSV.value = 1;
        })
        .onUpdate((e) => {
          scaleSV.value = startScale.value * e.scale;
          // Dedupe: the badge only crosses the bridge when the displayed
          // integer changes — not on every move event.
          const pct = Math.round(scaleSV.value * 100);
          if (pct !== lastBadgeSV.value) {
            lastBadgeSV.value = pct;
            runOnJS(setGestureBadge)(`${pct}%`);
          }
        })
        .onEnd(() => {
          runOnJS(setGestureBadge)(null);
          runOnJS(handleTransformCommit)(scaleSV.value, rotationSV.value);
        })
        .onFinalize(() => {
          if (manipulationActiveSV) manipulationActiveSV.value = 0;
          if (onManipulationChange) runOnJS(onManipulationChange)(false);
          liftSV.value = 0;
        }),
    [mode, layer.locked, scaleSV, startScale, rotationSV, handleTransformCommit, manipulationActiveSV, onManipulationChange, liftSV, lastBadgeSV]
  );

  const rotationGesture = useMemo(
    () =>
      Gesture.Rotation()
        .enabled(mode === 'edit' && !layer.locked)
        .onStart(() => {
          startRotation.value = rotationSV.value;
          lastBadgeSV.value = -1;
          if (manipulationActiveSV) manipulationActiveSV.value = 1;
          if (onManipulationChange) runOnJS(onManipulationChange)(true);
          liftSV.value = 1;
        })
        .onUpdate((e) => {
          rotationSV.value = startRotation.value + e.rotation * RAD_TO_DEG;
          const deg = Math.round(normaliseDegrees(rotationSV.value));
          if (deg !== lastBadgeSV.value) {
            lastBadgeSV.value = deg;
            runOnJS(setGestureBadge)(`${deg}°`);
          }
        })
        .onEnd(() => {
          runOnJS(setGestureBadge)(null);
          runOnJS(handleTransformCommit)(scaleSV.value, rotationSV.value);
        })
        .onFinalize(() => {
          if (manipulationActiveSV) manipulationActiveSV.value = 0;
          if (onManipulationChange) runOnJS(onManipulationChange)(false);
          liftSV.value = 0;
        }),
    [mode, layer.locked, rotationSV, startRotation, scaleSV, handleTransformCommit, manipulationActiveSV, onManipulationChange, liftSV, lastBadgeSV]
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

  // ── Simultaneous gestures ──
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

  return { composedGesture, gestureBadge, handleTransformCommit };
}
