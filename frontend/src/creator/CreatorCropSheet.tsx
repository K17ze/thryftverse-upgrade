import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ScrollView,
  ActivityIndicator,
  Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat, FlipType, type Action } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../components/common/AppIcon';
import { Space, Radius, Stroke, Typography } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { IconGrammar } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { PressScale } from './CreatorAnimations';
import { CreatorSlider } from './controls';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Motion } from '../theme/motionTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAppTranslation } from '../i18n/useAppTranslation';



// ── Aspect ratio presets (Instagram/Snapchat-grade) ────────────────
const ASPECT_PRESETS = [
  { label: 'Original', ratio: null as number | null },
  { label: '1:1', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '16:9', ratio: 16 / 9 },
];

// ── Straighten math ─────────────────────────────────────────────────
// Largest axis-aligned rectangle of aspect `a` (w/h) inscribed in a W×H
// rectangle rotated by θ. A centered candidate with half-height y (half-width
// a·y) stays inside the rotated source iff its corners clear both edge pairs,
// which gives y ≤ W / (2·(a·cosθ + sinθ)) and y ≤ H / (2·(a·sinθ + cosθ)).
// sin uses |·| — the geometry mirrors for negative angles.
function largestInscribedRect(
  srcW: number,
  srcH: number,
  aspect: number,
  thetaRad: number ): { width: number; height: number } {
  const cos = Math.cos(thetaRad);
  const sin = Math.abs(Math.sin(thetaRad));
  const height = Math.min(srcW / (aspect * cos + sin), srcH / (aspect * sin + cos));
  return { width: aspect * height, height };
}

// ── Focal re-normalization ──────────────────────────────────────────
// Rotates a normalized point for a clockwise 90°k image rotation (y-down
// coordinates — same convention as expo's rotate and the preview transform).
function rotatePoint90(
  p: { x: number; y: number },
  quarterTurns: number ): { x: number; y: number } {
  switch ((quarterTurns % 4 + 4) % 4) {
    case 1: return { x: 1 - p.y, y: p.x };
    case 2: return { x: 1 - p.x, y: 1 - p.y };
    case 3: return { x: p.y, y: 1 - p.x };
    default: return p;
  }
}

// Maps the stored focal point through the exact confirm pipeline (flip →
// straighten-rotate → crop → rotate 90°k) so it stays on-target relative to
// the OUTPUT image. `crop` is the rect actually applied in the canvas the
// crop runs in (user rect in source space, or the centered inscribed rect in
// the rotated canvas); `rotatedW/H` are the straightened canvas dimensions
// (0 when straighten is inactive). Clamped to [0,1] — a focal outside the
// cropped region lands on the output edge.
function mapFocalToOutput(
  focal: { x: number; y: number },
  srcW: number,
  srcH: number,
  flippedH: boolean,
  flippedV: boolean,
  straightenDeg: number,
  crop: { originX: number; originY: number; width: number; height: number },
  rotatedW: number,
  rotatedH: number,
  rotation: number ): { x: number; y: number } {
  let fx = flippedH ? 1 - focal.x : focal.x;
  let fy = flippedV ? 1 - focal.y : focal.y;
  if (straightenDeg !== 0) {
    // Signed sinθ — the feature position follows the actual rotation.
    const theta = (straightenDeg * Math.PI) / 180;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const u = fx * srcW - srcW / 2;
    const v = fy * srcH - srcH / 2;
    fx = (u * cos - v * sin + rotatedW / 2 - crop.originX) / crop.width;
    fy = (u * sin + v * cos + rotatedH / 2 - crop.originY) / crop.height;
  } else {
    fx = (fx * srcW - crop.originX) / crop.width;
    fy = (fy * srcH - crop.originY) / crop.height;
  }
  const turned = rotatePoint90({ x: fx, y: fy }, Math.round(rotation / 90));
  return {
    x: Math.min(1, Math.max(0, turned.x)),
    y: Math.min(1, Math.max(0, turned.y)) };
}

interface CreatorCropSheetProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
  onCropComplete: (newUri: string, width: number, height: number) => void;
  focalPoint?: { x: number; y: number };
  onFocalPointChange?: (point: { x: number; y: number }) => void;
}

