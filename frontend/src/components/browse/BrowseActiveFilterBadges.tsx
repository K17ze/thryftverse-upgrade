import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useHaptic } from '../../hooks/useHaptic';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { BrowseFilterState } from '../../store/useStore';
import type { BrowseStyles } from './browseStyles';

interface BrowseActiveFilterBadgesProps {
  styles: BrowseStyles;
  colors: ThemeColors;
  browseFilters: BrowseFilterState;
  updateBrowseFilters: (updates: Partial<BrowseFilterState>) => void;
  onClearAll: () => void;
}

export function BrowseActiveFilterBadges({
  styles,
  colors,
  browseFilters,
  updateBrowseFilters,
  onClearAll }: BrowseActiveFilterBadgesProps) {
  const haptic = useHaptic();

  return (
    <View style={styles.activeBadgeRow}>
      {/* Active filters grouped by category — badges within a category
          are visually adjacent. Category prefix removed from badge text
          (the grouping makes it redundant). A hairline divider separates
          categories when multiple are active. */}
      {browseFilters.brands.map((brand) => (
        <View key={`brand-${brand}`} style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>{brand}</Text>
          <Pressable
            style={styles.activeBadgeClose}
            onPress={() => {
              haptic.light();
              updateBrowseFilters({ brands: browseFilters.brands.filter((b) => b !== brand) });
            }}
            accessibilityRole="button"
            accessibilityLabel={`Remove brand filter ${brand}`}
          >
            <Ionicons name="close" size={12} color={colors.textPrimary} aria-hidden={true} />
          </Pressable>
        </View>
      ))}
      {browseFilters.brands.length > 0 && (browseFilters.sizes.length > 0 || browseFilters.condition !== 'Any' || browseFilters.sustainableOnly) ? (
        <View style={styles.activeBadgeDivider} />
      ) : null}
      {browseFilters.sizes.map((size) => (
        <View key={`size-${size}`} style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>{size}</Text>
          <Pressable
            style={styles.activeBadgeClose}
            onPress={() => {
              haptic.light();
              updateBrowseFilters({ sizes: browseFilters.sizes.filter((s) => s !== size) });
            }}
            accessibilityRole="button"
            accessibilityLabel={`Remove size filter ${size}`}
          >
            <Ionicons name="close" size={12} color={colors.textPrimary} aria-hidden={true} />
          </Pressable>
        </View>
      ))}
      {browseFilters.sizes.length > 0 && (browseFilters.condition !== 'Any' || browseFilters.sustainableOnly) ? (
        <View style={styles.activeBadgeDivider} />
      ) : null}
      {browseFilters.condition !== 'Any' ? (
        <View style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>{browseFilters.condition}</Text>
          <Pressable
            style={styles.activeBadgeClose}
            onPress={() => {
              haptic.light();
              updateBrowseFilters({ condition: 'Any' });
            }}
            accessibilityRole="button"
            accessibilityLabel="Remove condition filter"
          >
            <Ionicons name="close" size={12} color={colors.textPrimary} aria-hidden={true} />
          </Pressable>
        </View>
      ) : null}
      {browseFilters.condition !== 'Any' && browseFilters.sustainableOnly ? (
        <View style={styles.activeBadgeDivider} />
      ) : null}
      {browseFilters.sustainableOnly ? (
        <View style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>Sustainable</Text>
          <Pressable
            style={styles.activeBadgeClose}
            onPress={() => {
              haptic.light();
              updateBrowseFilters({ sustainableOnly: false });
            }}
            accessibilityRole="button"
            accessibilityLabel="Remove sustainable filter"
          >
            <Ionicons name="close" size={12} color={colors.textPrimary} aria-hidden={true} />
          </Pressable>
        </View>
      ) : null}
      <Pressable
        style={styles.clearAllBtn}
        onPress={onClearAll}
        accessibilityRole="button"
        accessibilityLabel="Clear all filters"
      >
        <Text style={styles.clearAllText}>Clear all</Text>
      </Pressable>
    </View>
  );
}
