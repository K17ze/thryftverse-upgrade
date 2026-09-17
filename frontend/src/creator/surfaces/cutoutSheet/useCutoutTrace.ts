/**
 * useCutoutTrace — trace state + drawing gesture cluster for
 * CreatorCutoutSheet.
 *
 * Extracted verbatim from CreatorCutoutSheet.tsx. Owns the committed
 * path list, the JS-fallback currentPath, the UI-thread trace shared
 * value + derived Skia path, the pan gesture, and the post-erase
 * effectivePaths computation. Keeps every worklet byte-identical to the
 * original.
 */
import { useState, useCallback, useRef, useMemo } from 'react';
import {
  useSharedValue,
  useDerivedValue,
  runOnJS } from 'react-native-reanimated';
import { Skia } from '@shopify/react-native-skia';
import { Gesture } from 'react-native-gesture-handler';
import { useHaptic } from '../../../hooks/useHaptic';
import { skiaAvailable, smoothPathToSkia, type SkPath } from '../../tools/drawing/drawingSkia';
import { ERASE_RADIUS, type Tool, type Point, type PathEntry } from './cutoutSheetShared';

export function useCutoutTrace(tool: Tool) {
  const haptic = useHaptic();

  const [paths, setPaths] = useState<PathEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  // UI-thread trace (Skia path): points accumulate in a shared value and
  // the live stroke renders via a derived Skia path — zero runOnJS per
  // move event. `currentPath` remains only as the no-Skia fallback.
  const tracePointsSV = useSharedValue<Point[]>([]);
  const [liveMode, setLiveMode] = useState<'keep' | 'erase'>('keep');
  const liveModeRef = useRef<'keep' | 'erase'>('keep');

  // The live trace path — rebuilt on the UI thread as points accumulate.
  // The !skiaAvailable branch is unreachable: without Skia the gesture
  // routes to the JS fallback below and nothing consumes this value.
  const liveTracePathDV = useDerivedValue(() => {
    'worklet';
    if (!skiaAvailable) return null as unknown as SkPath;
    return smoothPathToSkia(tracePointsSV.value) ?? Skia.Path.Make();
  });

  // ── Drawing gesture (trace path) ─────────────────────────────────
  // Points stay on the UI thread when Skia renders; the JS thread is
  // touched once at begin (mode capture + haptic) and once at end (commit).
  const beginTrace = useCallback((mode: 'keep' | 'erase') => {
    liveModeRef.current = mode;
    setLiveMode(mode);
  }, []);

  const commitTrace = useCallback((points: Point[]) => {
    if (points.length > 2) {
      setPaths((prev) => [...prev, { points, mode: liveModeRef.current }]);
    }
    haptic.light();
  }, [haptic]);

  const startPath = useCallback(() => {
    setCurrentPath([]);
  }, []);

  const addPoint = useCallback((x: number, y: number) => {
    setCurrentPath((prev) => [...prev, { x, y }]);
  }, []);

  const finishPath = useCallback(() => {
    const mode = tool === 'eraser' ? 'erase' : 'keep';
    setCurrentPath((curr) => {
      if (curr.length > 2) {
        setPaths((prev) => [...prev, { points: curr, mode }]);
      }
      return [];
    });
    haptic.light();
  }, [haptic, tool]);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      runOnJS(haptic.selection)();
      if (skiaAvailable) {
        tracePointsSV.value = [];
        runOnJS(beginTrace)(tool === 'eraser' ? 'erase' : 'keep');
      } else {
        runOnJS(startPath)();
      }
    })
    .onUpdate((e) => {
      'worklet';
      if (skiaAvailable) {
        const pts = tracePointsSV.value;
        tracePointsSV.value = [...pts, { x: e.absoluteX, y: e.absoluteY }];
      } else {
        runOnJS(addPoint)(e.absoluteX, e.absoluteY);
      }
    })
    .onEnd(() => {
      'worklet';
      if (skiaAvailable) {
        const pts = tracePointsSV.value;
        tracePointsSV.value = [];
        runOnJS(commitTrace)(pts);
      } else {
        runOnJS(finishPath)();
      }
    });

  // Effective keep-segments after erasing: traced points within
  // ERASE_RADIUS of any erase stroke are removed and the trace splits
  // into the surviving contiguous runs.
  const effectivePaths = useMemo(() => {
    const erasePoints = paths.flatMap((p) => (p.mode === 'erase' ? p.points : []));
    const segments: Point[][] = [];
    for (const entry of paths) {
      if (entry.mode !== 'keep') continue;
      if (erasePoints.length === 0) {
        segments.push(entry.points);
        continue;
      }
      let run: Point[] = [];
      for (const pt of entry.points) {
        const erased = erasePoints.some(
          (e) => (e.x - pt.x) * (e.x - pt.x) + (e.y - pt.y) * (e.y - pt.y) <= ERASE_RADIUS * ERASE_RADIUS,
        );
        if (erased) {
          if (run.length > 1) segments.push(run);
          run = [];
        } else {
          run.push(pt);
        }
      }
      if (run.length > 1) segments.push(run);
    }
    return segments;
  }, [paths]);

  return {
    paths,
    setPaths,
    currentPath,
    tracePointsSV,
    liveMode,
    liveTracePathDV,
    panGesture,
    effectivePaths };
}
