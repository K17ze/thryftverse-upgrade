/**
 * AITrustBadge — a compact inline pill that communicates AI confidence.
 *
 * Per AGENTS.md §11 (Truthful UI): confidence is never a fabricated percentage.
 * We expose a qualitative level (high / medium / low / exploratory) backed by a
 * coloured dot. Colour is never the sole signal — a text label always accompanies
 * the dot so colour-blind users can still read the confidence.
 *
 * Per AGENTS.md §4 (Push to Maximum Quality):
 *  - Flat composition, single pill surface, no card-on-card
 *  - Design tokens only — no hardcoded values
 *  - useAppTheme() for all colours
 *  - Two non-avatar radii max (Radius.full for the pill)
 *
 * Per AGENTS.md §13 (Control Quality): accessibilityRole + accessibilityLabel
 * describe both the confidence level and the demo flag.
 *
 * 2026 AI trust-signal research:
 *  - Confidence signals are a P0 flagship requirement
 *  - Reference: https://mantlr.com/blog/design-ai-features-trust (2026)
 *  - Reference: https://www.lazarev.agency/articles/ai-ux-patterns (2026)
 */
import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';

/** Qualitative confidence level — never a raw percentage to users. */
export type AIConfidence = 'high' | 'medium' | 'low' | 'exploratory';

interface AITrustBadgeProps {
  /** Qualitative confidence level. */
  confidence: AIConfidence;
  /** Optional override label; defaults to a human-readable confidence word. */
  label?: string;
  /** When true, renders a subtle "Demo" suffix so the user is never misled. */
  isDemo?: boolean;
  style?: StyleProp<ViewStyle>;
}

const CONFIDENCE_LABEL: Record<AIConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  exploratory: 'Exploratory',
};

/** Dot colour per confidence level. Uses semantic theme tokens, not raw hex. */
function dotColorFor(confidence: AIConfidence, colors: ThemeColors): string {
  switch (confidence) {
    case 'high':
      return colors.success;
    case 'medium':
      return colors.warning;
    case 'low':
      return colors.discovery;
    case 'exploratory':
    default:
      return colors.textMuted;
  }
}

/**
 * A small pill badge: coloured dot + label (+ optional "Demo" suffix).
 * Use inline next to AI-driven content to surface confidence at a glance.
 */
export function AITrustBadge({
  confidence,
  label,
  isDemo,
  style,
}: AITrustBadgeProps) {
  const { colors } = useAppTheme();
  const dotColor = dotColorFor(confidence, colors);
  const text = label ?? CONFIDENCE_LABEL[confidence];
  const a11yLabel = `${text}${isDemo ? '. Demo mode' : ''}`;

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={a11yLabel}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text
        style={[styles.label, { color: colors.textSecondary }]}
        numberOfLines={1}
      >
        {text}
      </Text>
      {isDemo && (
        <Text
          style={[styles.demoSuffix, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          · Demo
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    borderRadius: Radius.full,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
  },
  label: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
  },
  demoSuffix: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
});
