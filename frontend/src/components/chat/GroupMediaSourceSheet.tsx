import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Elevation } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { Caption, BodyEmphasis } from '../ui/Text';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Motion } from '../../theme/motionTokens';
import { haptics } from '../../utils/haptics';

export type GroupMediaSource = 'camera' | 'gallery';

export interface GroupMediaSourcePreset {
  id: string;
  label: string;
  uri: string;
}

interface GroupMediaSourceSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (source: GroupMediaSource) => void;
  title?: string;
  canRemove?: boolean;
  onRemove?: () => void;
  presets?: GroupMediaSourcePreset[];
  onSelectPreset?: (uri: string) => void;
}

/**
 * GroupMediaSourceSheet — WhatsApp & Telegram flagship bottom sheet for
 * changing group avatar or banner cover photos.
 *
 * Supports:
 *  - Take photo with camera
 *  - Choose from photo library
 *  - Curated group aesthetic presets
 *  - Remove photo
 */
export function GroupMediaSourceSheet({
  visible,
  onClose,
  onSelect,
  title,
  canRemove,
  onRemove,
  presets,
  onSelectPreset,
}: GroupMediaSourceSheetProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { height: screenHeight } = useWindowDimensions();
  const translateY = useSharedValue(screenHeight);
  const opacity = useSharedValue(0);
  const [rendered, setRendered] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      opacity.value = withTiming(1, { duration: Motion.duration.normal });
      translateY.value = withTiming(0, { duration: Motion.duration.slow, easing: Easing.out(Easing.cubic) });
    } else if (rendered) {
      opacity.value = withTiming(0, { duration: Motion.duration.fast });
      translateY.value = withTiming(screenHeight * 0.5, { duration: Motion.duration.normal });
      setTimeout(() => setRendered(false), 220);
    }
  }, [visible, rendered, opacity, translateY, reducedMotion, screenHeight]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 600) {
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, { duration: Motion.duration.slow, easing: Easing.out(Easing.cubic) });
      }
    });

  const handleSelect = (source: GroupMediaSource) => {
    haptics.tap();
    onSelect(source);
    onClose();
  };

  const handlePresetSelect = (uri: string) => {
    haptics.success();
    onSelectPreset?.(uri);
    onClose();
  };

  const handleRemove = () => {
    haptics.press();
    onRemove?.();
    onClose();
  };

  if (!rendered) return null;

  const options: { id: GroupMediaSource; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'camera', label: 'Take photo', icon: 'camera-outline' },
    { id: 'gallery', label: 'Choose from library', icon: 'images-outline' },
  ];

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Reanimated.View style={[styles.backdrop, { backgroundColor: colors.overlay }, backdropStyle]}>
        <AnimatedPressable style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} disableAnimation />
      </Reanimated.View>

      <GestureDetector gesture={gesture}>
        <Reanimated.View style={[styles.sheet, { backgroundColor: colors.surface }, sheetStyle]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {title ? (
            <BodyEmphasis style={[styles.title, { color: colors.textPrimary }]}>{title}</BodyEmphasis>
          ) : null}

          {/* Curated Aesthetic Presets Strip */}
          {presets && presets.length > 0 && onSelectPreset ? (
            <View style={[styles.presetSection, { borderBottomColor: colors.border }]}>
              <Text style={[styles.presetSectionLabel, { color: colors.textSecondary }]}>
                Curated Aesthetics
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetRail}
              >
                {presets.map((preset) => (
                  <AnimatedPressable
                    key={preset.id}
                    style={[styles.presetItem, { borderColor: colors.border }]}
                    onPress={() => handlePresetSelect(preset.uri)}
                    activeOpacity={0.75}
                    scaleValue={0.96}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${preset.label} preset`}
                  >
                    <CachedImage uri={preset.uri} style={styles.presetThumb} contentFit="cover" />
                    <Text style={[styles.presetItemText, { color: colors.textPrimary }]} numberOfLines={1}>
                      {preset.label}
                    </Text>
                  </AnimatedPressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Main Picker Options */}
          {options.map((opt) => (
            <AnimatedPressable
              key={opt.id}
              style={[styles.optionRow, { borderBottomColor: colors.border }]}
              onPress={() => handleSelect(opt.id)}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={opt.label}
            >
              <Ionicons name={opt.icon} size={22} color={colors.brand} />
              <Caption color={colors.textPrimary} style={styles.optionLabel}>{opt.label}</Caption>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </AnimatedPressable>
          ))}

          {/* Remove Photo Action */}
          {canRemove && onRemove ? (
            <AnimatedPressable
              style={[styles.optionRow, { borderBottomColor: colors.border }]}
              onPress={handleRemove}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
            >
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
              <Caption color={colors.danger} style={styles.optionLabel}>Remove photo</Caption>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </AnimatedPressable>
          ) : null}

          <AnimatedPressable
            style={[styles.cancelBtn, { backgroundColor: colors.surfaceAlt }]}
            onPress={onClose}
            activeOpacity={0.8}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <BodyEmphasis color={colors.textPrimary}>Cancel</BodyEmphasis>
          </AnimatedPressable>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 900,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: Radius.xl + 8,
    borderTopRightRadius: Radius.xl + 8,
    paddingHorizontal: Space.md,
    paddingTop: Space.smMd,
    paddingBottom: Space.xl + 20,
    ...Elevation.modal,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Space.sm,
  },
  title: {
    fontSize: TypographyV2.bodyStrong.size,
    paddingHorizontal: Space.sm,
    paddingBottom: Space.sm,
  },
  presetSection: {
    marginBottom: Space.sm,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  presetSectionLabel: {
    fontSize: TypographyV2.caption.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    marginBottom: Space.xs,
    paddingHorizontal: Space.sm,
  },
  presetRail: {
    gap: Space.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  presetItem: {
    width: 72,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    paddingBottom: 4,
  },
  presetThumb: {
    width: 72,
    height: 54,
    marginBottom: 4,
  },
  presetItemText: {
    fontSize: 10,
    fontFamily: TypographyV2.caption.fontFamily,
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md + 2,
    paddingHorizontal: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  optionLabel: {
    flex: 1,
    fontSize: TypographyV2.body.size,
  },
  cancelBtn: {
    marginTop: Space.md,
    paddingVertical: Space.smMd,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