export function CreatorCropSheet({
  visible,
  imageUri,
  onClose,
  onCropComplete,
  focalPoint,
  onFocalPointChange }: CreatorCropSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { show } = useToast();
  const { spring } = useMotionConfig();
  const reduceMotion = useReducedMotion();
  const { t } = useAppTranslation('creator');
  const { width: screenWidth } = useWindowDimensions();

  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [selectedRatio, setSelectedRatio] = useState<number | null>(null);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [flippedH, setFlippedH] = useState(false);
  const [flippedV, setFlippedV] = useState(false);
  const [straighten, setStraighten] = useState(0);

  const effectiveFocal = focalPoint ?? { x: 0.5, y: 0.5 };

  // ── Shared values for crop frame ─────────────────────────────────
  const cropXSV = useSharedValue(0);
  const cropYSV = useSharedValue(0);
  const cropWSV = useSharedValue(0);
  const cropHSV = useSharedValue(0);
  const zoomSV = useSharedValue(1);
  const rotateSV = useSharedValue(0);
  const stageOpacitySV = useSharedValue(0);
  const stageScaleSV = useSharedValue(0.98);
  const mountedRef = useRef(false);

  // ── Load image dimensions on open ────────────────────────────────
  useEffect(() => {
    if (visible && imageUri) {
      RNImage.getSize(imageUri, (w: number, h: number) => {
        setImageSize({ width: w, height: h });
        setCropRect({ x: 0, y: 0, width: w, height: h });
        cropXSV.value = 0;
        cropYSV.value = 0;
        cropWSV.value = w;
        cropHSV.value = h;
      }, () => {
        show('Could not load image', 'error');
      });
    }
  }, [visible, imageUri, show, cropXSV, cropYSV, cropWSV, cropHSV]);

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

  // ── Apply aspect ratio preset ────────────────────────────────────
  const applyRatio = useCallback((ratio: number | null) => {
    haptic.selection();
    setSelectedRatio(ratio);

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
  }, [imageSize, haptic, syncCropSV]);

  // ── Drag to reposition crop frame (1:1, clamped) ─────────────────
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const isGestureActive = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isGestureActive.value = 1;
      dragStartX.value = cropXSV.value;
      dragStartY.value = cropYSV.value;
    })
    .onUpdate((e) => {
      if (!imageSize.width) return;
      const scale = imageSize.width / displayW;
      const dx = e.translationX * scale;
      const dy = e.translationY * scale;
      const maxX = imageSize.width - cropWSV.value;
      const maxY = imageSize.height - cropHSV.value;
      cropXSV.value = Math.max(0, Math.min(maxX, dragStartX.value + dx));
      cropYSV.value = Math.max(0, Math.min(maxY, dragStartY.value + dy));
    })
    .onEnd(() => {
      isGestureActive.value = 0;
      runOnJS(setCropRectFromSV)();
    });

  const setCropRectFromSV = useCallback(() => {
    setCropRect((prev) => ({
      ...prev,
      x: cropXSV.value,
      y: cropYSV.value }));
  }, [cropXSV, cropYSV]);

  // ── Pinch to resize crop frame, aspect-locked to current ratio ───
  const pinchStartW = useSharedValue(0);
  const pinchStartH = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      pinchStartW.value = cropWSV.value;
      pinchStartH.value = cropHSV.value;
      zoomSV.value = 1;
    })
    .onUpdate((e) => {
      zoomSV.value = e.scale;
      // Maintain aspect ratio: derive both dimensions from a single scale
      // factor so the clamp couples W and H together.
      const aspect = pinchStartH.value > 0 ? pinchStartW.value / pinchStartH.value : 1;
      const rawH = Math.max(40, pinchStartH.value / e.scale);
      const maxH = imageSize.height;
      const clampedH = Math.min(maxH, rawH);
      const clampedW = Math.min(imageSize.width, clampedH * aspect);
      const cx = cropXSV.value + cropWSV.value / 2;
      const cy = cropYSV.value + cropHSV.value / 2;
      cropWSV.value = clampedW;
      cropHSV.value = clampedH;
      cropXSV.value = Math.max(0, Math.min(imageSize.width - clampedW, cx - clampedW / 2));
      cropYSV.value = Math.max(0, Math.min(maxH - clampedH, cy - clampedH / 2));
    })
    .onEnd(() => {
      zoomSV.value = withSpring(1, spring.tap);
      runOnJS(setCropSizeFromSV)();
    });

  const setCropSizeFromSV = useCallback(() => {
    setCropRect({
      x: cropXSV.value,
      y: cropYSV.value,
      width: cropWSV.value,
      height: cropHSV.value });
  }, [cropXSV, cropYSV, cropWSV, cropHSV]);

  // Compose pan + pinch. Suspended while straightening — the frame is owned
  // by the inscribed-rect math until the angle returns to 0.
  const cropGesture = Gesture.Simultaneous(
    panGesture.enabled(straighten === 0),
    pinchGesture.enabled(straighten === 0) );

  // ── Rotate button with spring animation ──────────────────────────
  const handleRotate = useCallback(() => {
    haptic.medium();
    const nextRotation = rotation + 90;
    setRotation(nextRotation);
    if (reduceMotion) {
      rotateSV.value = nextRotation;
    } else {
      rotateSV.value = withSpring(nextRotation, spring.entrance);
    }
  }, [rotation, haptic, rotateSV, reduceMotion, spring]);

  // ── Flip toggles — mirror the preview and bake into the pipeline ──
  const handleFlipH = useCallback(() => {
    haptic.selection();
    setFlippedH((v) => !v);
  }, [haptic]);

  const handleFlipV = useCallback(() => {
    haptic.selection();
    setFlippedV((v) => !v);
  }, [haptic]);

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

  // What the frame actually shows: the inscribed rect while straightening,
  // otherwise the user's own crop rect.
  const displayCropRect = straightenedCropRect ?? cropRect;

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
    setStraighten(0);
  }, [straighten, haptic]);

  // ── Execute crop via expo-image-manipulator ──────────────────────
  const handleCrop = useCallback(async () => {
    if (!imageUri || !cropRect.width || !cropRect.height) return;
    setIsProcessing(true);
    haptic.medium();
    try {
      // Flip first so the crop rect matches the mirrored preview. Then
      // straighten: rotate by the slider angle (expo expands the canvas to
      // the rotated bounding box) and crop the largest centered rect of the
      // current crop aspect — the biggest axis-aligned region of that aspect
      // containing no empty corners. Without straighten the crop is the
      // user's rect in source space; the trailing 90° rotation is unchanged.
      const actions: Action[] = [];
      if (flippedH) actions.push({ flip: FlipType.Horizontal });
      if (flippedV) actions.push({ flip: FlipType.Vertical });
      // The crop rect actually applied, in the canvas the crop runs in —
      // reused below to re-normalize the stored focal point.
      let appliedCrop = { originX: 0, originY: 0, width: 0, height: 0 };
      let rotatedW = 0;
      let rotatedH = 0;
      if (straighten !== 0 && imageSize.width > 0) {
        const theta = (straighten * Math.PI) / 180;
        const sin = Math.abs(Math.sin(theta));
        const cos = Math.cos(theta);
        const inscribed = largestInscribedRect(
          imageSize.width,
          imageSize.height,
          cropRect.width / cropRect.height,
          theta );
        rotatedW = imageSize.width * cos + imageSize.height * sin;
        rotatedH = imageSize.width * sin + imageSize.height * cos;
        actions.push({ rotate: straighten });
        appliedCrop = {
          originX: Math.max(0, Math.round((rotatedW - inscribed.width) / 2)),
          originY: Math.max(0, Math.round((rotatedH - inscribed.height) / 2)),
          width: Math.round(inscribed.width),
          height: Math.round(inscribed.height) };
        actions.push({ crop: appliedCrop });
      } else {
        appliedCrop = {
          originX: Math.round(cropRect.x),
          originY: Math.round(cropRect.y),
          width: Math.round(cropRect.width),
          height: Math.round(cropRect.height) };
        actions.push({ crop: appliedCrop });
      }
      if (rotation !== 0) {
        actions.push({ rotate: rotation });
      }
      // Carry the stored focal through the exact pipeline applied above so
      // it stays on-target relative to the output image, then emit it with
      // the completion so the host persists the final focal.
      const finalFocal = mapFocalToOutput(
        focalPoint ?? { x: 0.5, y: 0.5 },
        imageSize.width,
        imageSize.height,
        flippedH,
        flippedV,
        straighten,
        appliedCrop,
        rotatedW,
        rotatedH,
        rotation );
      const result = await manipulateAsync(
        imageUri,
        actions,
        { compress: 0.92, format: SaveFormat.JPEG },
      );
      onFocalPointChange?.(finalFocal);
      onCropComplete(result.uri, result.width, result.height);
      onClose();
    } catch {
      show('Crop failed. Try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [imageUri, cropRect, imageSize, rotation, flippedH, flippedV, straighten, focalPoint, onFocalPointChange, onCropComplete, onClose, show, haptic]);

  // Focal taps are stored in SOURCE-image space (the canonical internal
  // space): the tap surface lives inside the transformed preview wrapper, so
  // RN's transform-aware hit testing delivers locationX/Y already
  // inverse-mapped into that wrapper's local (= source) coordinates.
  // handleCrop re-normalizes the stored source-space focal into OUTPUT space
  // (mapFocalToOutput) on completion, which is what the host persists.
  const handleFocalTap = useCallback((evt: { nativeEvent: { locationX: number; locationY: number } }) => {
    if (!displayW || !displayH || !onFocalPointChange) return;
    const x = Math.max(0, Math.min(1, evt.nativeEvent.locationX / displayW));
    const y = Math.max(0, Math.min(1, evt.nativeEvent.locationY / displayH));
    haptic.selection();
    onFocalPointChange({ x, y });
  }, [displayW, displayH, onFocalPointChange, haptic]);

  // ── Reset — back to the initial state (undo-lite, no history) ─────
  const handleResetAll = useCallback(() => {
    haptic.light();
    setRotation(0);
    rotateSV.value = reduceMotion ? 0 : withSpring(0, spring.entrance);
    setFlippedH(false);
    setFlippedV(false);
    setStraighten(0);
    setSelectedRatio(null);
    setCropRect({ x: 0, y: 0, width: imageSize.width, height: imageSize.height });
    syncCropSV(0, 0, imageSize.width, imageSize.height);
    onFocalPointChange?.({ x: 0.5, y: 0.5 });
  }, [haptic, rotateSV, reduceMotion, spring, imageSize, syncCropSV, onFocalPointChange]);

  // ── Animated styles ──────────────────────────────────────────────
  const stageStyle = useAnimatedStyle(() => ({
    opacity: stageOpacitySV.value,
    transform: [{ scale: stageScaleSV.value }] }));

  // Preview transform — composition order matches the confirm pipeline
  // (flip → straighten-rotate → crop → rotate 90°). RN composes transform
  // arrays CSS-style: the LAST entry is applied to the point FIRST (verified
  // against RN 0.86 Transform.cpp operator* — result = rhs × lhs — folded
  // left-to-right in BaseViewProps::resolveTransform, with row-vector point
  // application). The flips therefore run FIRST here, mirroring the
  // manipulate pipeline in handleCrop below. Do not "sort" these left to
  // right — that inverts the composition and breaks flip+rotate parity.
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotateSV.value}deg` },
      { rotate: `${straighten}deg` },
      { scaleX: flippedH ? -1 : 1 },
      { scaleY: flippedV ? -1 : 1 },
    ] }));

  // The cropped region appears on screen at the crop rect rotated by the
  // trailing 90° steps ONLY: the flip cancels (crop coords are defined on
  // the flipped canvas) and the straighten cancels (the inscribed rect is
  // defined on the straightened canvas), so rotating the overlay by the
  // 90° steps makes the visible frame wrap exactly what manipulateAsync
  // crops. RNGH inverse-maps gesture translations into this rotated space,
  // so the existing drag/pinch math keeps working unchanged.
  const cropOverlayStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotateSV.value}deg` }] }));

  // Crop frame animated position/size (display coordinates)
  const scaleToDisplay = imageSize.width > 0 ? displayW / imageSize.width : 1;

  const cropFrameStyle = useAnimatedStyle(() => ({
    left: cropXSV.value * scaleToDisplay,
    top: cropYSV.value * scaleToDisplay,
    width: cropWSV.value * scaleToDisplay,
    height: cropHSV.value * scaleToDisplay }));

  // Grid lines are faintly visible at rest (0.12) and brighten during
  // interaction (0.35). A completely invisible grid at rest is a usability
  // defect — users cannot see the crop boundary until they start dragging.
  const gridStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      isGestureActive.value,
      [0, 1],
      [0.12, 0.35],
      Extrapolation.CLAMP ) }));

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
        {/* ── Top bar: close · reset (dirty) · done ── */}
        <View style={styles.topBar}>
          <PressScale
            onPress={onClose}
            style={styles.topBtn}
            accessibilityLabel="Close crop"
            accessibilityRole="button"
          >
            <AppIcon name="close" size={22} color="textPrimary" opticalCenter={true} accessible={false} />
          </PressScale>

          {isDirty ? (
            <PressScale
              onPress={handleResetAll}
              style={styles.resetBtn}
              accessibilityLabel="Reset all edits"
              accessibilityHint="Restores the original photo, ratio, angle, flips and focal point"
              accessibilityRole="button"
            >
              <Text style={[styles.resetText, { color: colors.textSecondary }]}>
                {t('crop.reset')}
              </Text>
            </PressScale>
          ) : (
            <View style={styles.resetBtn} />
          )}

          <PressScale
            onPress={() => void handleCrop()}
            disabled={isProcessing}
            style={[styles.doneBtn, { backgroundColor: colors.brand, opacity: isProcessing ? 0.5 : 1 }]}
            accessibilityLabel="Apply crop"
            accessibilityRole="button"
            accessibilityState={{ disabled: isProcessing }}
          >
            {isProcessing
              ? <ActivityIndicator size="small" color={colors.textInverse} />
              : (
                <Text style={[styles.doneText, { color: colors.textInverse }]}>
                  {t('crop.done')}
                </Text>
              )}
          </PressScale>
        </View>

        {/* ── Media stage ── */}
        <View style={styles.mediaStage}>
          <View style={[styles.previewFrame, { width: displayW, height: displayH }]}>
            {/* Transformed image — flip → straighten → 90° steps */}
            <Reanimated.View style={[{ width: displayW, height: displayH }, imageStyle]}>
              <Image
                source={{ uri: imageUri }}
                style={{ width: displayW, height: displayH }}
                contentFit="cover"
              />
            </Reanimated.View>

            {/* Crop layer: dimming + frame (rotated by 90° steps only) */}
            <Reanimated.View
              style={[StyleSheet.absoluteFill, cropOverlayStyle]}
              pointerEvents="box-none"
            >
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute', top: 0, left: 0, right: 0,
                  height: displayCropRect.y * scaleToDisplay }]} />
                <View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute',
                  top: (displayCropRect.y + displayCropRect.height) * scaleToDisplay,
                  left: 0, right: 0, bottom: 0 }]} />
                <View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute',
                  top: displayCropRect.y * scaleToDisplay, left: 0,
                  width: displayCropRect.x * scaleToDisplay, height: displayCropRect.height * scaleToDisplay }]} />
                <View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute',
                  top: displayCropRect.y * scaleToDisplay,
                  left: (displayCropRect.x + displayCropRect.width) * scaleToDisplay,
                  right: 0, height: displayCropRect.height * scaleToDisplay }]} />
              </View>

              <GestureDetector gesture={cropGesture}>
                <Reanimated.View style={[styles.cropBorder, cropFrameStyle, { borderColor: colors.scrimTextPrimary }]}>
                  <Reanimated.View style={[styles.gridLineV, { left: '33.33%', backgroundColor: colors.scrimTextSecondary }, gridStyle]} />
                  <Reanimated.View style={[styles.gridLineV, { left: '66.66%', backgroundColor: colors.scrimTextSecondary }, gridStyle]} />
                  <Reanimated.View style={[styles.gridLineH, { top: '33.33%', backgroundColor: colors.scrimTextSecondary }, gridStyle]} />
                  <Reanimated.View style={[styles.gridLineH, { top: '66.66%', backgroundColor: colors.scrimTextSecondary }, gridStyle]} />
                  <View style={[styles.corner, styles.cornerTL, { borderColor: colors.scrimTextPrimary }]} pointerEvents="none" />
                  <View style={[styles.corner, styles.cornerTR, { borderColor: colors.scrimTextPrimary }]} pointerEvents="none" />
                  <View style={[styles.corner, styles.cornerBL, { borderColor: colors.scrimTextPrimary }]} pointerEvents="none" />
                  <View style={[styles.corner, styles.cornerBR, { borderColor: colors.scrimTextPrimary }]} pointerEvents="none" />
                </Reanimated.View>
              </GestureDetector>
            </Reanimated.View>

            {/* Focal layer: tap-to-set + draggable reticle, in source space */}
            <Reanimated.View style={[StyleSheet.absoluteFill, imageStyle]} pointerEvents="box-none">
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={handleFocalTap}
                accessibilityLabel="Focal point"
                accessibilityHint="Tap to set the focal point for this image"
                accessibilityRole="button"
              >
                <View
                  style={[
                    styles.focalReticle,
                    {
                      left: effectiveFocal.x * displayW - 10,
                      top: effectiveFocal.y * displayH - 10,
                      borderColor: colors.scrimTextPrimary },
                  ]}
                  pointerEvents="none"
                />
                <View
                  style={[
                    styles.focalReticleOuter,
                    {
                      left: effectiveFocal.x * displayW - 22,
                      top: effectiveFocal.y * displayH - 22,
                      borderColor: colors.scrimTextPrimary },
                  ]}
                  pointerEvents="none"
                />
              </Pressable>
            </Reanimated.View>
          </View>
        </View>

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
          onStraightenReset={handleStraightenReset}
        />
      </Reanimated.View>
    </View>
  );
}

