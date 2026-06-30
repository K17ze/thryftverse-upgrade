import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Reanimated, {
  FadeIn,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Typography } from '../theme/designTokens';
import { AnimatedPressable } from './AnimatedPressable';

interface SuggestedAction {
  label: string;
  onPress: () => void;
}

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  secondaryCtaLabel?: string;
  onSecondaryCtaPress?: () => void;
  suggestedActions?: SuggestedAction[];
  iconColor?: string;
  graphic?: React.ReactNode;
}
export function EmptyState({ icon, title, subtitle, ctaLabel, onCtaPress, secondaryCtaLabel, onSecondaryCtaPress, suggestedActions, iconColor = Colors.brand, graphic }: Props) {
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
          style={styles.iconRing}
        >
          <Ionicons name={icon ?? 'cube-outline'} size={38} color={iconColor} />
        </Reanimated.View>
      )}

      <Reanimated.Text
        entering={enter}
        style={styles.title}
      >
        {title}
      </Reanimated.Text>

      {subtitle && (
        <Reanimated.Text
          entering={enter}
          style={styles.subtitle}
        >
          {subtitle}
        </Reanimated.Text>
      )}

      {ctaLabel && onCtaPress && (
        <Reanimated.View entering={enter}>
          <AnimatedPressable style={styles.cta} onPress={onCtaPress} activeOpacity={0.8} hapticFeedback="selection">
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </AnimatedPressable>
        </Reanimated.View>
      )}

      {secondaryCtaLabel && onSecondaryCtaPress && (
        <Reanimated.View entering={enter}>
          <AnimatedPressable style={styles.ctaSecondary} onPress={onSecondaryCtaPress} activeOpacity={0.8} hapticFeedback="light">
            <Text style={styles.ctaSecondaryText}>{secondaryCtaLabel}</Text>
          </AnimatedPressable>
        </Reanimated.View>
      )}

      {suggestedActions && suggestedActions.length > 0 && (
        <Reanimated.View entering={enter} style={styles.suggestedWrap}>
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
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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