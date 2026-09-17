// NOTE: This component performs manual rectangular cropping, NOT transparent
// subject extraction. The user-facing label is "Crop" until true segmentation
// (alpha mask) is implemented. See THRYFTVERSE_CREATOR_FLAGSHIP_RECONSTRUCTION
// Phase 8 for the true cutout contract.
//
// Manual trace-and-crop tool. The user traces around a subject with
// their finger and the tool crops to the bounding box of the traced
// region. This is NOT background removal/subject segmentation — it
// produces a rectangular crop, not a transparent cutout.
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  Image as RNImage } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import { PressScale } from '../shared/CreatorAnimations';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { Motion } from '../../theme/motionTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  interpolate,
  Extrapolation,
  Easing } from 'react-native-reanimated';
import type { Tool } from './cutoutSheet/cutoutSheetShared';
import { styles } from './cutoutSheet/cutoutSheetStyles';
import { useCutoutTrace } from './cutoutSheet/useCutoutTrace';
import { useCutoutGestures } from './cutoutSheet/useCutoutGestures';
import { CutoutCanvas } from './cutoutSheet/CutoutCanvas';
import { CutoutToolTabs } from './cutoutSheet/CutoutToolTabs';
import { CutoutToolControls } from './cutoutSheet/CutoutToolControls';

interface CreatorCutoutSheetProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
  onCutoutComplete: (newUri: string) => void;
}

/**
 * Manual trace-and-crop tool.
 *
 * The user traces around a subject with their finger and the tool crops
 * to the bounding box of the traced region, exporting the crop as a PNG.
 * This is NOT background removal / subject segmentation — it produces a
 * rectangular crop, not a transparent cutout. For true subject cutout
 * (background transparency), an on-device ML segmentation model or
 * backend service would be required.
 *
 * - Scissors mode: trace around the subject with your finger
 * - Eraser mode: trim the trace — painting over a traced stroke removes
 *   the points near the stroke so the bounding box shrinks/refines
 *
 * The result is a PNG crop of the traced bounding box.
 */
