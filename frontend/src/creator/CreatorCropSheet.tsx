import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ScrollView,
  Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat, FlipType, type Action } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../components/common/AppIcon';
import { Space, Radius, FontFamily, Stroke, Typography } from '../theme/designTokens';
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
  withDelay,
  withSequence,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
  cancelAnimation } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';



// ── Aspect ratio presets (Instagram/Snapchat-grade) ────────────────
const ASPECT_PRESETS = [
  { label: 'Original', ratio: null as number | null },
  { label: '1:1', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '2:3', ratio: 2 / 3 },
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

type CropMode = 'crop' | 'focal';

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
  const { width: screenWidth } = useWindowDimensions();

  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [selectedRatio, setSelectedRatio] = useState<number | null>(null);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [flippedH, setFlippedH] = useState(false);
  const [flippedV, setFlippedV] = useState(false);
  const [straighten, setStraighten] = useState(0);
  const [cropMode, setCropMode] = useState<CropMode>('crop');

  const effectiveFocal = focalPoint ?? { x: 0.5, y: 0.5 };

  // ── Spring-driven shared values for crop frame ──────────────────
  // These animate the crop frame position/size with springs so that
  // ratio changes and drag-release settle naturally.
  const cropXSV = useSharedValue(0);
  const cropYSV = useSharedValue(0);
  const cropWSV = useSharedValue(0);
  const cropHSV = useSharedValue(0);
  const zoomSV = useSharedValue(1);
  const rotateSV = useSharedValue(0);
  const gridOpacitySV = useSharedValue(0);
  const sheetYSV = useSharedValue(screenWidth * 1.2);
  const backdropOpacitySV = useSharedValue(0);
  const mountedRef = useRef(false);

  // ── Ratio tab underline indicator (spring-animated, brand color) ──
  const ratioTabLayouts = useRef<Map<string, { x: number; width: number }>>(new Map());
  const ratioUnderlineXSV = useSharedValue(0);
  const ratioUnderlineWSV = useSharedValue(0);

  // ── Load image dimensions on open ────────────────────────────────
  useEffect(() => {
    if (visible && imageUri) {
      RNImage.getSize(imageUri, (w: number, h: number) => {
        setImageSize({ width: w, height: h });
        // Default crop: full image
        setCropRect({ x: 0, y: 0, width: w, height: h });
        cropXSV.value = withSpring(0, spring.entrance);
        cropYSV.value = withSpring(0, spring.entrance);
        cropWSV.value = withSpring(w, spring.entrance);
        cropHSV.value = withSpring(h, spring.entrance);
      }, () => {
        show('Could not load image', 'error');
      });
    }
  }, [visible, imageUri, show, cropXSV, cropYSV, cropWSV, cropHSV, spring]);

  // ── Sheet entrance/exit animation ────────────────────────────────
  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
      if (reduceMotion) {
        sheetYSV.value = 0;
        backdropOpacitySV.value = 1;
        gridOpacitySV.value = 0.3;
      } else {
        // Per §5.14: sheet entrance uses timing (ease-out), not spring.
        sheetYSV.value = withTiming(0, { duration: Motion.duration.slow, easing: Motion.easing.entrance });
        backdropOpacitySV.value = withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
        // Grid lines fade in after sheet settles
        gridOpacitySV.value = withDelay(Motion.duration.normal, withTiming(0.3, { duration: Motion.duration.normal }));
      }
    } else if (mountedRef.current) {
      if (reduceMotion) {
        sheetYSV.value = screenWidth * 1.2;
        backdropOpacitySV.value = 0;
        gridOpacitySV.value = 0;
      } else {
        sheetYSV.value = withTiming(screenWidth * 1.2, { duration: Motion.duration.normal, easing: Easing.in(Easing.ease) });
        backdropOpacitySV.value = withTiming(0, { duration: Motion.duration.normal });
        gridOpacitySV.value = withTiming(0, { duration: Motion.duration.fast });
      }
    }
  }, [visible, reduceMotion, sheetYSV, backdropOpacitySV, gridOpacitySV, spring]);

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

    // Animate underline to the selected tab.
    const tabId = ratio == null ? 'Original' : ASPECT_PRESETS.find((p) => p.ratio === ratio)?.label ?? '';
    const layout = ratioTabLayouts.current.get(tabId);
    if (layout) {
      if (reduceMotion) {
        ratioUnderlineXSV.value = layout.x;
        ratioUnderlineWSV.value = layout.width;
      } else {
        ratioUnderlineXSV.value = withSpring(layout.x, Motion.spring.indicator);
        ratioUnderlineWSV.value = withSpring(layout.width, Motion.spring.indicator);
      }
    }

    if (!imageSize.width || !ratio) {
      // Reset to full image
      setCropRect({ x: 0, y: 0, width: imageSize.width, height: imageSize.height });
      syncCropSV(0, 0, imageSize.width, imageSize.height);
      return;
    }

    // Calculate largest crop rect with this ratio inside the image
    const imgRatio = imageSize.width / imageSize.height;
    let cropW: number, cropH: number;
    if (imgRatio > ratio) {
      // Image is wider than target ratio — constrain height
      cropH = imageSize.height;
      cropW = cropH * ratio;
    } else {
      // Image is taller than target ratio — constrain width
      cropW = imageSize.width;
      cropH = cropW / ratio;
    }
    const x = (imageSize.width - cropW) / 2;
    const y = (imageSize.height - cropH) / 2;
    setCropRect({ x, y, width: cropW, height: cropH });
    syncCropSV(x, y, cropW, cropH);
  }, [imageSize, haptic, syncCropSV, reduceMotion, ratioUnderlineXSV, ratioUnderlineWSV]);

  // ── Drag to reposition crop frame (spring-bounded) ───────────────
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      runOnJS(haptic.selection)();
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
      // Spring settle — sync state
      runOnJS(setCropRectFromSV)();
    });

  const setCropRectFromSV = useCallback(() => {
    setCropRect((prev) => ({
      ...prev,
      x: cropXSV.value,
      y: cropYSV.value }));
  }, [cropXSV, cropYSV]);

  // ── Pinch to zoom within crop frame ──────────────────────────────
  const pinchStartW = useSharedValue(0);
  const pinchStartH = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      runOnJS(haptic.selection)();
      pinchStartW.value = cropWSV.value;
      pinchStartH.value = cropHSV.value;
      zoomSV.value = 1;
    })
    .onUpdate((e) => {
      zoomSV.value = e.scale;
      // Scale crop frame proportionally, keeping centered
      const newW = Math.max(40, pinchStartW.value / e.scale);
      const newH = Math.max(40, pinchStartH.value / e.scale);
      // Constrain within image bounds
      const maxW = imageSize.width;
      const maxH = imageSize.height;
      const clampedW = Math.min(maxW, newW);
      const clampedH = Math.min(maxH, newH);
      // Keep centered on current crop center
      const cx = cropXSV.value + cropWSV.value / 2;
      const cy = cropYSV.value + cropHSV.value / 2;
      cropWSV.value = clampedW;
      cropHSV.value = clampedH;
      cropXSV.value = Math.max(0, Math.min(maxW - clampedW, cx - clampedW / 2));
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

  const handleResetFocal = useCallback(() => {
    haptic.selection();
    onFocalPointChange?.({ x: 0.5, y: 0.5 });
  }, [haptic, onFocalPointChange]);

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
    const originalTab = ratioTabLayouts.current.get('Original');
    if (originalTab) {
      ratioUnderlineXSV.value = reduceMotion
        ? originalTab.x
        : withSpring(originalTab.x, Motion.spring.indicator);
      ratioUnderlineWSV.value = reduceMotion
        ? originalTab.width
        : withSpring(originalTab.width, Motion.spring.indicator);
    }
    onFocalPointChange?.({ x: 0.5, y: 0.5 });
  }, [haptic, rotateSV, reduceMotion, spring, imageSize, syncCropSV, ratioUnderlineXSV, ratioUnderlineWSV, onFocalPointChange]);

  // ── Animated styles ──────────────────────────────────────────────
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetYSV.value }] }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacitySV.value }));

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

  // Grid lines fade in/out — brighter while dragging
  const gridStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      zoomSV.value,
      [1, 1.5],
      [gridOpacitySV.value, gridOpacitySV.value * 1.8],
      Extrapolation.CLAMP
    ) }));

  // Ratio tab underline indicator (spring-animated on tab change).
  const ratioUnderlineStyle = useAnimatedStyle(() => ({
    left: ratioUnderlineXSV.value,
    width: ratioUnderlineWSV.value }));

  if (!visible && !mountedRef.current) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: colors.overlay, zIndex: 300 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close crop" accessibilityRole="button" />
      </Reanimated.View>

      <Reanimated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + Space.md, backgroundColor: colors.surface },
          sheetStyle,
        ]}
      >
        {/* Title row */}
        <View style={styles.titleRow}>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close crop"
            accessibilityRole="button"
          >
            <AppIcon name="close" size={22} color="textPrimary" opticalCenter={true} accessible={false} />
          </PressScale>
          <View style={styles.modeToggle}>
            <PressScale
              onPress={() => { haptic.selection(); setCropMode('crop'); }}
              style={[
                styles.modeTab,
                cropMode === 'crop' ? { backgroundColor: colors.brand } : {},
              ]}
              accessibilityLabel="Crop mode"
              accessibilityRole="button"
              accessibilityState={{ selected: cropMode === 'crop' }}
            >
              <Text style={[
                styles.modeTabText,
                { color: cropMode === 'crop' ? colors.textInverse : colors.textSecondary },
              ]}>
                Crop
              </Text>
            </PressScale>
            <PressScale
              onPress={() => { haptic.selection(); setCropMode('focal'); }}
              style={[
                styles.modeTab,
                cropMode === 'focal' ? { backgroundColor: colors.brand } : {},
              ]}
              accessibilityLabel="Focal point mode"
              accessibilityRole="button"
              accessibilityState={{ selected: cropMode === 'focal' }}
            >
              <Text style={[
                styles.modeTabText,
                { color: cropMode === 'focal' ? colors.textInverse : colors.textSecondary },
              ]}>
                Focal
              </Text>
            </PressScale>
          </View>
          <View style={styles.closeBtn} />
        </View>

        {/* Crop preview area */}
        <GestureHandlerRootView style={[styles.previewArea, { backgroundColor: colors.mediaOverlayScrim }]}>
          <View style={[styles.previewFrame, { width: displayW, height: displayH, backgroundColor: colors.mediaOverlayScrim }]}>
            {/* Full image (dimmed) with rotation */}
            <Reanimated.View style={[{ width: displayW, height: displayH }, imageStyle]}>
              <Image
                source={{ uri: imageUri }}
                style={{ width: displayW, height: displayH }}
                contentFit="cover"
              />
            </Reanimated.View>
            {cropMode === 'crop' ? (
              <Reanimated.View
                style={[StyleSheet.absoluteFill, cropOverlayStyle]}
                pointerEvents="box-none"
              >
            {/* Dark overlay outside crop area */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {/* Top */}
              <View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute', top: 0, left: 0, right: 0,
                height: displayCropRect.y * scaleToDisplay }]} />
              {/* Bottom */}
              <View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute',
                top: (displayCropRect.y + displayCropRect.height) * scaleToDisplay,
                left: 0, right: 0, bottom: 0 }]} />
              {/* Left */}
              <View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute',
                top: displayCropRect.y * scaleToDisplay, left: 0,
                width: displayCropRect.x * scaleToDisplay, height: displayCropRect.height * scaleToDisplay }]} />
              {/* Right */}
              <View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute',
                top: displayCropRect.y * scaleToDisplay,
                left: (displayCropRect.x + displayCropRect.width) * scaleToDisplay,
                right: 0, height: displayCropRect.height * scaleToDisplay }]} />
            </View>

            {/* Crop rectangle border with drag/pinch handles */}
            <GestureDetector gesture={cropGesture}>
              <Reanimated.View style={[styles.cropBorder, cropFrameStyle, { borderColor: colors.scrimTextPrimary }]}>
                {/* Grid lines (rule of thirds) — animated opacity */}
                <Reanimated.View style={[styles.gridLineV, { left: '33.33%', backgroundColor: colors.scrimTextSecondary }, gridStyle]} />
                <Reanimated.View style={[styles.gridLineV, { left: '66.66%', backgroundColor: colors.scrimTextSecondary }, gridStyle]} />
                <Reanimated.View style={[styles.gridLineH, { top: '33.33%', backgroundColor: colors.scrimTextSecondary }, gridStyle]} />
                <Reanimated.View style={[styles.gridLineH, { top: '66.66%', backgroundColor: colors.scrimTextSecondary }, gridStyle]} />
                {/* Corner handles */}
                <Pressable style={[styles.corner, styles.cornerTL, { borderColor: colors.scrimTextPrimary }]} hitSlop={{ top: 18, bottom: 18, left: 18, right: 18 }} accessibilityLabel="Top left crop handle" accessibilityRole="adjustable" accessibilityHint="Drag to adjust the crop area" />
                <Pressable style={[styles.corner, styles.cornerTR, { borderColor: colors.scrimTextPrimary }]} hitSlop={{ top: 18, bottom: 18, left: 18, right: 18 }} accessibilityLabel="Top right crop handle" accessibilityRole="adjustable" accessibilityHint="Drag to adjust the crop area" />
                <Pressable style={[styles.corner, styles.cornerBL, { borderColor: colors.scrimTextPrimary }]} hitSlop={{ top: 18, bottom: 18, left: 18, right: 18 }} accessibilityLabel="Bottom left crop handle" accessibilityRole="adjustable" accessibilityHint="Drag to adjust the crop area" />
                <Pressable style={[styles.corner, styles.cornerBR, { borderColor: colors.scrimTextPrimary }]} hitSlop={{ top: 18, bottom: 18, left: 18, right: 18 }} accessibilityLabel="Bottom right crop handle" accessibilityRole="adjustable" accessibilityHint="Drag to adjust the crop area" />
              </Reanimated.View>
            </GestureDetector>
              </Reanimated.View>
            ) : (
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
                      borderColor: colors.scrimTextPrimary,
                    },
                  ]}
                  pointerEvents="none"
                />
                <View
                  style={[
                    styles.focalReticleOuter,
                    {
                      left: effectiveFocal.x * displayW - 22,
                      top: effectiveFocal.y * displayH - 22,
                    },
                  ]}
                  pointerEvents="none"
                />
              </Pressable>
              </Reanimated.View>
            )}
          </View>
        </GestureHandlerRootView>

        {/* Rotate + Aspect ratio presets — text-only tabs with underline */}
        {cropMode === 'crop' && (
        <View style={styles.controlsRow}>
          <PressScale
            onPress={handleRotate}
            style={styles.rotateBtn}
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
            onPress={handleFlipH}
            style={styles.flipBtn}
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
            onPress={handleFlipV}
            style={styles.flipBtn}
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
                  onLayout={(e) => {
                    ratioTabLayouts.current.set(preset.label, {
                      x: e.nativeEvent.layout.x,
                      width: e.nativeEvent.layout.width });
                    if (selectedRatio === preset.ratio) {
                      ratioUnderlineXSV.value = e.nativeEvent.layout.x;
                      ratioUnderlineWSV.value = e.nativeEvent.layout.width;
                    }
                  }}
                  style={styles.ratioTab}
                  accessibilityLabel={`Aspect ratio ${preset.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[
                    styles.ratioText,
                    { color: active ? colors.brand : colors.textSecondary },
                  ]}>
                    {preset.label}
                  </Text>
                </PressScale>
              );
            })}
            {/* Spring-animated underline indicator (brand color, 2pt) */}
            <Reanimated.View
              style={[styles.ratioUnderline, ratioUnderlineStyle, { backgroundColor: colors.brand }]}
              pointerEvents="none"
            />
          </ScrollView>
        </View>
        )}

        {/* Straighten — live rotation preview, ±10° in 0.5° steps */}
        {cropMode === 'crop' && (
          <View style={styles.straightenRow}>
            <Text style={[styles.straightenLabel, { color: colors.textSecondary }]}>
              Straighten
            </Text>
            <View style={styles.straightenSlider}>
              <CreatorSlider
                value={straighten}
                min={-10}
                max={10}
                step={0.5}
                neutral={0}
                onValueChange={handleStraightenChange}
                hapticAtNeutral={true}
                showNeutralTick={true}
                accessibilityLabel="Straighten"
                accessibilityHint="Slide to straighten the photo between -10 and 10 degrees"
              />
            </View>
            <PressScale
              onPress={handleStraightenReset}
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

        {cropMode === 'focal' && (
          <View style={styles.focalControlsRow}>
            <View style={styles.focalBtnGroup}>
              <PressScale
                onPress={handleResetFocal}
                style={[styles.focalBtn, { borderColor: colors.border }]}
                accessibilityLabel="Reset focal point to center"
                accessibilityRole="button"
              >
                <AppIcon name="locate-outline" size={18} color="textPrimary" opticalCenter={true} accessible={false} />
                <Text style={[styles.focalBtnText, { color: colors.textPrimary }]}>
                  Center
                </Text>
              </PressScale>
            </View>
          </View>
        )}

        {/* ── Footer — Cancel / Reset / Done ── */}
        <View style={styles.footer}>
          <PressScale
            onPress={onClose}
            style={[styles.footerBtn, styles.footerCancel]}
            accessibilityLabel="Cancel crop"
            accessibilityRole="button"
          >
            <Text style={[styles.footerCancelText, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </PressScale>
          <PressScale
            onPress={handleResetAll}
            style={[styles.footerBtn, styles.footerCancel]}
            accessibilityLabel="Reset all edits"
            accessibilityHint="Restores the original photo, ratio, angle, flips and focal point"
            accessibilityRole="button"
          >
            <Text style={[styles.footerCancelText, { color: colors.textSecondary }]}>
              Reset
            </Text>
          </PressScale>
          <PressScale
            onPress={cropMode === 'focal' ? onClose : handleCrop}
            disabled={isProcessing}
            style={[
              styles.footerBtn,
              styles.footerConfirm,
              {
                backgroundColor: colors.brand,
                opacity: isProcessing ? 0.5 : 1 },
            ]}
            accessibilityLabel={cropMode === 'focal' ? 'Done setting focal point' : 'Apply crop'}
            accessibilityRole="button"
          >
            <Text style={[styles.footerConfirmText, { color: colors.textInverse }]}>
              {isProcessing ? 'Processing…' : 'Done'}
            </Text>
          </PressScale>
        </View>
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 300 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingTop: Space.sm,
    zIndex: 301,
    elevation: 24 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    height: 44 },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: Typography.family.semibold,
    textAlign: 'center' },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center' },
  previewArea: {
    alignItems: 'center',
    paddingVertical: Space.md },
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
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    gap: Space.sm },
  rotateBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44 },
  flipBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44 },
  straightenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    gap: Space.sm },
  straightenLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  straightenSlider: {
    flex: 1 },
  straightenReset: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32 },
  ratioRow: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.xs,
    position: 'relative' },
  ratioTab: {
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xs,
    alignItems: 'center' },
  ratioUnderline: {
    position: 'absolute',
    bottom: 0,
    height: Stroke.emphasis,
    borderRadius: Radius.full },
  ratioText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  // ── Footer — premium Cancel / Done buttons ──
  footer: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  footerBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  footerCancel: {
    backgroundColor: 'transparent' },
  footerCancelText: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size },
  footerConfirm: {
  },
  footerConfirmText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: Radius.full,
    overflow: 'hidden' },
  modeTab: {
    paddingHorizontal: Space.md,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  modeTabText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  focalReticle: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderWidth: Stroke.emphasis,
    borderRadius: Radius.full,
    backgroundColor: 'transparent' },
  focalReticleOuter: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderWidth: Stroke.standard,
    borderRadius: Radius.full,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'transparent' },
  focalControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    gap: Space.sm },
  focalBtnGroup: {
    flexDirection: 'row',
    gap: Space.sm },
  focalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard },
  focalBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily } });
