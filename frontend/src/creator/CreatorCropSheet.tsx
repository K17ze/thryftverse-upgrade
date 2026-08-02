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
  ScrollView,
} from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography, Space, Radius } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { PressScale } from './CreatorAnimations';

const { width: SCREEN_W } = Dimensions.get('window');

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
}

export function CreatorCropSheet({
  visible,
  imageUri,
  onClose,
  onCropComplete,
}: CreatorCropSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { show } = useToast();

  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [selectedRatio, setSelectedRatio] = useState<number | null>(null);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const translateY = useRef(new Animated.Value(SCREEN_W * 1.2)).current;

  // ── Load image dimensions on open ────────────────────────────────
  React.useEffect(() => {
    if (visible && imageUri) {
      Image.getSize(imageUri, (w, h) => {
        setImageSize({ width: w, height: h });
        // Default crop: full image
        setCropRect({ x: 0, y: 0, width: w, height: h });
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

  // ── Calculate display dimensions ─────────────────────────────────
  const displayW = SCREEN_W - 32;
  const displayH = imageSize.width > 0
    ? displayW * (imageSize.height / imageSize.width)
    : displayW;

  // ── Apply aspect ratio preset ────────────────────────────────────
  const applyRatio = useCallback((ratio: number | null) => {
    haptic.selection();
    setSelectedRatio(ratio);
    if (!imageSize.width || !ratio) {
      // Reset to full image
      setCropRect({ x: 0, y: 0, width: imageSize.width, height: imageSize.height });
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
  }, [imageSize, haptic]);

  // ── Pan to move crop rect ────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        haptic.selection();
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (!imageSize.width) return;
        const scale = imageSize.width / displayW;
        const dx = gestureState.dx * scale;
        const dy = gestureState.dy * scale;
        setCropRect((prev) => {
          const maxX = imageSize.width - prev.width;
          const maxY = imageSize.height - prev.height;
          return {
            ...prev,
            x: Math.max(0, Math.min(maxX, prev.x + dx)),
            y: Math.max(0, Math.min(maxY, prev.y + dy)),
          };
        });
      },
    })
  ).current;

  // ── Execute crop via expo-image-manipulator ──────────────────────
  const handleCrop = useCallback(async () => {
    if (!imageUri || !cropRect.width) return;
    setIsProcessing(true);
    haptic.medium();
    try {
      const result = await manipulateAsync(
        imageUri,
        [{
          crop: {
            originX: Math.round(cropRect.x),
            originY: Math.round(cropRect.y),
            width: Math.round(cropRect.width),
            height: Math.round(cropRect.height),
          },
        }],
        { compress: 0.92, format: SaveFormat.JPEG },
      );
      onCropComplete(result.uri, result.width, result.height);
      onClose();
    } catch {
      show('Crop failed. Please try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [imageUri, cropRect, onCropComplete, onClose, show, haptic]);

  if (!visible) return null;

  // ── Calculate crop rect in display coordinates ───────────────────
  const scale = imageSize.width > 0 ? displayW / imageSize.width : 1;
  const cropDisplayX = cropRect.x * scale;
  const cropDisplayY = cropRect.y * scale;
  const cropDisplayW = cropRect.width * scale;
  const cropDisplayH = cropRect.height * scale;

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
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Cancel crop">
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Crop</Text>
          <Pressable
            onPress={handleCrop}
            disabled={isProcessing}
            hitSlop={12}
            accessibilityLabel="Apply crop"
          >
            <Text style={[styles.applyText, { color: colors.brand, opacity: isProcessing ? 0.5 : 1 }]}>
              {isProcessing ? 'Processing…' : 'Done'}
            </Text>
          </Pressable>
        </View>

        {/* Crop preview area */}
        <View style={styles.previewArea}>
          <View style={[styles.previewFrame, { width: displayW, height: displayH }]}>
            {/* Full image (dimmed) */}
            <Image
              source={{ uri: imageUri }}
              style={{ width: displayW, height: displayH }}
              resizeMode="cover"
            />
            {/* Dark overlay outside crop area */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {/* Top */}
              <View style={[styles.dimOverlay, {
                position: 'absolute', top: 0, left: 0, right: 0,
                height: cropDisplayY,
              }]} />
              {/* Bottom */}
              <View style={[styles.dimOverlay, {
                position: 'absolute',
                top: cropDisplayY + cropDisplayH,
                left: 0, right: 0, bottom: 0,
              }]} />
              {/* Left */}
              <View style={[styles.dimOverlay, {
                position: 'absolute',
                top: cropDisplayY, left: 0,
                width: cropDisplayX, height: cropDisplayH,
              }]} />
              {/* Right */}
              <View style={[styles.dimOverlay, {
                position: 'absolute',
                top: cropDisplayY,
                left: cropDisplayX + cropDisplayW,
                right: 0, height: cropDisplayH,
              }]} />
            </View>

            {/* Crop rectangle border with drag handle */}
            <View
              style={[
                styles.cropBorder,
                {
                  left: cropDisplayX,
                  top: cropDisplayY,
                  width: cropDisplayW,
                  height: cropDisplayH,
                },
              ]}
              {...panResponder.panHandlers}
            >
              {/* Grid lines (rule of thirds) */}
              <View style={[styles.gridLineV, { left: '33.33%' }]} />
              <View style={[styles.gridLineV, { left: '66.66%' }]} />
              <View style={[styles.gridLineH, { top: '33.33%' }]} />
              <View style={[styles.gridLineH, { top: '66.66%' }]} />
              {/* Corner handles */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
          </View>
        </View>

        {/* Aspect ratio presets */}
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
                  styles.ratioPill,
                  {
                    backgroundColor: active ? colors.brand : colors.surface,
                    borderColor: active ? colors.brand : colors.border,
                  },
                ]}
                accessibilityLabel={`Aspect ratio ${preset.label}`}
              >
                <Text style={[
                  styles.ratioText,
                  { color: active ? colors.textInverse : colors.textSecondary },
                ]}>
                  {preset.label}
                </Text>
              </PressScale>
            );
          })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// Need ScrollView import

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
    paddingTop: 8,
    zIndex: 301,
    elevation: 24,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 16,
    fontFamily: Typography.family.regular,
  },
  title: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
  },
  applyText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
  },
  previewArea: {
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#000',
  },
  previewFrame: {
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  dimOverlay: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cropBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#fff',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#fff',
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  ratioRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ratioPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  ratioText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },
});
