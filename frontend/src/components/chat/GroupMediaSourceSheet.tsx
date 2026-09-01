import React, { useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
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
import { Caption, BodyEmphasis } from '../ui/Text';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Motion } from '../../theme/motionTokens';

export type GroupMediaSource = 'camera' | 'gallery';

interface GroupMediaSourceSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (source: GroupMediaSource) => void;
  /** Optional label for the title row — e.g. "Change group photo". */
  title?: string;
}

/**
 * GroupMediaSourceSheet — bottom sheet for choosing the photo source.
 *
 * Two options: Camera / Gallery. Matches WhatsApp/Telegram's source
 * selection pattern. Deliberately minimal — no emoji/web-search (those
 * add moderation/licensing complexity for marginal value in a marketplace
 * chat context). The sheet is content-sized, drag-to-dismiss, with
 * haptic feedback on selection.
 */
export function GroupMediaSourceSheet({
  visible,
  onClose,
  onSelect,
  title,
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
    onSelect(source);
    onClose();
  };

  if (!rendered) return null;

  const options: { id: GroupMediaSource; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'camera', label: 'Take photo', icon: 'camera-outline' },
    { id: 'gallery', label: 'Choose from gallery', icon: 'images-outline' },
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
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    alignItems: 'center',
    marginTop: Space.md,
    minHeight: 48,
    justifyContent: 'center',
  },
});
