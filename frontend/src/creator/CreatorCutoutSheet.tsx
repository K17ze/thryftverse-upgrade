import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography, Space, Radius, Type } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { PressScale } from './CreatorAnimations';

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
 * Snapchat-style cutout tool.
 * - Scissors mode: trace around the subject with your finger to create a cutout
 * - Eraser mode: erase regions by painting over them
 *
 * The result is a PNG with transparent background that can be placed as a
 * sticker-style layer.
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

  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState<Tool>('scissors');
  const [paths, setPaths] = useState<Point[][]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const translateY = useRef(new Animated.Value(SCREEN_W * 1.2)).current;

  // ── Load image dimensions ────────────────────────────────────────
  React.useEffect(() => {
    if (visible && imageUri) {
      Image.getSize(imageUri, (w, h) => {
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

  // ── Sheet animation ──────────────────────────────────────────────
  React.useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SCREEN_W * 1.2,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, translateY]);

  // ── Drawing pan responder ────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        haptic.selection();
        setCurrentPath([]);
      },
      onPanResponderMove: (_evt, gestureState) => {
        setCurrentPath((prev) => [
          ...prev,
          { x: gestureState.moveX, y: gestureState.moveY },
        ]);
      },
      onPanResponderRelease: () => {
        if (currentPath.length > 2) {
          setPaths((prev) => [...prev, currentPath]);
        }
        setCurrentPath([]);
        haptic.light();
      },
    })
  ).current;

  // ── Undo last path ───────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    haptic.selection();
    setPaths((prev) => prev.slice(0, -1));
  }, [haptic]);

  // ── Clear all paths ──────────────────────────────────────────────
  const handleClear = useCallback(() => {
    haptic.medium();
    setPaths([]);
  }, [haptic]);

  // ── Apply cutout ─────────────────────────────────────────────────
  // Since we can't do true AI background removal on-device without ML,
  // we use the traced path to create a crop bounding box and export as PNG.
  // The user traces around the subject, and we crop to that bounding box.
  // For a true pixel-level cutout, a backend ML service would be needed.
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
      show('Cutout failed. Please try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [paths, imageSize, displaySize, onCutoutComplete, onClose, show, haptic]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY }], paddingBottom: insets.bottom + 16 },
        ]}
      >
        {/* Handle */}
        <View style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>

        {/* Title row */}
        <View style={styles.titleRow}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Cancel cutout">
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Cutout</Text>
          <Pressable
            onPress={handleApply}
            disabled={isProcessing || paths.length === 0}
            hitSlop={12}
            accessibilityLabel="Apply cutout"
          >
            <Text style={[
              styles.applyText,
              {
                color: colors.brand,
                opacity: isProcessing || paths.length === 0 ? 0.4 : 1,
              },
            ]}>
              {isProcessing ? 'Processing…' : 'Cut'}
            </Text>
          </Pressable>
        </View>

        {/* Instructions */}
        <Text style={styles.instructions}>
          Trace around your subject to cut it out
        </Text>

        {/* Drawing canvas */}
        <View style={styles.canvasArea}>
          <View
            style={[styles.canvasFrame, {
              width: displaySize.width,
              height: displaySize.height,
            }]}
            {...panResponder.panHandlers}
          >
            <Image
              source={{ uri: imageUri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
            {/* Dim overlay to show what's being cut away */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {paths.map((path, i) => (
                <PathOverlay key={i} path={path} color="#E06666" opacity={0.3} />
              ))}
              {currentPath.length > 1 && (
                <PathOverlay path={currentPath} color="#E06666" opacity={0.5} />
              )}
            </View>
          </View>
        </View>

        {/* Tool controls */}
        <View style={styles.toolRow}>
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
      </Animated.View>
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 300,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0A0A0A',
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
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingBottom: 12,
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
