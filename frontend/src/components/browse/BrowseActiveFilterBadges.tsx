import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useHaptic } from '../../hooks/useHaptic';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
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
  const { formatFromFiat } = useFormattedPrice();

  // Badges are collected then joined with hairline dividers — every active
  // filter dimension (query, price, brand, size, condition, sustainable)
  // gets a removable badge, so a price-only or query-only filter never
  // produces an empty badge row.
  const badges: { key: string; label: string; accessibilityLabel: string; onRemove: () => void }[] = [];

  const query = browseFilters.query.trim();
  if (query.length > 0) {
    badges.push({
      key: 'query',
      label: `"${query}"`,
      accessibilityLabel: `Remove search filter ${query}`,
      onRemove: () => updateBrowseFilters({ query: '' }) });
  }

  const hasPrice = browseFilters.priceMin != null || browseFilters.priceMax != null;
  if (hasPrice) {
    // Filter values are GBP — format through the fiat formatter so a
    // non-GBP user sees converted amounts on the badge.
    const fiat = { displayMode: 'fiat' as const };
    const priceLabel =
      browseFilters.priceMin != null && browseFilters.priceMax != null
        ? `${formatFromFiat(browseFilters.priceMin, 'GBP', fiat)} – ${formatFromFiat(browseFilters.priceMax, 'GBP', fiat)}`
        : browseFilters.priceMin != null
          ? `Over ${formatFromFiat(browseFilters.priceMin, 'GBP', fiat)}`
          : `Under ${formatFromFiat(browseFilters.priceMax ?? 0, 'GBP', fiat)}`;
    badges.push({
      key: 'price',
      label: priceLabel,
      accessibilityLabel: 'Remove price filter',
      onRemove: () => updateBrowseFilters({ priceMin: null, priceMax: null }) });
  }

  for (const brand of browseFilters.brands) {
    badges.push({
      key: `brand-${brand}`,
      label: brand,
      accessibilityLabel: `Remove brand filter ${brand}`,
      onRemove: () => updateBrowseFilters({ brands: browseFilters.brands.filter((b) => b !== brand) }) });
  }

  for (const size of browseFilters.sizes) {
    badges.push({
      key: `size-${size}`,
      label: size,
      accessibilityLabel: `Remove size filter ${size}`,
      onRemove: () => updateBrowseFilters({ sizes: browseFilters.sizes.filter((s) => s !== size) }) });
  }

  if (browseFilters.condition !== 'Any') {
    badges.push({
      key: 'condition',
      label: browseFilters.condition,
      accessibilityLabel: 'Remove condition filter',
      onRemove: () => updateBrowseFilters({ condition: 'Any' }) });
  }

  return (
    <View style={styles.activeBadgeRow}>
      {badges.map((badge, idx) => (
        <React.Fragment key={badge.key}>
          {idx > 0 ? <View style={styles.activeBadgeDivider} /> : null}
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>{badge.label}</Text>
            <Pressable
              style={styles.activeBadgeClose}
              onPress={() => {
                haptic.light();
                badge.onRemove();
              }}
              accessibilityRole="button"
              accessibilityLabel={badge.accessibilityLabel}
            >
              <Ionicons name="close" size={12} color={colors.textPrimary} aria-hidden={true} />
            </Pressable>
          </View>
        </React.Fragment>
      ))}
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
