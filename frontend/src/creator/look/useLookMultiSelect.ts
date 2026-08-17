/**
 * useLookMultiSelect — Multi-select operations hook for the Look composer.
 *
 * Extracted from LookComposerScreen to separate the multi-select
 * interaction logic (drag-to-move multiple layers, alignment operations
 * in 6 directions, bulk z-order operations, overlap cycle selection)
 * from the screen's rendering orchestration.
 *
 * The hook is self-contained: it accepts the page layers, selection
 * state, and the mutation functions from CreatorContext, and returns
 * all multi-select handlers. The screen wires these to the canvas
 * gestures and the context tool rail.
 */

import { useCallback, useRef } from 'react';
import type { CreatorLayer, CreatorPage } from '../composition';
import type { useHaptic } from '../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

/**
 * Haptic instance type returned by useHaptic().
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * Mutation function signatures from CreatorContext.
 */
type UpdateLayersLiveFn = (
  updates: Array<{ id: string; x?: number; y?: number }>,
) => void;

type CommitMultiLayerTransformFn = (
  updates: Array<{ id: string; updates: Partial<CreatorLayer> }>,
  label: string,
) => void;

type ToggleLayerInSelectionFn = (layerId: string) => void;
type SelectLayerFn = (layerId: string | null) => void;
type BringSelectedToFrontFn = () => void;
type SendSelectedToBackFn = () => void;

/**
 * Alignment directions supported by the multi-select align handler.
 */
type AlignmentDirection = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

// ── Hook ─────────────────────────────────────────────────────────────

