/**
 * useDrawingStrokes — stroke lifecycle, live preview and undo/redo history
 * for the drawing workspace.
 *
 * PERFORMANCE ARCHITECTURE (Snap/IG drawing grammar)
 *   Non-emoji brushes run entirely on the UI thread during a stroke:
 *   points accumulate in `livePointsSV`, and `livePathSV` rebuilds the
 *   smoothed Skia path inside a derived value — no per-point runOnJS
 *   crossings and no React re-renders mid-stroke. The JS thread is touched
 *   exactly twice per stroke: once at begin (mount the live renderer with
 *   the fixed brush meta) and once at end (commit the full point array).
 *   The emoji brush keeps the legacy JS accumulation because its stamp
 *   layout is computed in JS and rendered through the RN-Text overlay.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  runOnJS } from 'react-native-reanimated';
import { Skia } from '@shopify/react-native-skia';
import type { BrushType, EmojiBrushConfig, Stroke } from './DrawingTypes';
import { skiaAvailable, smoothPathToSkia, type SkPath } from './drawingSkia';

export const MAX_UNDO_LEVELS = 50;
let strokeIdCounter = 0;

interface UseDrawingStrokesParams {
  brushType: BrushType;
  brushColor: string;
  brushSize: number;
  brushOpacity: number;
  emojiBrush: EmojiBrushConfig;
}

export function useDrawingStrokes({
  brushType,
  brushColor,
  brushSize,
  brushOpacity,
  emojiBrush,
}: UseDrawingStrokesParams) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);

  // ── UI-thread live stroke (non-emoji brushes) ──
  const livePointsSV = useSharedValue<{ x: number; y: number }[]>([]);
  // Empty-path fallback keeps the derived value non-nullable — an empty
  // Skia path draws nothing, and AnimatedProp<PathDef> rejects null. The
  // !skiaAvailable branch is unreachable in practice: the live renderer
  // only mounts via the Skia-gated gesture canvas — but Skia.Path.Make
  // must not run if the module probe failed.
  const livePathSV = useDerivedValue(() => {
    'worklet';
    if (!skiaAvailable) return null as unknown as SkPath;
    return smoothPathToSkia(livePointsSV.value) ?? Skia.Path.Make();
  });
  // Fixed brush meta for the in-progress stroke — set once at gesture begin
  // so the live renderer mounts the right per-brush paint structure.
  const liveMetaRef = useRef<Stroke | null>(null);
  const [liveMeta, setLiveMeta] = useState<Stroke | null>(null);

  // ── Emoji live stroke (JS accumulation — stamps lay out in JS) ──
  const currentPointsRef = useRef<{ x: number; y: number }[]>([]);
  const currentMetaRef = useRef<Stroke | null>(null);
  const renderTickSV = useSharedValue(0);
  const lastRenderRef = useRef(0);
  const [liveStroke, setLiveStroke] = useState<Stroke | null>(null);

  const throttledRender = useCallback((tick: number) => {
    const now = Date.now();
    if (now - lastRenderRef.current > 16 || tick === -1) {
      lastRenderRef.current = now;
      if (tick === -1) {
        setLiveStroke(null);
      } else if (currentMetaRef.current && currentPointsRef.current.length > 0) {
        setLiveStroke({
          ...currentMetaRef.current,
          points: currentPointsRef.current });
      }
    }
  }, []);

  useAnimatedReaction(
    () => renderTickSV.value,
    (tick) => {
      runOnJS(throttledRender)(tick);
    },
  );

  // ── Stroke lifecycle — JS side, called via runOnJS ──
  // Emoji path: per-point accumulation for the stamp overlay.
  const startStroke = useCallback(
    (x: number, y: number) => {
      currentPointsRef.current = [{ x, y }];
      currentMetaRef.current = {
        id: `stroke_${Date.now()}_${++strokeIdCounter}`,
        brushType,
        color: brushType === 'eraser' ? '#000000' : brushColor,
        size: brushSize,
        opacity: brushOpacity / 100,
        points: [],
        emojiConfig: brushType === 'emoji' ? { ...emojiBrush } : undefined };
      renderTickSV.value = renderTickSV.value + 1;
    },
    [brushType, brushColor, brushSize, brushOpacity, emojiBrush, renderTickSV],
  );

  const addPoint = useCallback(
    (x: number, y: number) => {
      if (!currentMetaRef.current) return;
      const pts = currentPointsRef.current;
      const last = pts[pts.length - 1];
      const dx = x - last.x;
      const dy = y - last.y;
      if (dx * dx + dy * dy > 4) {
        pts.push({ x, y });
        renderTickSV.value = renderTickSV.value + 1;
      }
    },
    [renderTickSV],
  );

  const commitStroke = useCallback(() => {
    if (!currentMetaRef.current) return;
    const stroke: Stroke = {
      ...currentMetaRef.current,
      points: currentPointsRef.current };
    if (stroke.points.length > 0) {
      setStrokes((prev) => [...prev, stroke].slice(-MAX_UNDO_LEVELS));
      setRedoStack([]);
    }
    currentPointsRef.current = [];
    currentMetaRef.current = null;
    renderTickSV.value = -1;
  }, [renderTickSV]);

  // Non-emoji path: one JS crossing at begin to mount the live renderer,
  // one at end to commit the UI-thread-accumulated points.
  const beginLiveStroke = useCallback(() => {
    const meta: Stroke = {
      id: `stroke_${Date.now()}_${++strokeIdCounter}`,
      brushType,
      color: brushType === 'eraser' ? '#000000' : brushColor,
      size: brushSize,
      opacity: brushOpacity / 100,
      points: [] };
    liveMetaRef.current = meta;
    setLiveMeta(meta);
  }, [brushType, brushColor, brushSize, brushOpacity]);

  const commitLiveStroke = useCallback(
    (points: { x: number; y: number }[]) => {
      const meta = liveMetaRef.current;
      liveMetaRef.current = null;
      setLiveMeta(null);
      if (!meta || points.length === 0) return;
      setStrokes((prev) => [...prev, { ...meta, points }].slice(-MAX_UNDO_LEVELS));
      setRedoStack([]);
    },
    [],
  );

  // ── Pan gesture — UI thread; emoji detours to the JS path above ──
  const isEmoji = brushType === 'emoji';
  const drawGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(0)
        .onBegin((e) => {
          'worklet';
          if (isEmoji) {
            runOnJS(startStroke)(e.x, e.y);
            return;
          }
          livePointsSV.value = [{ x: e.x, y: e.y }];
          runOnJS(beginLiveStroke)();
        })
        .onChange((e) => {
          'worklet';
          if (isEmoji) {
            runOnJS(addPoint)(e.x, e.y);
            return;
          }
          const pts = livePointsSV.value;
          const last = pts[pts.length - 1];
          if (!last) return;
          const dx = e.x - last.x;
          const dy = e.y - last.y;
          if (dx * dx + dy * dy > 4) {
            livePointsSV.value = [...pts, { x: e.x, y: e.y }];
          }
        })
        .onEnd(() => {
          'worklet';
          if (isEmoji) {
            runOnJS(commitStroke)();
            return;
          }
          const pts = livePointsSV.value;
          livePointsSV.value = [];
          runOnJS(commitLiveStroke)(pts);
        })
        .onFinalize(() => {
          'worklet';
          if (isEmoji) {
            runOnJS(commitStroke)();
            return;
          }
          const pts = livePointsSV.value;
          livePointsSV.value = [];
          runOnJS(commitLiveStroke)(pts);
        }),
    [
      isEmoji,
      startStroke,
      addPoint,
      commitStroke,
      beginLiveStroke,
      commitLiveStroke,
      livePointsSV,
    ],
  );

  // ── History ──
  const handleUndo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setStrokes((s) => [...s, last]);
      return prev.slice(0, -1);
    });
  }, []);

  /** Clears all stroke state — used when the workspace is hidden. */
  const resetStrokes = useCallback(() => {
    setStrokes([]);
    setRedoStack([]);
    setLiveStroke(null);
    setLiveMeta(null);
    liveMetaRef.current = null;
    livePointsSV.value = [];
    currentPointsRef.current = [];
    currentMetaRef.current = null;
  }, [livePointsSV]);

  return {
    strokes,
    setStrokes,
    redoStack,
    setRedoStack,
    liveStroke,
    liveMeta,
    livePathSV,
    drawGesture,
    handleUndo,
    handleRedo,
    resetStrokes,
  };
}
