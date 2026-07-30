import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Type, Typography } from '../../../theme/designTokens';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useHaptic } from '../../../hooks/useHaptic';

/**
 * Disclosure row — a tappable row that opens a sheet or expanded section.
 *
 * Used for "View full dossier", "View all risks", "Bid history",
 * "View supply structure", "Auction rules", etc. Replaces the pattern
 * of giving every subsection its own bordered card.
 *
 * The row is flat — no card, no surface fill. A hairline divider
 * separates consecutive disclosure rows. The chevron is a quiet glyph,
 * not a contained pill.
 */
export interface CommerceDetailDisclosureRowProps {
  label: string;
  /** Optional count or summary rendered as a muted trailing line. */
  summary?: string;
  /** Optional count badge (e.g. "13" for rights terms). */
  count?: number;
  onPress: () => void;
  /** Optional leading glyph. */
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  /** When true, the row renders in the danger colour (e.g. critical
   * risk entry). */
  critical?: boolean;
  accessibilityLabel?: string;
}

export function CommerceDetailDisclosureRow({
  label,
  summary,
  count,
  onPress,
  leadingIcon,
  critical = false,
  accessibilityLabel,
}: CommerceDetailDisclosureRowProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptic();

  const handlePress = () => {
    if (!reducedMotion) haptic.light();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        { borderTopColor: colors.borderSubtle },
        pressed && styles.pressed,
      ]}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
    >
      <View style={styles.labelCluster}>
        {leadingIcon ? (
          <Ionicons
            name={leadingIcon}
            size={18}
            color={critical ? colors.danger : colors.textSecondary}
            style={styles.leadingIcon}
          />
        ) : null}
        <Text
          style={[
            styles.label,
            { color: critical ? colors.danger : colors.textPrimary },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>

      <View style={styles.trailingCluster}>
        {summary ? (
          <Text
            style={[styles.summary, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {summary}
          </Text>
        ) : null}
        {typeof count === 'number' ? (
          <View style={[styles.countBadge, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.countText, { color: colors.textSecondary }]}>
              {count}
            </Text>
          </View>
        ) : null}
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textMuted}
          style={styles.chevron}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.985 }],
  },
  labelCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  leadingIcon: {
    marginRight: -2,
  },
  label: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    flexShrink: 1,
  },
  trailingCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    maxWidth: '52%',
    minWidth: 18,
  },
  summary: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    flexShrink: 1,
    textAlign: 'right',
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: Space.xs + 2,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    marginLeft: -2,
  },
});