// ─── Crop controls: ratio chips + tool row + straighten slider ──────────────
function CropControls({
  selectedRatio,
  applyRatio,
  rotation,
  onRotate,
  flippedH,
  flippedV,
  onFlipH,
  onFlipV,
  straighten,
  onStraightenChange,
  onStraightenReset }: {
  selectedRatio: number | null;
  applyRatio: (ratio: number | null) => void;
  rotation: number;
  onRotate: () => void;
  flippedH: boolean;
  flippedV: boolean;
  onFlipH: () => void;
  onFlipV: () => void;
  straighten: number;
  onStraightenChange: (value: number) => void;
  onStraightenReset: () => void;
}) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const [straightenTool, setStraightenTool] = useState(false);

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.ratioRow}
      >
        {ASPECT_PRESETS.map((preset) => {
          const active = selectedRatio === preset.ratio;
          return (
            <PressScale
              key={preset.label}
              onPress={() => applyRatio(preset.ratio)}
              style={[
                styles.ratioChip,
                active
                  ? { backgroundColor: colors.surfaceElevated }
                  : { backgroundColor: 'transparent' },
              ]}
              accessibilityLabel={`Aspect ratio ${preset.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[
                styles.ratioText,
                { color: active ? colors.textPrimary : colors.scrimTextSecondary },
              ]}>
                {preset.label}
              </Text>
            </PressScale>
          );
        })}
      </ScrollView>

      <View style={styles.toolRow}>
        <PressScale
          onPress={onRotate}
          style={styles.toolBtn}
          accessibilityLabel={`Rotate ${rotation} degrees`}
          accessibilityRole="button"
          hitSlop={8}
        >
          <AppIcon
            name="refresh-outline"
            size={IconGrammar.standard}
            color={rotation % 360 !== 0 ? 'brand' : 'textPrimary'}
            opticalCenter={true}
            accessible={false}
          />
        </PressScale>
        <PressScale
          onPress={onFlipH}
          style={styles.toolBtn}
          accessibilityLabel="Flip horizontally"
          accessibilityRole="button"
          accessibilityState={{ selected: flippedH }}
          hitSlop={8}
        >
          <AppIcon
            name="swap-horizontal-outline"
            size={IconGrammar.standard}
            color={flippedH ? 'brand' : 'textPrimary'}
            opticalCenter={true}
            accessible={false}
          />
        </PressScale>
        <PressScale
          onPress={onFlipV}
          style={styles.toolBtn}
          accessibilityLabel="Flip vertically"
          accessibilityRole="button"
          accessibilityState={{ selected: flippedV }}
          hitSlop={8}
        >
          <AppIcon
            name="swap-vertical-outline"
            size={IconGrammar.standard}
            color={flippedV ? 'brand' : 'textPrimary'}
            opticalCenter={true}
            accessible={false}
          />
        </PressScale>
        <PressScale
          onPress={() => { haptic.selection(); setStraightenTool((v) => !v); }}
          style={styles.toolBtn}
          accessibilityLabel="Straighten"
          accessibilityRole="button"
          accessibilityState={{ selected: straightenTool || straighten !== 0 }}
          hitSlop={8}
        >
          <AppIcon
            name="construct-outline"
            size={IconGrammar.standard}
            color={straightenTool || straighten !== 0 ? 'brand' : 'textPrimary'}
            opticalCenter={true}
            accessible={false}
          />
        </PressScale>
      </View>

      {(straightenTool || straighten !== 0) && (
        <View style={styles.straightenRow}>
          <View style={styles.straightenSlider}>
            <CreatorSlider
              value={straighten}
              min={-30}
              max={30}
              step={0.5}
              neutral={0}
              onValueChange={onStraightenChange}
              hapticAtNeutral={true}
              showNeutralTick={true}
              accessibilityLabel="Straighten"
              accessibilityHint="Slide to straighten the photo between -30 and 30 degrees"
            />
          </View>
          <Text style={[styles.straightenReadout, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {straighten.toFixed(1)}°
          </Text>
          <PressScale
            onPress={onStraightenReset}
            disabled={straighten === 0}
            style={[styles.straightenReset, { opacity: straighten === 0 ? 0.35 : 1 }]}
            accessibilityLabel="Reset straighten to zero"
            accessibilityHint="Returns the angle to 0 degrees"
            accessibilityRole="button"
            hitSlop={6}
          >
            <AppIcon name="arrow-undo-outline" size={18} color="textPrimary" opticalCenter={true} accessible={false} />
          </PressScale>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  stage: {
    ...StyleSheet.absoluteFill,
    zIndex: 300 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    height: 52 },
  topBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center' },
  resetBtn: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.sm },
  resetText: {
    fontSize: TypographyV2.body.size,
    fontFamily: Typography.family.medium },
  doneBtn: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full },
  doneText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: Typography.family.semibold },
  mediaStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center' },
  previewFrame: {
    overflow: 'hidden' },
  dimOverlay: {},
  cropBorder: {
    position: 'absolute',
    borderWidth: Stroke.emphasis },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1 },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1 },
  // Minimal corner handles — 8pt visible squares, no shadows.
  corner: {
    position: 'absolute',
    width: 8,
    height: 8 },
  cornerTL: {
    top: -4,
    left: -4,
    borderTopWidth: Stroke.emphasis,
    borderLeftWidth: Stroke.emphasis },
  cornerTR: {
    top: -4,
    right: -4,
    borderTopWidth: Stroke.emphasis,
    borderRightWidth: Stroke.emphasis },
  cornerBL: {
    bottom: -4,
    left: -4,
    borderBottomWidth: Stroke.emphasis,
    borderLeftWidth: Stroke.emphasis },
  cornerBR: {
    bottom: -4,
    right: -4,
    borderBottomWidth: Stroke.emphasis,
    borderRightWidth: Stroke.emphasis },
  focalReticle: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    borderWidth: Stroke.emphasis },
  focalReticleOuter: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: Stroke.hairline },
  ratioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  ratioChip: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    borderRadius: Radius.full },
  ratioText: {
    fontSize: TypographyV2.body.size,
    fontFamily: Typography.family.medium },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.lg,
    paddingVertical: Space.sm },
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44 },
  straightenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    paddingBottom: Space.sm,
    gap: Space.sm },
  straightenSlider: {
    flex: 1 },
  straightenReadout: {
    minWidth: 44,
    textAlign: 'right',
    fontSize: TypographyV2.meta.size,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'] },
  straightenReset: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32 },
});
