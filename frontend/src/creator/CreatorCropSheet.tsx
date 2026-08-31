import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ScrollView,
  Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, FontFamily, Stroke, Typography } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { IconGrammar } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { PressScale } from './CreatorAnimations';
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

  // Compose pan + pinch
  const cropGesture = Gesture.Simultaneous(panGesture, pinchGesture);

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

  // ── Execute crop via expo-image-manipulator ──────────────────────
  const handleCrop = useCallback(async () => {
    if (!imageUri || !cropRect.width) return;
    setIsProcessing(true);
    haptic.medium();
    try {
      const actions: any[] = [{
        crop: {
          originX: Math.round(cropRect.x),
          originY: Math.round(cropRect.y),
          width: Math.round(cropRect.width),
          height: Math.round(cropRect.height) } }];
      if (rotation !== 0) {
        actions.push({ rotate: rotation });
      }
      const result = await manipulateAsync(
        imageUri,
        actions,
        { compress: 0.92, format: SaveFormat.JPEG },
      );
      onCropComplete(result.uri, result.width, result.height);
      onClose();
    } catch {
      show('Crop failed. Try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [imageUri, cropRect, rotation, onCropComplete, onClose, show, haptic]);

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

  const handleAutoDetectFocal = useCallback(() => {
    haptic.medium();
    onFocalPointChange?.({ x: 0.5, y: 0.5 });
  }, [haptic, onFocalPointChange]);

  // ── Animated styles ──────────────────────────────────────────────
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetYSV.value }] }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacitySV.value }));

  const imageStyle = useAnimatedStyle(() => ({
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
            <Ionicons name="close" size={22} color={colors.textPrimary} />
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
              <>
            {/* Dark overlay outside crop area */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {/* Top */}
              <View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute', top: 0, left: 0, right: 0,
                height: cropRect.y * scaleToDisplay }]} />
              {/* Bottom */}
              <View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute',
                top: (cropRect.y + cropRect.height) * scaleToDisplay,
                left: 0, right: 0, bottom: 0 }]} />
              {/* Left */}
              <View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute',
                top: cropRect.y * scaleToDisplay, left: 0,
                width: cropRect.x * scaleToDisplay, height: cropRect.height * scaleToDisplay }]} />
              {/* Right */}
              <View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute',
                top: cropRect.y * scaleToDisplay,
                left: (cropRect.x + cropRect.width) * scaleToDisplay,
                right: 0, height: cropRect.height * scaleToDisplay }]} />
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
              </>
            ) : (
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
            <Ionicons name="refresh-outline" size={IconGrammar.standard} color={colors.textPrimary} />
            <Text style={[styles.rotateLabel, { color: colors.textSecondary }]}>
              {rotation}°
            </Text>
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

        {cropMode === 'focal' && (
          <View style={styles.focalControlsRow}>
            <Text
              style={[styles.focalReadout, { color: colors.textSecondary }]}
              accessibilityLiveRegion="polite"
            >
              {`Focal point: ${Math.round(effectiveFocal.x * 100)}%, ${Math.round(effectiveFocal.y * 100)}%`}
            </Text>
            <View style={styles.focalBtnGroup}>
              <PressScale
                onPress={handleAutoDetectFocal}
                style={[styles.focalBtn, { borderColor: colors.border }]}
                accessibilityLabel="Auto-detect focal point"
                accessibilityRole="button"
              >
                <Ionicons name="scan-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.focalBtnText, { color: colors.textPrimary }]}>
                  Auto
                </Text>
              </PressScale>
              <PressScale
                onPress={handleResetFocal}
                style={[styles.focalBtn, { borderColor: colors.border }]}
                accessibilityLabel="Reset focal point to center"
                accessibilityRole="button"
              >
                <Ionicons name="locate-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.focalBtnText, { color: colors.textPrimary }]}>
                  Center
                </Text>
              </PressScale>
            </View>
          </View>
        )}

        {/* ── Footer — premium Cancel / Done buttons ── */}
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
    width: 52,
    height: 44,
    gap: 2 },
  rotateLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
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
    borderWidth: 2,
    borderRadius: Radius.full,
    backgroundColor: 'transparent' },
  focalReticleOuter: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderWidth: 1,
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
  focalReadout: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    flex: 1 },
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
    borderWidth: 1 },
  focalBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily } });
