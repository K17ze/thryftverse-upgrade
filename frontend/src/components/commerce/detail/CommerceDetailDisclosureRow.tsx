import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Control } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
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
  /** Supporting fact below the destination; wraps with large text. */
  summary?: string;
  /** Optional trailing count (e.g. "13" for rights terms). */
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
  accessibilityLabel }: CommerceDetailDisclosureRowProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const handlePress = () => {
    haptic.light();
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
      accessibilityLabel={accessibilityLabel ?? [label, summary, typeof count === 'number' ? String(count) : null].filter(Boolean).join(', ')}
      accessibilityRole="button"
    >
      {leadingIcon ? (
        <Ionicons
          name={leadingIcon}
          size={Control.iconCompact}
          color={critical ? colors.dangerText : colors.textSecondary}
          accessible={false}
        />
      ) : null}
      <View style={styles.labelCluster}>
        <Text
          style={[
            styles.label,
            { color: critical ? colors.dangerText : colors.textPrimary },
          ]}
        >
          {label}
        </Text>
        {summary ? (
          <Text
            style={[styles.summary, { color: colors.textMuted }]}
          >
            {summary}
          </Text>
        ) : null}
      </View>

      <View style={styles.trailingCluster}>
        {typeof count === 'number' ? (
          <Text style={[styles.countText, { color: colors.textSecondary }]}>
            {count}
          </Text>
        ) : null}
        <Ionicons
          name="chevron-forward"
          size={Control.iconCompact}
          color={colors.textMuted}
          accessible={false}
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
    minHeight: Control.hit,
    borderTopWidth: StyleSheet.hairlineWidth },
  pressed: {
    opacity: 0.85 },
  labelCluster: {
    gap: Space.xxs,
    flex: 1,
    minWidth: 0,
    flexShrink: 1 },
  label: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    flexShrink: 1 },
  trailingCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexShrink: 0 },
  summary: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    flexShrink: 1 },
  countText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] } });
