import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
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
  const meta = FAMILY_META[family];
  const showAccent = !!stateAccent;

  return (
    <View
      style={[styles.container, compact && styles.containerCompact]}
      accessibilityLabel={`${meta.label}${showAccent ? `, ${stateAccent}` : ''}`}
      accessibilityRole="text"
    >
      <View style={styles.familyChip}>
        <Ionicons name={meta.icon} size={compact ? 11 : 13} color={Colors.textInverse} />
        <Text style={[styles.familyLabel, compact && styles.familyLabelCompact]}>
          {meta.label}
        </Text>
      </View>
      {showAccent && (
        <View style={styles.accentChip}>
          <Text style={[styles.accentLabel, compact && styles.accentLabelCompact]}>
            {stateAccent}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  containerCompact: {
    gap: 4,
  },
  familyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.lg,
  },
  familyLabel: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
    letterSpacing: 0.2,
  },
  familyLabelCompact: {
    fontSize: 10,
  },
  accentChip: {
    paddingVertical: 5,
    paddingHorizontal: Space.sm,
    backgroundColor: Colors.brand,
    borderRadius: Radius.lg,
  },
  accentLabel: {
    fontSize: 12,
    fontFamily: Typography.family.bold,
    color: Colors.textInverse,
    letterSpacing: 0.2,
  },
  accentLabelCompact: {
    fontSize: 10,
  },
});
