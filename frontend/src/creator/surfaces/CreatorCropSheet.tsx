import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Image as RNImage } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { Motion } from '../../theme/motionTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming } from 'react-native-reanimated';
import {
  largestInscribedRect,
  type CropDestination,
  type CropEditSnapshot } from './cropSheet/cropSheetShared';
import { cropSheetStyles as styles } from './cropSheet/cropSheetStyles';
import { CropTopBar } from './cropSheet/CropTopBar';
import { CropStage } from './cropSheet/CropStage';
import { CropControls } from './cropSheet/CropControls';
import { useCropGestures } from './cropSheet/useCropGestures';
import { useCropConfirm } from './cropSheet/useCropConfirm';

interface CreatorCropSheetProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
  onCropComplete: (newUri: string, width: number, height: number) => void;
  focalPoint?: { x: number; y: number };
  onFocalPointChange?: (point: { x: number; y: number }) => void;
  /**
   * Destination surface for safe-zone preview. When provided and the user
   * toggles safe zones on, the crop frame overlays the platform UI regions
   * that will obscure the media (header, actions, caption) so the user can
   * compose around them. Truthful, based on documented platform chrome.
   */
  destination?: CropDestination;
}

export function CreatorCropSheet({
  visible,
  imageUri,
  onClose,
  onCropComplete,
  focalPoint,
  onFocalPointChange,
  destination }: CreatorCropSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { show } = useToast();
  const { spring } = useMotionConfig();
  const reduceMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();

  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [selectedRatio, setSelectedRatio] = useState<number | null>(null);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [rotation, setRotation] = useState(0);
  const [flippedH, setFlippedH] = useState(false);
  const [flippedV, setFlippedV] = useState(false);
  const [straighten, setStraighten] = useState(0);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [safeZonesOn, setSafeZonesOn] = useState(false);

  // Focal point is sheet-local draft state (source-image space). Tapping
  // the preview moves the marker without touching the host document —
  // previously onFocalPointChange fired per-tap, so cancelling the sheet
  // leaked a focal edit AND the leaked value was in source space while
  // confirm writes output space (a silent coordinate mismatch). The host
  // only persists on confirm via mapFocalToOutput in handleCrop.
  const [draftFocal, setDraftFocal] = useState<{ x: number; y: number } | null>(null);
  const effectiveFocal = draftFocal ?? focalPoint ?? { x: 0.5, y: 0.5 };

  // ── Shared values for crop frame ─────────────────────────────────
  const cropXSV = useSharedValue(0);
  const cropYSV = useSharedValue(0);
  const cropWSV = useSharedValue(0);
  const cropHSV = useSharedValue(0);
  const rotateSV = useSharedValue(0);
  const stageOpacitySV = useSharedValue(0);
  const stageScaleSV = useSharedValue(0.98);
  const mountedRef = useRef(false);

  // ── Shared values for image zoom/pan (Instagram-style) ───────────
  const imageZoomSV = useSharedValue(1);
  const imagePanXSV = useSharedValue(0);
  const imagePanYSV = useSharedValue(0);

  // ── Undo history ─────────────────────────────────────────────────
  // Snapshots cover everything the sheet owns that lands in the crop:
  // crop frame, image zoom/pan, rotation, flips, straighten, ratio.
  // (focalPoint is parent-owned via onFocalPointChange — excluded.)
  // Discrete actions push at press; gestures/sliders capture at start
  // and push at commit only when something actually changed.
  const undoStackRef = useRef<CropEditSnapshot[]>([]);
  const preEditSnapshotRef = useRef<CropEditSnapshot | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  // The crop frame's source of truth is the shared values (React state
  // flushes asynchronously after gesture commits), so snapshots read the
  // SVs directly — correct at both gesture boundaries and discrete presses.
  const captureSnapshot = useCallback((): CropEditSnapshot => ({
    cropRect: {
      x: cropXSV.value,
      y: cropYSV.value,
      width: cropWSV.value,
      height: cropHSV.value,
    },
    rotation,
    flippedH,
    flippedV,
    straighten,
    selectedRatio,
    imageZoom: imageZoomSV.value,
    imagePanX: imagePanXSV.value,
    imagePanY: imagePanYSV.value,
  }), [rotation, flippedH, flippedV, straighten, selectedRatio,
    cropXSV, cropYSV, cropWSV, cropHSV, imageZoomSV, imagePanXSV, imagePanYSV]);

  const snapshotsEqual = (a: CropEditSnapshot, b: CropEditSnapshot): boolean =>
    a.rotation === b.rotation
    && a.flippedH === b.flippedH
    && a.flippedV === b.flippedV
    && a.straighten === b.straighten
    && a.selectedRatio === b.selectedRatio
    && a.imageZoom === b.imageZoom
    && a.imagePanX === b.imagePanX
    && a.imagePanY === b.imagePanY
    && a.cropRect.x === b.cropRect.x
    && a.cropRect.y === b.cropRect.y
    && a.cropRect.width === b.cropRect.width
    && a.cropRect.height === b.cropRect.height;

  const pushUndo = useCallback((snapshot: CropEditSnapshot) => {
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();
    setCanUndo(true);
  }, []);

  // Capture pre-edit state at gesture/drag start (JS thread via runOnJS).
  const beginUndoTransaction = useCallback(() => {
    preEditSnapshotRef.current = captureSnapshot();
  }, [captureSnapshot]);

  // Push the captured snapshot only when the gesture actually changed state.
  const commitUndoTransaction = useCallback(() => {
    const pre = preEditSnapshotRef.current;
    preEditSnapshotRef.current = null;
    if (pre && !snapshotsEqual(pre, captureSnapshot())) pushUndo(pre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureSnapshot, pushUndo]);



  // ── Load image dimensions on open ────────────────────────────────
  const loadImageSize = useCallback((uri: string) => {
    setImageLoadFailed(false);
    RNImage.getSize(uri, (w: number, h: number) => {
      setImageSize({ width: w, height: h });
      setCropRect({ x: 0, y: 0, width: w, height: h });
      cropXSV.value = 0;
      cropYSV.value = 0;
      cropWSV.value = w;
      cropHSV.value = h;
      imageZoomSV.value = 1;
      imagePanXSV.value = 0;
      imagePanYSV.value = 0;
    }, () => {
      setImageLoadFailed(true);
    });
  }, [cropXSV, cropYSV, cropWSV, cropHSV, imageZoomSV, imagePanXSV, imagePanYSV]);

  useEffect(() => {
    if (visible && imageUri) {
      // A new editing session starts with a clean undo stack — stale
      // snapshots from a previous image must never apply here. The draft
      // focal resets too: it is sheet-local state that must not carry
      // across sessions (the sheet stays mounted after close).
      undoStackRef.current = [];
      preEditSnapshotRef.current = null;
      setCanUndo(false);
      setDraftFocal(null);
      loadImageSize(imageUri);
    }
  }, [visible, imageUri, loadImageSize]);

  // ── Stage entrance/exit ──────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
      if (reduceMotion) {
        stageOpacitySV.value = 1;
        stageScaleSV.value = 1;
      } else {
        stageOpacitySV.value = withTiming(1, { duration: 220, easing: Motion.easing.entrance });
        stageScaleSV.value = withTiming(1, { duration: 220, easing: Motion.easing.entrance });
      }
    } else if (mountedRef.current) {
      if (reduceMotion) {
        stageOpacitySV.value = 0;
      } else {
        stageOpacitySV.value = withTiming(0, { duration: 180 });
        stageScaleSV.value = withTiming(0.98, { duration: 180 });
      }
    }
  }, [visible, reduceMotion, stageOpacitySV, stageScaleSV]);

  // ── Calculate display dimensions ─────────────────────────────────
  const displayW = screenWidth - Space.md * 2;
  const displayH = imageSize.width > 0
    ? displayW * (imageSize.height / imageSize.width)
    : displayW;

  // ── Sync shared values when cropRect changes from ratio selection ──
  const syncCropSV = useCallback((x: number, y: number, w: number, h: number) => {
    if (reduceMotion) {
      cropXSV.value = x;
      cropYSV.value = y;
      cropWSV.value = w;
      cropHSV.value = h;
    } else {
      cropXSV.value = withSpring(x, spring.entrance);
      cropYSV.value = withSpring(y, spring.entrance);
      cropWSV.value = withSpring(w, spring.entrance);
      cropHSV.value = withSpring(h, spring.entrance);
    }
  }, [reduceMotion, cropXSV, cropYSV, cropWSV, cropHSV, spring]);

  // ── Undo: restore the last snapshot across state + shared values ──
  const handleUndo = useCallback(() => {
    const snap = undoStackRef.current.pop();
    if (!snap) return;
    haptic.light();
    setCropRect(snap.cropRect);
    syncCropSV(snap.cropRect.x, snap.cropRect.y, snap.cropRect.width, snap.cropRect.height);
    setRotation(snap.rotation);
    rotateSV.value = reduceMotion ? snap.rotation : withSpring(snap.rotation, spring.entrance);
    setFlippedH(snap.flippedH);
    setFlippedV(snap.flippedV);
    setStraighten(snap.straighten);
    setSelectedRatio(snap.selectedRatio);
    imageZoomSV.value = snap.imageZoom;
    imagePanXSV.value = snap.imagePanX;
    imagePanYSV.value = snap.imagePanY;
    setCanUndo(undoStackRef.current.length > 0);
  }, [haptic, syncCropSV, rotateSV, reduceMotion, spring, imageZoomSV, imagePanXSV, imagePanYSV]);

  // ── Apply aspect ratio preset ────────────────────────────────────
  const applyRatio = useCallback((ratio: number | null) => {
    haptic.selection();
    pushUndo(captureSnapshot());
    setSelectedRatio(ratio);
    imageZoomSV.value = 1;
    imagePanXSV.value = 0;
    imagePanYSV.value = 0;

    if (!imageSize.width || !ratio) {
      setCropRect({ x: 0, y: 0, width: imageSize.width, height: imageSize.height });
      syncCropSV(0, 0, imageSize.width, imageSize.height);
      return;
    }

    const imgRatio = imageSize.width / imageSize.height;
    let cropW: number, cropH: number;
    if (imgRatio > ratio) {
      cropH = imageSize.height;
      cropW = cropH * ratio;
    } else {
      cropW = imageSize.width;
      cropH = cropW / ratio;
    }
    const x = (imageSize.width - cropW) / 2;
    const y = (imageSize.height - cropH) / 2;
    setCropRect({ x, y, width: cropW, height: cropH });
    syncCropSV(x, y, cropW, cropH);
  }, [imageSize, haptic, syncCropSV, imageZoomSV, imagePanXSV, imagePanYSV, pushUndo, captureSnapshot]);

  // ── Drag + pinch gestures (extracted; worklets live in the hook) ──
  const { cropGesture, isGestureActive } = useCropGestures({
    cropXSV,
    cropYSV,
    cropWSV,
    cropHSV,
    imageZoomSV,
    imagePanXSV,
    imagePanYSV,
    imageSize,
    displayW,
    displayH,
    straighten,
    spring,
    setCropRect,
    beginUndoTransaction,
    commitUndoTransaction });

  // ── Rotate button with spring animation ──────────────────────────
  const handleRotate = useCallback(() => {
    haptic.medium();
    pushUndo(captureSnapshot());
    const nextRotation = rotation + 90;
    setRotation(nextRotation);
    if (reduceMotion) {
      rotateSV.value = nextRotation;
    } else {
      rotateSV.value = withSpring(nextRotation, spring.entrance);
    }
  }, [rotation, haptic, rotateSV, reduceMotion, spring, pushUndo, captureSnapshot]);

  // ── Flip toggles — mirror the preview and bake into the pipeline ──
  const handleFlipH = useCallback(() => {
    haptic.selection();
    pushUndo(captureSnapshot());
    setFlippedH((v) => !v);
  }, [haptic, pushUndo, captureSnapshot]);

  const handleFlipV = useCallback(() => {
    haptic.selection();
    pushUndo(captureSnapshot());
    setFlippedV((v) => !v);
  }, [haptic, pushUndo, captureSnapshot]);

  // ── Straighten — live preview + inscribed-rect ownership ──────────
  // While the angle is non-zero the crop frame is owned by the math: it
  // shows the largest axis-aligned rect of the current crop aspect
  // inscribed in the θ-rotated canvas — exactly the region confirm crops.
  const straightenedCropRect = useMemo(() => {
    if (straighten === 0 || !imageSize.width || !cropRect.width || !cropRect.height) return null;
    const inscribed = largestInscribedRect(
      imageSize.width,
      imageSize.height,
      cropRect.width / cropRect.height,
      (straighten * Math.PI) / 180 );
    return {
      x: (imageSize.width - inscribed.width) / 2,
      y: (imageSize.height - inscribed.height) / 2,
      width: inscribed.width,
      height: inscribed.height };
  }, [straighten, imageSize, cropRect]);

  const prevStraightenRef = useRef(0);
  useEffect(() => {
    const prev = prevStraightenRef.current;
    prevStraightenRef.current = straighten;
    if (!imageSize.width) return;
    if (straightenedCropRect) {
      // Track the inscribed rect directly (no spring) so the frame stays
      // in lockstep with the dim overlays while the slider moves.
      cropXSV.value = straightenedCropRect.x;
      cropYSV.value = straightenedCropRect.y;
      cropWSV.value = straightenedCropRect.width;
      cropHSV.value = straightenedCropRect.height;
    } else if (prev !== 0) {
      // Leaving straighten — hand the frame back to the user's crop rect.
      syncCropSV(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    }
  }, [straighten, straightenedCropRect, cropRect, imageSize, syncCropSV, cropXSV, cropYSV, cropWSV, cropHSV]);

  const handleStraightenChange = useCallback((value: number) => {
    setStraighten(value);
  }, []);

  const handleStraightenReset = useCallback(() => {
    if (straighten === 0) return;
    haptic.selection();
    pushUndo(captureSnapshot());
    setStraighten(0);
  }, [straighten, haptic, pushUndo, captureSnapshot]);

  // ── Confirm pipeline (extracted — flip → straighten → crop → 90°) ──
  const { handleCrop, isProcessing } = useCropConfirm({
    imageUri,
    cropRect,
    imageSize,
    rotation,
    flippedH,
    flippedV,
    straighten,
    focalPoint,
    draftFocal,
    onFocalPointChange,
    onCropComplete,
    onClose,
    show,
    haptic,
    imageZoomSV,
    imagePanXSV,
    imagePanYSV,
    displayW });

  // Focal taps are stored in SOURCE-image space (the canonical internal
  // space): the tap surface lives inside the transformed preview wrapper, so
  // RN's transform-aware hit testing delivers locationX/Y already
  // inverse-mapped into that wrapper's local (= source) coordinates.
  // handleCrop re-normalizes the stored source-space focal into OUTPUT space
  // (mapFocalToOutput) on completion, which is what the host persists.
  const handleFocalTap = useCallback((evt: { nativeEvent: { locationX: number; locationY: number } }) => {
    if (!displayW || !displayH) return;
    const x = Math.max(0, Math.min(1, evt.nativeEvent.locationX / displayW));
    const y = Math.max(0, Math.min(1, evt.nativeEvent.locationY / displayH));
    haptic.selection();
    setDraftFocal({ x, y });
  }, [displayW, displayH, haptic]);

  // ── Reset — back to the initial state (undoable, like any edit) ───
  const handleResetAll = useCallback(() => {
    haptic.light();
    pushUndo(captureSnapshot());
    setRotation(0);
    rotateSV.value = reduceMotion ? 0 : withSpring(0, spring.entrance);
    setFlippedH(false);
    setFlippedV(false);
    setStraighten(0);
    setSelectedRatio(null);
    setCropRect({ x: 0, y: 0, width: imageSize.width, height: imageSize.height });
    syncCropSV(0, 0, imageSize.width, imageSize.height);
    imageZoomSV.value = 1;
    imagePanXSV.value = 0;
    imagePanYSV.value = 0;
    setDraftFocal({ x: 0.5, y: 0.5 });
  }, [haptic, rotateSV, reduceMotion, spring, imageSize, syncCropSV, imageZoomSV, imagePanXSV, imagePanYSV, pushUndo, captureSnapshot]);

  // ── Animated styles ──────────────────────────────────────────────
  const stageStyle = useAnimatedStyle(() => ({
    opacity: stageOpacitySV.value,
    transform: [{ scale: stageScaleSV.value }] }));

  const isDirty = rotation !== 0 || flippedH || flippedV || straighten !== 0
    || selectedRatio !== null
    || (imageSize.width > 0 && (
      cropRect.x !== 0 || cropRect.y !== 0
      || cropRect.width !== imageSize.width || cropRect.height !== imageSize.height));

  if (!visible && !mountedRef.current) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Reanimated.View
        style={[
          styles.stage,
          { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom },
          stageStyle,
        ]}
      >
        {/* ── Top bar: close · undo · reset (dirty) · done ── */}
        <CropTopBar
          onClose={onClose}
          onUndo={handleUndo}
          canUndo={canUndo}
          isDirty={isDirty}
          onResetAll={handleResetAll}
          onDone={() => void handleCrop()}
          isProcessing={isProcessing}
          imageLoadFailed={imageLoadFailed}
        />

        {/* ── Media stage ── */}
        <CropStage
          imageUri={imageUri}
          imageLoadFailed={imageLoadFailed}
          onRetry={() => { if (imageUri) loadImageSize(imageUri); }}
          displayW={displayW}
          displayH={displayH}
          imageSize={imageSize}
          cropXSV={cropXSV}
          cropYSV={cropYSV}
          cropWSV={cropWSV}
          cropHSV={cropHSV}
          rotateSV={rotateSV}
          imageZoomSV={imageZoomSV}
          imagePanXSV={imagePanXSV}
          imagePanYSV={imagePanYSV}
          isGestureActive={isGestureActive}
          straighten={straighten}
          flippedH={flippedH}
          flippedV={flippedV}
          cropGesture={cropGesture}
          effectiveFocal={effectiveFocal}
          onFocalTap={handleFocalTap}
          safeZonesOn={safeZonesOn}
          destination={destination}
        />

        {/* ── Ratio presets + tools + straighten ── */}
        <CropControls
          selectedRatio={selectedRatio}
          applyRatio={applyRatio}
          rotation={rotation}
          onRotate={handleRotate}
          flippedH={flippedH}
          flippedV={flippedV}
          onFlipH={handleFlipH}
          onFlipV={handleFlipV}
          straighten={straighten}
          onStraightenChange={handleStraightenChange}
          onStraightenDragState={(dragging) => {
            if (dragging) beginUndoTransaction();
            else commitUndoTransaction();
          }}
          onStraightenReset={handleStraightenReset}
          destination={destination}
          safeZonesOn={safeZonesOn}
          onToggleSafeZones={() => setSafeZonesOn((v) => !v)}
        />
      </Reanimated.View>
    </View>
  );
}
