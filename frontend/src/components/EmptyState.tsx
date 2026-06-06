import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Reanimated, {
  cancelAnimation,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ActiveTheme, Colors } from '../constants/colors';
import { Typography , Elevation  } from '../theme/designTokens';
import { AnimatedPressable } from './AnimatedPressable';
import { useReducedMotion } from '../hooks/useReducedMotion';

const IS_LIGHT = ActiveTheme === 'light';
const RING_BG = IS_LIGHT ? '#f0ebe3' : '#151515';

interface SuggestedAction {
  label: string;
  onPress: () => void;
}

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  secondaryCtaLabel?: string;
  onSecondaryCtaPress?: () => void;
  suggestedActions?: SuggestedAction[];
  iconColor?: string;
}
export function EmptyState({ icon, title, subtitle, ctaLabel, onCtaPress, secondaryCtaLabel, onSecondaryCtaPress, suggestedActions, iconColor = Colors.brand }: Props) {
  const reducedMotionEnabled = useReducedMotion();

  // Floating animation on the icon ring
  const translateY = useSharedValue(0);
  const iconScale = useSharedValue(0.8);

  useEffect(() => {
    if (reducedMotionEnabled) {
      cancelAnimation(translateY);
      cancelAnimation(iconScale);
      translateY.value = 0;
      iconScale.value = 1;
      return;
    }

    // Gentle float up/down
    translateY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Spring entrance on mount
    iconScale.value = withSpring(1, { damping: 12, stiffness: 150 });

    return () => {
      cancelAnimation(translateY);
      cancelAnimation(iconScale);
    };
  }, [iconScale, reducedMotionEnabled, translateY]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: iconScale.value },
    ],
  }));

  const iconEnterAnimation = reducedMotionEnabled
    ? undefined
    : FadeInDown.delay(100).duration(500).springify();
  const titleEnterAnimation = reducedMotionEnabled
    ? undefined
    : FadeInDown.delay(200).duration(400);
  const subtitleEnterAnimation = reducedMotionEnabled
    ? undefined
    : FadeInDown.delay(300).duration(400);
  const ctaEnterAnimation = reducedMotionEnabled
    ? undefined
    : FadeInDown.delay(400).duration(400);

  return (
    <View style={styles.container}>
      <Reanimated.View
        entering={iconEnterAnimation}
        style={[styles.iconRing, { borderColor: iconColor + '25' }, floatStyle]}
      >
        <Ionicons name={icon} size={38} color={iconColor} />
      </Reanimated.View>

      <Reanimated.Text
        entering={titleEnterAnimation}
        style={styles.title}
      >
        {title}
      </Reanimated.Text>

      {subtitle && (
        <Reanimated.Text
          entering={subtitleEnterAnimation}
          style={styles.subtitle}
        >
          {subtitle}
        </Reanimated.Text>
      )}

      {ctaLabel && onCtaPress && (
        <Reanimated.View entering={ctaEnterAnimation}>
          <AnimatedPressable style={styles.cta} onPress={onCtaPress} activeOpacity={0.8} hapticFeedback="selection">
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </AnimatedPressable>
        </Reanimated.View>
      )}

      {secondaryCtaLabel && onSecondaryCtaPress && (
        <Reanimated.View entering={ctaEnterAnimation}>
          <AnimatedPressable style={styles.ctaSecondary} onPress={onSecondaryCtaPress} activeOpacity={0.8} hapticFeedback="light">
            <Text style={styles.ctaSecondaryText}>{secondaryCtaLabel}</Text>
          </AnimatedPressable>
        </Reanimated.View>
      )}

      {suggestedActions && suggestedActions.length > 0 && (
        <Reanimated.View entering={ctaEnterAnimation} style={styles.suggestedWrap}>
          <Text style={styles.suggestedLabel}>Suggested</Text>
          <View style={styles.chipRow}>
            {suggestedActions.map((action, i) => (
              <AnimatedPressable
                key={i}
                style={styles.chip}
                onPress={action.onPress}
                activeOpacity={0.8}
                hapticFeedback="light"
              >
                <Text style={styles.chipText}>{action.label}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </Reanimated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
    gap: 10,
  },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: RING_BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...Elevation.card,
  },
  title: {
    fontSize: 20,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.2,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.08,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 260,
  },
  cta: {
    marginTop: 20,
    backgroundColor: Colors.textPrimary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
    ...Elevation.floating,
  },
  ctaText: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.3,
    color: Colors.background,
  },
  ctaSecondary: {
    marginTop: 10,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ctaSecondaryText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  suggestedWrap: {
    marginTop: 20,
    alignItems: 'center',
    gap: 10,
  },
  suggestedLabel: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});
