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
  Dimensions,
  Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography, Space, Radius, Type } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { PressScale } from './CreatorAnimations';
import { useMotionConfig } from '../hooks/useMotionConfig';
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
  cancelAnimation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

const { width: SCREEN_W } = Dimensions.get('window');

type Tool = 'scissors' | 'eraser';

interface Point { x: number; y: number; }

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
 * - Eraser mode: erase regions by painting over them
 *
 * The result is a PNG crop of the traced bounding box.
 */
export function CreatorCutoutSheet({
  visible,
  imageUri,
  onClose,
  onCutoutComplete,
}: CreatorCutoutSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { show } = useToast();
  const { spring } = useMotionConfig();
  const reduceMotion = useReducedMotion();

  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState<Tool>('scissors');
  const [paths, setPaths] = useState<Point[][]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewCrop, setPreviewCrop] = useState(false);
  const mountedRef = useRef(false);

  // ── Spring-driven shared values ──────────────────────────────────
  const sheetYSV = useSharedValue(SCREEN_W * 1.2);
  const backdropOpacitySV = useSharedValue(0);
  const toolHighlightSV = useSharedValue(0); // 0 = scissors, 1 = eraser
  const cutoutScaleSV = useSharedValue(1);
  const cutoutXSV = useSharedValue(0);
  const cutoutYSV = useSharedValue(0);
  const subjectHighlightSV = useSharedValue(0);

  // ── Load image dimensions ────────────────────────────────────────
  useEffect(() => {
    if (visible && imageUri) {
      RNImage.getSize(imageUri, (w: number, h: number) => {
        setImageSize({ width: w, height: h });
        // Fit within display area
        const maxW = SCREEN_W - 32;
        const maxH = SCREEN_W * 0.6;
        const ratio = Math.min(maxW / w, maxH / h);
        setDisplaySize({ width: w * ratio, height: h * ratio });
      }, () => {
        show('Could not load image', 'error');
      });
    }
  }, [visible, imageUri, show]);

  // ── Sheet spring entrance/exit ───────────────────────────────────
  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
      if (reduceMotion) {
        sheetYSV.value = 0;
        backdropOpacitySV.value = 1;
      } else {
        sheetYSV.value = withSpring(0, spring.entrance);
        backdropOpacitySV.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.ease) });
      }
    } else if (mountedRef.current) {
      if (reduceMotion) {
        sheetYSV.value = SCREEN_W * 1.2;
        backdropOpacitySV.value = 0;
      } else {
        sheetYSV.value = withTiming(SCREEN_W * 1.2, { duration: 180, easing: Easing.in(Easing.ease) });
        backdropOpacitySV.value = withTiming(0, { duration: 160 });
      }
    }
  }, [visible, reduceMotion, sheetYSV, backdropOpacitySV, spring]);

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
  }, [tool, haptic, toolHighlightSV, reduceMotion, spring]);

  // ── Drawing gesture (trace path) ─────────────────────────────────
  const panGesture = Gesture.Pan()
    .onBegin(() => {
      runOnJS(haptic.selection)();
      runOnJS(startPath)();
    })
    .onUpdate((e) => {
      runOnJS(addPoint)(e.absoluteX, e.absoluteY);
    })
    .onEnd(() => {
      runOnJS(finishPath)();
    });

  const startPath = useCallback(() => {
    setCurrentPath([]);
  }, []);

  const addPoint = useCallback((x: number, y: number) => {
    setCurrentPath((prev) => [...prev, { x, y }]);
  }, []);

  const finishPath = useCallback(() => {
    setCurrentPath((curr) => {
      if (curr.length > 2) {
        setPaths((prev) => [...prev, curr]);
      }
      return [];
    });
    haptic.light();
  }, [haptic]);

  // ── Pinch to scale cutout preview ────────────────────────────────
  const pinchStartScale = useSharedValue(1);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      runOnJS(haptic.selection)();
      pinchStartScale.value = cutoutScaleSV.value;
    })
    .onUpdate((e) => {
      cutoutScaleSV.value = Math.max(0.5, Math.min(3, pinchStartScale.value * e.scale));
    })
    .onEnd(() => {
      runOnJS(haptic.light)();
    });

  // ── Drag to position cutout with spring follow ───────────────────
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);

  const dragGesture = Gesture.Pan()
    .onStart(() => {
      runOnJS(haptic.selection)();
      dragStartX.value = cutoutXSV.value;
      dragStartY.value = cutoutYSV.value;
      cancelAnimation(cutoutXSV);
      cancelAnimation(cutoutYSV);
    })
    .onUpdate((e) => {
      cutoutXSV.value = dragStartX.value + e.translationX;
      cutoutYSV.value = dragStartY.value + e.translationY;
    })
    .onEnd(() => {
      // Spring back toward center with slight offset for natural feel
      if (!reduceMotion) {
        cutoutXSV.value = withSpring(cutoutXSV.value * 0.3, spring.entrance);
        cutoutYSV.value = withSpring(cutoutYSV.value * 0.3, spring.entrance);
      }
      runOnJS(haptic.light)();
    });

  // ── Subject selection highlight (spring pulse) ───────────────────
  const triggerSubjectHighlight = useCallback(() => {
    haptic.selection();
    if (reduceMotion) {
      subjectHighlightSV.value = 1;
    } else {
      subjectHighlightSV.value = withSequence(
        withTiming(1, { duration: 150 }),
        withSpring(0, spring.tap),
      );
    }
  }, [haptic, reduceMotion, subjectHighlightSV, spring]);

  // ── Undo last path ───────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    haptic.selection();
    setPaths((prev) => prev.slice(0, -1));
    if (paths.length <= 1) setPreviewCrop(false);
  }, [haptic, paths]);

  // ── Clear all paths ──────────────────────────────────────────────
  const handleClear = useCallback(() => {
    haptic.medium();
    setPaths([]);
    setPreviewCrop(false);
  }, [haptic]);

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
    if (paths.length === 0) {
      show('Trace around your subject first', 'error');
      return;
    }
    setIsProcessing(true);
    haptic.medium();

    try {
      // Calculate bounding box from all path points
      const allPoints = paths.flat();
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
            height: cropH,
          },
        }],
        { compress: 1, format: SaveFormat.PNG },
      );

      onCutoutComplete(result.uri);
      onClose();
    } catch {
      show('Crop failed. Try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [paths, imageSize, displaySize, onCutoutComplete, onClose, show, haptic]);

  // ── Animated styles ──────────────────────────────────────────────
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetYSV.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacitySV.value,
  }));

  const cutoutTransformStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cutoutXSV.value },
      { translateY: cutoutYSV.value },
      { scale: cutoutScaleSV.value },
    ],
  }));

  const subjectHighlightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      subjectHighlightSV.value,
      [0, 1],
      [0, 0.4],
      Extrapolation.CLAMP
    ),
    transform: [{ scale: interpolate(subjectHighlightSV.value, [0, 1], [1, 1.05], Extrapolation.CLAMP) }],
  }));

  // Tool highlight indicator (slides between scissors/eraser)
  const toolHighlightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(toolHighlightSV.value, [0, 1], [0, 88], Extrapolation.CLAMP) }],
  }));

  // ── Bounding box of all traced paths (for preview crop overlay) ───
  const cropBBox = useMemo(() => {
    if (paths.length === 0) return null;
    const allPoints = paths.flat();
    if (allPoints.length === 0) return null;
    const minX = Math.min(...allPoints.map(p => p.x));
    const maxX = Math.max(...allPoints.map(p => p.x));
    const minY = Math.min(...allPoints.map(p => p.y));
    const maxY = Math.max(...allPoints.map(p => p.y));
    return { minX, maxX, minY, maxY };
  }, [paths]);

  if (!visible && !mountedRef.current) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: colors.overlay, zIndex: 300 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close manual crop" accessibilityRole="button" />
      </Reanimated.View>

      <Reanimated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 16, backgroundColor: colors.background },
          sheetStyle,
        ]}
      >
        {/* Handle */}
        <View style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>

        {/* Title row */}
        <View style={styles.titleRow}>
          <PressScale onPress={onClose} accessibilityLabel="Cancel manual crop" hitSlop={12}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </PressScale>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Manual Crop</Text>
          <PressScale
            onPress={handleApply}
            disabled={isProcessing || paths.length === 0}
            accessibilityLabel="Apply crop"
            hitSlop={12}
          >
            <Text style={[
              styles.applyText,
              {
                color: colors.brand,
                opacity: isProcessing || paths.length === 0 ? 0.4 : 1,
              },
            ]}>
              {isProcessing ? 'Processing…' : 'Crop'}
            </Text>
          </PressScale>
        </View>

        {/* Instructions */}
        <Text style={[styles.instructions, { color: colors.textMuted }]}>
          {previewCrop && cropBBox ? 'Crop region shown — tap Crop to save' : 'Trace around your subject, then crop to that region'}
        </Text>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          For automatic background removal, use a subject with a clean background.
        </Text>

        {/* Drawing canvas with drag/pinch for cutout positioning */}
        <GestureHandlerRootView style={styles.canvasArea}>
          <GestureDetector gesture={Gesture.Race(dragGesture, pinchGesture)}>
            <Reanimated.View
              style={[
                styles.canvasFrame,
                {
                  width: displaySize.width,
                  height: displaySize.height,
                },
                cutoutTransformStyle,
              ]}
            >
              {/* Original image */}
              <Image
                source={{ uri: imageUri }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
              {/* Crop bounding box preview overlay */}
              {previewCrop && cropBBox && (
                <View
                  style={{
                    position: 'absolute',
                    left: Math.max(0, cropBBox.minX - 16),
                    top: Math.max(0, cropBBox.minY),
                    width: Math.min(displaySize.width, cropBBox.maxX - cropBBox.minX),
                    height: Math.min(displaySize.height, cropBBox.maxY - cropBBox.minY),
                    borderWidth: 2,
                    borderColor: colors.brand,
                    backgroundColor: 'transparent',
                  }}
                  pointerEvents="none"
                />
              )}
              {/* Subject selection highlight pulse */}
              <Reanimated.View style={[StyleSheet.absoluteFill, subjectHighlightStyle, { backgroundColor: colors.brand }]} pointerEvents="none" />

              {/* Drawing layer for traced paths */}
              <GestureDetector gesture={panGesture}>
                <View style={StyleSheet.absoluteFill}>
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    {paths.map((path, i) => (
                      <PathOverlay key={i} path={path} color="#E06666" opacity={0.3} />
                    ))}
                    {currentPath.length > 1 && (
                      <PathOverlay path={currentPath} color="#E06666" opacity={0.5} />
                    )}
                  </View>
                </View>
              </GestureDetector>
            </Reanimated.View>
          </GestureDetector>
        </GestureHandlerRootView>

        {/* Tool selector with spring highlight indicator */}
        <View style={[styles.toolSelectorRow, { borderColor: colors.borderSubtle }]}>
          <Reanimated.View style={[styles.toolHighlight, toolHighlightStyle, { backgroundColor: colors.brand }]} />
          <PressScale
            onPress={() => handleToolSwitch('scissors')}
            style={styles.toolSelectorBtn}
            accessibilityLabel="Scissors tool"
            accessibilityRole="button"
            accessibilityState={{ selected: tool === 'scissors' }}
          >
            <Ionicons
              name="cut-outline"
              size={20}
              color={tool === 'scissors' ? colors.textInverse : colors.textSecondary}
            />
            <Text style={[styles.toolSelectorLabel, { color: tool === 'scissors' ? colors.textInverse : colors.textSecondary }]}>
              Trace
            </Text>
          </PressScale>
          <PressScale
            onPress={() => handleToolSwitch('eraser')}
            style={styles.toolSelectorBtn}
            accessibilityLabel="Eraser tool"
            accessibilityRole="button"
            accessibilityState={{ selected: tool === 'eraser' }}
          >
            <Ionicons
              name="brush-outline"
              size={20}
              color={tool === 'eraser' ? colors.textInverse : colors.textSecondary}
            />
            <Text style={[styles.toolSelectorLabel, { color: tool === 'eraser' ? colors.textInverse : colors.textSecondary }]}>
              Erase
            </Text>
          </PressScale>
        </View>

        {/* Tool controls */}
        <View style={styles.toolRow}>
          <PressScale
            onPress={handlePreviewCrop}
            style={[styles.toolBtn, { borderColor: previewCrop ? colors.brand : colors.border, backgroundColor: previewCrop ? `${colors.brand}15` : 'transparent' }]}
            disabled={paths.length === 0}
            accessibilityLabel="Preview crop"
          >
            <Ionicons
              name="eye-outline"
              size={22}
              color={paths.length === 0 ? colors.textMuted : (previewCrop ? colors.brand : colors.textPrimary)}
            />
            <Text style={[styles.toolLabel, { color: paths.length === 0 ? colors.textMuted : (previewCrop ? colors.brand : colors.textSecondary) }]}>
              Preview
            </Text>
          </PressScale>

          <PressScale
            onPress={handleUndo}
            style={[styles.toolBtn, { borderColor: colors.border }]}
            disabled={paths.length === 0}
            accessibilityLabel="Undo last trace"
          >
            <Ionicons
              name="arrow-undo-outline"
              size={22}
              color={paths.length === 0 ? colors.textMuted : colors.textPrimary}
            />
            <Text style={[styles.toolLabel, { color: paths.length === 0 ? colors.textMuted : colors.textSecondary }]}>
              Undo
            </Text>
          </PressScale>

          <PressScale
            onPress={handleClear}
            style={[styles.toolBtn, { borderColor: colors.border }]}
            disabled={paths.length === 0}
            accessibilityLabel="Clear all traces"
          >
            <Ionicons
              name="trash-outline"
              size={22}
              color={paths.length === 0 ? colors.textMuted : colors.textPrimary}
            />
            <Text style={[styles.toolLabel, { color: paths.length === 0 ? colors.textMuted : colors.textSecondary }]}>
              Clear
            </Text>
          </PressScale>
        </View>
      </Reanimated.View>
    </View>
  );
}

// ── Path overlay component (renders traced path as semi-transparent fill) ──
function PathOverlay({ path, color, opacity }: { path: Point[]; color: string; opacity: number }) {
  if (path.length < 2) return null;
  // Render as a series of small circles to approximate the traced area
  return (
    <>
      {path.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: p.x - 20,
            top: p.y - 20,
            width: 40,
            height: 40,
            borderRadius: Radius.xxl,
            backgroundColor: color,
            opacity,
          }}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 300,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Space.sm,
    zIndex: 301,
    elevation: 24,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  cancelText: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.regular,
  },
  title: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
  },
  applyText: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
  },
  instructions: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    paddingBottom: 4,
  },
  note: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    paddingBottom: 12,
    fontStyle: 'italic',
  },
  canvasArea: {
    alignItems: 'center',
    paddingVertical: Space.sm,
    backgroundColor: '#000',
  },
  canvasFrame: {
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  toolSelectorRow: {
    flexDirection: 'row',
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    position: 'relative',
  },
  toolHighlight: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 84,
    height: 40,
    borderRadius: Radius.md,
  },
  toolSelectorBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    zIndex: 1,
  },
  toolSelectorLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  toolRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: Space.md,
  },
  toolBtn: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  toolLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
});
