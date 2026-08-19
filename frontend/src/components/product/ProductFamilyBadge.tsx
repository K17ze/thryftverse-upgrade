import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Space, Radius, Type } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import type { ListingFamily } from '../../platform/product';

export interface ProductFamilyBadgeProps {
  family: ListingFamily;
  /** Optional lifecycle/state accent for the badge (e.g. "Live", "Closed", "Sold"). */
  stateAccent?: string | null;
  /** When true, render a compact dot+label treatment suitable for hero overlay. */
  compact?: boolean;
}

const FAMILY_META: Record<
  ListingFamily,
  { label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  direct: { label: 'Buy now', icon: 'bag-handle-outline' },
  auction: { label: 'Auction', icon: 'pricetag-outline' },
  co_own: { label: 'Co-own', icon: 'people-outline' },
};

/**
 * Premium listing-family indicator shared across all three detail screens.
 * Feels like a product tag, not an admin badge. Renders a single restrained
 * pill with the family icon + label, plus an optional state accent.
 */
export function ProductFamilyBadge({
  family,
  stateAccent,
  compact = false,
}: ProductFamilyBadgeProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const meta = FAMILY_META[family];
  const showAccent = !!stateAccent;

  return (
    <View
      style={[styles.container, compact && styles.containerCompact]}
      accessibilityLabel={`${meta.label}${showAccent ? `, ${stateAccent}` : ''}`}
      accessibilityRole="text"
    >
      <View style={styles.familyChip}>
        <Ionicons name={meta.icon} size={compact ? 11 : 13} color={colors.textInverse} />
        <Text style={[styles.familyLabel, compact && styles.familyLabelCompact]}>
          {meta.label}
        </Text>
      </View>
      {showAccent && (
        <View style={[styles.accentChip, { backgroundColor: colors.brand }]}>
          <Text style={[styles.accentLabel, compact && styles.accentLabelCompact]}>
            {stateAccent}
          </Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  containerCompact: {
    gap: Space.xs - 1,
  },
  familyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs - 1,
    paddingVertical: Space.xs - 1,
    paddingHorizontal: Space.sm,
    backgroundColor: colors.overlay,
    borderRadius: Radius.lg,
  },
  familyLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    color: colors.scrimTextPrimary,
    letterSpacing: 0.2,
  },
  familyLabelCompact: {
    fontSize: 10,
  },
  accentChip: {
    paddingVertical: Space.xs - 1,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.lg,
  },
  accentLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.bold,
    color: colors.scrimTextPrimary,
    letterSpacing: 0.2,
  },
  accentLabelCompact: {
    fontSize: 10,
  },
});