export function CreatorCutoutSheet({
  visible,
  imageUri,
  onClose,
  onCutoutComplete }: CreatorCutoutSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { show } = useToast();
  const { spring } = useMotionConfig();
  const reduceMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();

  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState<Tool>('scissors');
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewCrop, setPreviewCrop] = useState(false);
  const mountedRef = useRef(false);

  // ── Trace state + drawing gesture (UI-thread Skia trace) ─────────
  const {
    paths,
    setPaths,
    currentPath,
    liveMode,
    liveTracePathDV,
    panGesture,
    effectivePaths } = useCutoutTrace(tool);

  // ── Spring-driven shared values ──────────────────────────────────
  const sheetYSV = useSharedValue(screenWidth * 1.2);
  const backdropOpacitySV = useSharedValue(0);
  const toolHighlightSV = useSharedValue(0); // 0 = scissors, 1 = eraser
  const cutoutScaleSV = useSharedValue(1);
  const cutoutXSV = useSharedValue(0);
  const cutoutYSV = useSharedValue(0);
  const subjectHighlightSV = useSharedValue(0);

  // ── Pinch/drag gestures for cutout preview positioning ────────────
  const { pinchGesture, dragGesture } = useCutoutGestures({
    cutoutScaleSV,
    cutoutXSV,
    cutoutYSV,
    reduceMotion,
    spring });

  // ── Tool tab underline indicator (spring-animated, brand color) ──
  const toolTabLayouts = useRef<Map<Tool, { x: number; width: number }>>(new Map());
  const toolUnderlineXSV = useSharedValue(0);
  const toolUnderlineWSV = useSharedValue(0);

  // ── Load image dimensions ────────────────────────────────────────
  useEffect(() => {
    if (visible && imageUri) {
      RNImage.getSize(imageUri, (w: number, h: number) => {
        setImageSize({ width: w, height: h });
        // Fit within display area
        const maxW = screenWidth - 32;
        const maxH = screenWidth * 0.6;
        const ratio = Math.min(maxW / w, maxH / h);
        setDisplaySize({ width: w * ratio, height: h * ratio });
      }, () => {
        show('Could not load image', 'error');
      });
    }
  }, [visible, imageUri, show, screenWidth]);

  // ── Sheet entrance/exit ──────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
      if (reduceMotion) {
        sheetYSV.value = 0;
        backdropOpacitySV.value = 1;
      } else {
        // Per §5.14: sheet entrance uses timing (ease-out), not spring.
        sheetYSV.value = withTiming(0, { duration: Motion.duration.slow, easing: Easing.out(Easing.cubic) });
        backdropOpacitySV.value = withTiming(1, { duration: Motion.duration.normal, easing: Easing.out(Easing.ease) });
      }
    } else if (mountedRef.current) {
      if (reduceMotion) {
        sheetYSV.value = screenWidth * 1.2;
        backdropOpacitySV.value = 0;
      } else {
        sheetYSV.value = withTiming(screenWidth * 1.2, { duration: Motion.duration.normal, easing: Easing.in(Easing.ease) });
        backdropOpacitySV.value = withTiming(0, { duration: Motion.duration.normal });
      }
    }
  }, [visible, reduceMotion, sheetYSV, backdropOpacitySV, spring, screenWidth]);

  // ── Tool switch with spring highlight ────────────────────────────
  const handleToolSwitch = useCallback((nextTool: Tool) => {
    if (nextTool === tool) return;
    haptic.selection();
    setTool(nextTool);
    if (reduceMotion) {
      toolHighlightSV.value = nextTool === 'eraser' ? 1 : 0;
    } else {
      toolHighlightSV.value = withSpring(nextTool === 'eraser' ? 1 : 0, spring.tap);
    }
    // Animate underline to the selected tab.
    const layout = toolTabLayouts.current.get(nextTool);
    if (layout) {
      if (reduceMotion) {
        toolUnderlineXSV.value = layout.x;
        toolUnderlineWSV.value = layout.width;
      } else {
        toolUnderlineXSV.value = withSpring(layout.x, Motion.spring.indicator);
        toolUnderlineWSV.value = withSpring(layout.width, Motion.spring.indicator);
      }
    }
  }, [tool, haptic, toolHighlightSV, reduceMotion, spring, toolUnderlineXSV, toolUnderlineWSV]);

  // ── Subject selection highlight (spring pulse) ───────────────────
  const triggerSubjectHighlight = useCallback(() => {
    haptic.selection();
    if (reduceMotion) {
      subjectHighlightSV.value = 1;
    } else {
      subjectHighlightSV.value = withSequence(
        withTiming(1, { duration: Motion.duration.fast }),
        withSpring(0, spring.tap),
      );
    }
  }, [haptic, reduceMotion, subjectHighlightSV, spring]);

  // ── Undo last path ───────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    haptic.selection();
    setPaths((prev) => prev.slice(0, -1));
    if (paths.length <= 1) setPreviewCrop(false);
  }, [haptic, paths, setPaths]);

  // ── Clear all paths ──────────────────────────────────────────────
  const handleClear = useCallback(() => {
    haptic.medium();
    setPaths([]);
    setPreviewCrop(false);
  }, [haptic, setPaths]);

  // ── Preview crop bounding box ─────────────────────────────────────
  const handlePreviewCrop = useCallback(() => {
    haptic.medium();
    setPreviewCrop((prev) => !prev);
    triggerSubjectHighlight();
  }, [haptic, triggerSubjectHighlight]);

  // ── Apply crop ────────────────────────────────────────────────────
  // The traced path defines a bounding box. We crop to that bounding box
  // and export as PNG. This is a rectangular crop, not background removal.
  const handleApply = useCallback(async () => {
    if (effectivePaths.length === 0) {
      show('Trace around your subject first', 'error');
      return;
    }
    setIsProcessing(true);
    haptic.medium();

    try {
      // Bounding box from the surviving (post-erase) trace points only.
      const allPoints = effectivePaths.flat();
      const minX = Math.min(...allPoints.map(p => p.x));
      const maxX = Math.max(...allPoints.map(p => p.x));
      const minY = Math.min(...allPoints.map(p => p.y));
      const maxY = Math.max(...allPoints.map(p => p.y));

      // Convert display coordinates to image coordinates
      const scale = imageSize.width / displaySize.width;
      const cropOriginX = Math.max(0, Math.round((minX - 16) * scale));
      const cropOriginY = Math.max(0, Math.round(minY * scale));
      const cropW = Math.min(imageSize.width - cropOriginX, Math.round((maxX - minX) * scale));
      const cropH = Math.min(imageSize.height - cropOriginY, Math.round((maxY - minY) * scale));

      if (cropW < 10 || cropH < 10) {
        show('Trace a larger area around your subject', 'error');
        setIsProcessing(false);
        return;
      }

      // Crop to bounding box and export as PNG (preserves transparency)
      const result = await manipulateAsync(
        imageUri,
        [{
          crop: {
            originX: cropOriginX,
            originY: cropOriginY,
            width: cropW,
            height: cropH } }],
        { compress: 1, format: SaveFormat.PNG },
      );

      onCutoutComplete(result.uri);
      onClose();
    } catch {
      show('Crop failed. Try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [effectivePaths, imageUri, imageSize, displaySize, onCutoutComplete, onClose, show, haptic]);

  // ── Animated styles ──────────────────────────────────────────────
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetYSV.value }] }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacitySV.value }));

  const cutoutTransformStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cutoutXSV.value },
      { translateY: cutoutYSV.value },
      { scale: cutoutScaleSV.value },
    ] }));

  const subjectHighlightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      subjectHighlightSV.value,
      [0, 1],
      [0, 0.4],
      Extrapolation.CLAMP
    ),
    transform: [{ scale: interpolate(subjectHighlightSV.value, [0, 1], [1, 1.05], Extrapolation.CLAMP) }] }));

  // Tool tab underline indicator (spring-animated, brand color).
  const toolUnderlineStyle = useAnimatedStyle(() => ({
    left: toolUnderlineXSV.value,
    width: toolUnderlineWSV.value }));

  // ── Bounding box of surviving trace segments (post-erase) ─────────
  const cropBBox = useMemo(() => {
    if (effectivePaths.length === 0) return null;
    const allPoints = effectivePaths.flat();
    if (allPoints.length === 0) return null;
    const minX = Math.min(...allPoints.map(p => p.x));
    const maxX = Math.max(...allPoints.map(p => p.x));
    const minY = Math.min(...allPoints.map(p => p.y));
    const maxY = Math.max(...allPoints.map(p => p.y));
    return { minX, maxX, minY, maxY };
  }, [effectivePaths]);

  if (!visible && !mountedRef.current) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: colors.overlay, zIndex: 300 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close manual crop"
        accessibilityHint="Closes without saving the cutout" accessibilityRole="button" />
      </Reanimated.View>

      <Reanimated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 16, backgroundColor: colors.background },
          sheetStyle,
        ]}
      >
        {/* Title row */}
        <View style={styles.titleRow}>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close manual crop"
            accessibilityHint="Closes without saving the cutout"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </PressScale>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Crop</Text>
          <View style={styles.closeBtn} />
        </View>

        {/* Instructions */}
        <Text style={[styles.instructions, { color: colors.textMuted }]}>
          {previewCrop && cropBBox
            ? 'Tap Crop to save'
            : tool === 'eraser'
              ? 'Paint over the trace to trim it'
              : 'Trace around your subject'}
        </Text>

        <CutoutCanvas
          displaySize={displaySize}
          cutoutTransformStyle={cutoutTransformStyle}
          imageUri={imageUri}
          previewCrop={previewCrop}
          cropBBox={cropBBox}
          subjectHighlightStyle={subjectHighlightStyle}
          panGesture={panGesture}
          dragGesture={dragGesture}
          pinchGesture={pinchGesture}
          effectivePaths={effectivePaths}
          paths={paths}
          liveTracePathDV={liveTracePathDV}
          liveMode={liveMode}
          currentPath={currentPath}
          tool={tool}
          colors={colors}
        />

        <CutoutToolTabs
          tool={tool}
          colors={colors}
          toolTabLayouts={toolTabLayouts}
          toolUnderlineXSV={toolUnderlineXSV}
          toolUnderlineWSV={toolUnderlineWSV}
          toolUnderlineStyle={toolUnderlineStyle}
          onToolSwitch={handleToolSwitch}
        />

        <CutoutToolControls
          colors={colors}
          hasEffectivePaths={effectivePaths.length > 0}
          hasPaths={paths.length > 0}
          previewCrop={previewCrop}
          onPreviewCrop={handlePreviewCrop}
          onUndo={handleUndo}
          onClear={handleClear}
        />

        {/* ── Footer — premium Cancel / Crop buttons ── */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <PressScale
            onPress={onClose}
            style={[styles.footerBtn, styles.footerCancel]}
            accessibilityLabel="Cancel manual crop"
            accessibilityHint="Closes without saving the cutout"
            accessibilityRole="button"
          >
            <Text style={[styles.footerCancelText, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </PressScale>
          <PressScale
            onPress={handleApply}
            disabled={isProcessing || effectivePaths.length === 0}
            style={[
              styles.footerBtn,
              styles.footerConfirm,
              {
                backgroundColor: colors.brand,
                opacity: isProcessing || effectivePaths.length === 0 ? 0.4 : 1 },
            ]}
            accessibilityLabel="Apply crop"
            accessibilityHint="Applies the cutout"
            accessibilityRole="button"
          >
            <Text style={[styles.footerConfirmText, { color: colors.textInverse }]}>
              {isProcessing ? 'Processing…' : 'Crop'}
            </Text>
          </PressScale>
        </View>
      </Reanimated.View>
    </View>
  );
}
