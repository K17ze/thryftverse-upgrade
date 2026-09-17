// ── Smart alignment guides ─────────────────────────────────────────
// Extracted verbatim from CreatorCanvas.tsx's LayerRenderer. While
// dragging, detects when this layer's left/right/centre aligns with a
// sibling's left/right/centre (vertical guide) or top/bottom/centre
// (horizontal guide). Computed on the UI thread from the live translate
// shared values and committed sibling geometry, then mirrored to JS
// state for rendering.
import { useCallback } from 'react';
import {
  useAnimatedReaction,
  runOnJS,
  type SharedValue } from 'react-native-reanimated';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { SMART_GUIDE_THRESHOLD_PX } from './layerGeometry';

export interface SmartGuidesParams {
  layer: CreatorLayer;
  siblingLayers: CreatorLayer[];
  canvasWidth: number;
  canvasHeight: number;
  /** Whether guide computation is active (set while a drag gesture runs). */
  showGuides: boolean;
  lastGuideX: SharedValue<number>;
  lastGuideY: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  onGuidesChange?: (guides: { vertical: number[]; horizontal: number[]; center: boolean } | null) => void;
}

export function useSmartGuides({
  layer,
  siblingLayers,
  canvasWidth,
  canvasHeight,
  showGuides,
  lastGuideX,
  lastGuideY,
  translateX,
  translateY,
  onGuidesChange }: SmartGuidesParams) {
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
      // Center guide: show when the layer's center is within 8pt of canvas center
      const centerThreshold = 8;
      const nearCenterX = Math.abs(cx - canvasWidth / 2) < centerThreshold;
      const nearCenterY = Math.abs(cy - canvasHeight / 2) < centerThreshold;
      onGuidesChange?.({
        vertical: Array.from(vertical),
        horizontal: Array.from(horizontal),
        center: nearCenterX || nearCenterY });
    },
    [layer.width, layer.height, layer.scale, canvasWidth, canvasHeight, siblingLayers, onGuidesChange],
  );

  useAnimatedReaction(
    () => ({ x: translateX.value, y: translateY.value }),
    (pos) => {
      if (showGuides) {
        // Throttle: only recompute when the layer has moved more than
        // GUIDE_THROTTLE_PX since the last computation. This avoids running
        // the O(n²) alignment check + JS bridge hop on every animation frame.
        const GUIDE_THROTTLE_PX = 2;
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
}
