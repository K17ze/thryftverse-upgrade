import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Type } from '../../../theme/designTokens';

/**
 * Section rhythm — a flat section header for grouped content.
 *
 * Per spec 02: no separate rounded card for every subsection. Use
 * whitespace, hairline dividers and a quiet section label. The section
 * header is a single small label, not a large bordered title.
 *
 * Optional `trailing` slot renders a quiet action (e.g. "See all").
 */
export interface CommerceDetailSectionProps {
  label: string;
  /** Optional trailing quiet action (e.g. "See all"). */
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  /** When true, a hairline divider renders above the label. Use for
   * mid-page sections; omit for the first section after the hero. */
  divider?: boolean;
  /** Optional accessibility label override. */
  accessibilityLabel?: string;
}

export function CommerceDetailSection({
  label,
  trailing,
  children,
  divider = false,
  accessibilityLabel,
}: CommerceDetailSectionProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      {divider ? (
        <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
      ) : null}
      <View style={styles.header}>
        <Text
          style={[styles.label, { color: colors.textSecondary }]}
          accessibilityRole="header"
          accessibilityLabel={accessibilityLabel ?? label}
        >
          {label}
        </Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -Space.md,
    marginBottom: Space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  label: {
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontWeight: '600',
    letterSpacing: Type.metaElevated.letterSpacing,
  },
});
