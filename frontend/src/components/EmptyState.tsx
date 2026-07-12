import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Reanimated, {
  FadeIn,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Typography } from '../theme/designTokens';
import { AnimatedPressable } from './AnimatedPressable';

interface SuggestedAction {
  label: string;
  onPress: () => void;
}

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  /** Contextual hint shown below the subtitle as a subtle tip */
  hint?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  secondaryCtaLabel?: string;
  onSecondaryCtaPress?: () => void;
  suggestedActions?: SuggestedAction[];
  iconColor?: string;
  graphic?: React.ReactNode;
}
export function EmptyState({ icon, title, subtitle, hint, ctaLabel, onCtaPress, secondaryCtaLabel, onSecondaryCtaPress, suggestedActions, iconColor, graphic }: Props) {
  const { colors } = useAppTheme();
  const enter = FadeIn.duration(300);

  return (
    <View style={styles.container}>
      {graphic ? (
        <Reanimated.View entering={enter}>
          {graphic}
        </Reanimated.View>
      ) : (
        <Reanimated.View
          entering={enter}
          style={[styles.iconRing, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
        >
          <Ionicons name={icon ?? 'cube-outline'} size={38} color={iconColor ?? colors.brand} />
        </Reanimated.View>
      )}

      <Reanimated.Text
        entering={enter}
        style={[styles.title, { color: colors.textPrimary }]}
      >
        {title}
      </Reanimated.Text>

      {subtitle && (
        <Reanimated.Text
          entering={enter}
          style={[styles.subtitle, { color: colors.textMuted }]}
        >
          {subtitle}
        </Reanimated.Text>
      )}

      {hint ? (
        <Reanimated.View entering={enter} style={styles.hintWrap}>
          <Ionicons name="bulb-outline" size={12} color={colors.textMuted} />
          <Text style={[styles.hintText, { color: colors.textMuted }]}>{hint}</Text>
        </Reanimated.View>
      ) : null}

      {ctaLabel && onCtaPress && (
        <Reanimated.View entering={enter}>
          <AnimatedPressable style={[styles.cta, { backgroundColor: colors.textPrimary }]} onPress={onCtaPress} activeOpacity={0.8} hapticFeedback="selection">
            <Text style={[styles.ctaText, { color: colors.background }]}>{ctaLabel}</Text>
          </AnimatedPressable>
        </Reanimated.View>
      )}

      {secondaryCtaLabel && onSecondaryCtaPress && (
        <Reanimated.View entering={enter}>
          <AnimatedPressable style={[styles.ctaSecondary, { borderColor: colors.border }]} onPress={onSecondaryCtaPress} activeOpacity={0.8} hapticFeedback="light">
            <Text style={[styles.ctaSecondaryText, { color: colors.textPrimary }]}>{secondaryCtaLabel}</Text>
          </AnimatedPressable>
        </Reanimated.View>
      )}

      {suggestedActions && suggestedActions.length > 0 && (
        <Reanimated.View entering={enter} style={styles.suggestedWrap}>
          <Text style={[styles.suggestedLabel, { color: colors.textMuted }]}>Suggested</Text>
          <View style={styles.chipRow}>
            {suggestedActions.map((action, i) => (
              <AnimatedPressable
                key={i}
                style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={action.onPress}
                activeOpacity={0.8}
                hapticFeedback="light"
              >
                <Text style={[styles.chipText, { color: colors.textPrimary }]}>{action.label}</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  title: {
    fontSize: 20,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.08,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 260,
  },
  hintWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
    maxWidth: 280,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.medium,
    lineHeight: 17,
  },
  cta: {
    marginTop: 20,
    paddingHorizontal: Space.xl,
    paddingVertical: 14,
    borderRadius: 24,
  },
  ctaText: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.3,
  },
  ctaSecondary: {
    marginTop: 10,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
  },
  ctaSecondaryText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
  },
  suggestedWrap: {
    marginTop: 20,
    alignItems: 'center',
    gap: 10,
  },
  suggestedLabel: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
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
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
});