export function useLookMultiSelect(
  page: CreatorPage | undefined,
  selectedLayerIds: string[],
  multiSelectMode: boolean,
  mutations: {
    updateLayersLive: UpdateLayersLiveFn;
    commitMultiLayerTransform: CommitMultiLayerTransformFn;
    bringSelectedToFront: BringSelectedToFrontFn;
    sendSelectedToBack: SendSelectedToBackFn;
    toggleLayerInSelection: ToggleLayerInSelectionFn;
    selectLayer: SelectLayerFn;
  },
  haptic: Haptic,
) {
  const {
    updateLayersLive,
    commitMultiLayerTransform,
    bringSelectedToFront,
    sendSelectedToBack,
    toggleLayerInSelection,
    selectLayer,
  } = mutations;

  // Snapshot of selected layers' start positions at drag begin — used to
  // apply the drag delta to all peers in real-time and commit on drag end.
  const multiDragSnapshotRef = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );

  // ── Multi-select drag: move all selected layers together ──────────
  // On drag start, snapshot all selected layers' positions. During drag,
  // apply the normalized delta to peers via updateLayersLive (no history).
  // On drag end, commit all selected layers' new positions in a single
  // history entry via commitMultiLayerTransform.
  const handleMultiDragStart = useCallback(() => {
    const snapshot = new Map<string, { x: number; y: number }>();
    const layers = page?.layers ?? [];
    for (const id of selectedLayerIds) {
      const l = layers.find((x) => x.id === id);
      if (l) snapshot.set(id, { x: l.x, y: l.y });
    }
    multiDragSnapshotRef.current = snapshot;
  }, [selectedLayerIds, page]);

  const handleMultiDragUpdate = useCallback(
    (deltaXNorm: number, deltaYNorm: number) => {
      const snapshot = multiDragSnapshotRef.current;
      if (snapshot.size === 0) return;
      const updates: Array<{ id: string; x?: number; y?: number }> = [];
      for (const [id, start] of snapshot) {
        updates.push({ id, x: start.x + deltaXNorm, y: start.y + deltaYNorm });
      }
      updateLayersLive(updates);
    },
    [updateLayersLive],
  );

  const handleMultiDragCommit = useCallback(
    (deltaXNorm: number, deltaYNorm: number) => {
      const snapshot = multiDragSnapshotRef.current;
      if (snapshot.size === 0) return;
      const layers = page?.layers ?? [];
      const updates: Array<{ id: string; updates: Partial<CreatorLayer> }> = [];
      for (const [id, start] of snapshot) {
        let nx = start.x + deltaXNorm;
        let ny = start.y + deltaYNorm;
        // Snap to center
        if (Math.abs(nx - 0.5) < 0.02) nx = 0.5;
        if (Math.abs(ny - 0.5) < 0.02) ny = 0.5;
        // Safe-zone clamping
        const layer = layers.find((x) => x.id === id);
        if (layer) {
          const halfW = (layer.width * layer.scale) / 2;
          const halfH = (layer.height * layer.scale) / 2;
          const minX = Math.max(0.05, halfW);
          const maxX = Math.min(0.95, 1 - halfW);
          const minY = Math.max(0.05, halfH);
          const maxY = Math.min(0.95, 1 - halfH);
          nx = Math.max(minX, Math.min(maxX, nx));
          ny = Math.max(minY, Math.min(maxY, ny));
        }
        updates.push({ id, updates: { x: nx, y: ny } });
      }
      commitMultiLayerTransform(updates, 'Move objects');
      multiDragSnapshotRef.current = new Map();
      haptic.light();
    },
    [page, commitMultiLayerTransform, haptic],
  );

  // ── Overlap cycle selection ────────────────────────────────────────
  // Double-tap in an overlap area cycles to the next layer down in
  // z-order. We find all layers whose bounding box overlaps the tapped
  // layer, then select the next one below the current selection.
  const handleOverlapCycle = useCallback(
    (tappedLayerId: string) => {
      const layers = page?.layers ?? [];
      const visible = layers
        .filter((l) => !l.hidden)
        .sort((a, b) => b.zIndex - a.zIndex);
      const tapped = visible.find((l) => l.id === tappedLayerId);
      if (!tapped) return;
      // Bounding box of the tapped layer (normalized, center-based)
      const halfW = (tapped.width * tapped.scale) / 2;
      const halfH = (tapped.height * tapped.scale) / 2;
      const tLeft = tapped.x - halfW;
      const tRight = tapped.x + halfW;
      const tTop = tapped.y - halfH;
      const tBottom = tapped.y + halfH;
      // Find overlapping layers (below in z-order = higher index in descending sort)
      const tappedIdx = visible.findIndex((l) => l.id === tappedLayerId);
      const overlapping = visible.filter((l, i) => {
        if (i <= tappedIdx) return false;
        const lHalfW = (l.width * l.scale) / 2;
        const lHalfH = (l.height * l.scale) / 2;
        const lLeft = l.x - lHalfW;
        const lRight = l.x + lHalfW;
        const lTop = l.y - lHalfH;
        const lBottom = l.y + lHalfH;
        return tLeft < lRight && tRight > lLeft && tTop < lBottom && tBottom > lTop;
      });
      if (overlapping.length === 0) {
        // No overlap below — wrap to the topmost layer
        if (multiSelectMode) {
          toggleLayerInSelection(visible[0].id);
        } else {
          selectLayer(visible[0].id);
        }
      } else {
        const next = overlapping[0];
        if (multiSelectMode) {
          toggleLayerInSelection(next.id);
        } else {
          selectLayer(next.id);
        }
      }
      haptic.selection();
    },
    [page, multiSelectMode, toggleLayerInSelection, selectLayer, haptic],
  );

  // ── Bulk z-order handlers ─────────────────────────────────────────
  const handleMultiFront = useCallback(() => {
    haptic.light();
    bringSelectedToFront();
  }, [bringSelectedToFront, haptic]);

  const handleMultiBack = useCallback(() => {
    haptic.light();
    sendSelectedToBack();
  }, [sendSelectedToBack, haptic]);

  // ── Align all selected layers ─────────────────────────────────────
  // Computes the bounding box of the selection set and aligns each
  // layer to the specified edge/center of that box.
  const handleMultiAlign = useCallback(
    (alignment: AlignmentDirection) => {
      const layers = page?.layers ?? [];
      const selected = selectedLayerIds
        .map((id) => layers.find((l) => l.id === id))
        .filter((l): l is CreatorLayer => !!l);
      if (selected.length === 0) return;
      // Compute bounding box edges (normalized, center-based coords)
      const edges = selected.map((l) => {
        const halfW = (l.width * l.scale) / 2;
        const halfH = (l.height * l.scale) / 2;
        return {
          left: l.x - halfW,
          right: l.x + halfW,
          top: l.y - halfH,
          bottom: l.y + halfH,
          cx: l.x,
          cy: l.y,
        };
      });
      const boxLeft = Math.min(...edges.map((e) => e.left));
      const boxRight = Math.max(...edges.map((e) => e.right));
      const boxTop = Math.min(...edges.map((e) => e.top));
      const boxBottom = Math.max(...edges.map((e) => e.bottom));
      const boxCenterX = (boxLeft + boxRight) / 2;
      const boxCenterY = (boxTop + boxBottom) / 2;
      const updates: Array<{ id: string; updates: Partial<CreatorLayer> }> = [];
      for (const l of selected) {
        const halfW = (l.width * l.scale) / 2;
        const halfH = (l.height * l.scale) / 2;
        let newX = l.x;
        let newY = l.y;
        switch (alignment) {
          case 'left': newX = boxLeft + halfW; break;
          case 'center': newX = boxCenterX; break;
          case 'right': newX = boxRight - halfW; break;
          case 'top': newY = boxTop + halfH; break;
          case 'middle': newY = boxCenterY; break;
          case 'bottom': newY = boxBottom - halfH; break;
        }
        updates.push({ id: l.id, updates: { x: newX, y: newY } });
      }
      commitMultiLayerTransform(updates, `Align ${alignment}`);
      haptic.light();
    },
    [page, selectedLayerIds, commitMultiLayerTransform, haptic],
  );

  return {
    handleMultiDragStart,
    handleMultiDragUpdate,
    handleMultiDragCommit,
    handleOverlapCycle,
    handleMultiFront,
    handleMultiBack,
    handleMultiAlign,
  };
}
