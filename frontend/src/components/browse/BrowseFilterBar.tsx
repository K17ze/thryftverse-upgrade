import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/designTokens';
import { useHaptic } from '../../hooks/useHaptic';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { BrowseFilterState } from '../../store/useStore';
import type { BrowseStyles } from './browseStyles';

interface BrowseFilterBarProps {
  styles: BrowseStyles;
  colors: ThemeColors;
  categoryId: string;
  subcategoryId?: string;
  title: string;
  browseFilters: BrowseFilterState;
  hasActiveFilters: boolean;
  sortMenuOpen: boolean;
  onToggleSortMenu: () => void;
  saveSearchLabel: string | undefined;
  isCurrentSaved: boolean;
  onSaveSearch: () => void;
  updateBrowseFilters: (updates: Partial<BrowseFilterState>) => void;
}

export function BrowseFilterBar({
  styles,
  colors,
  categoryId,
  subcategoryId,
  title,
  browseFilters,
  hasActiveFilters,
  sortMenuOpen,
  onToggleSortMenu,
  saveSearchLabel,
  isCurrentSaved,
  onSaveSearch,
  updateBrowseFilters }: BrowseFilterBarProps) {
  const navigation = useNavigation<any>();
  const haptic = useHaptic();

  return (
    <View style={styles.filterBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <AnimatedPressable
          style={[styles.filterPill, hasActiveFilters && styles.filterPillActive]}
          onPress={() => navigation.navigate('Filter', { categoryId, subcategoryId, title })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Open filters"
          accessibilityState={{ selected: hasActiveFilters }}
          accessibilityHint={hasActiveFilters ? 'Filters are applied' : 'Opens filter options'}
        >
          <AppIcon
            name="options"
            size={IconSize.sm}
            color={hasActiveFilters ? 'textPrimary' : 'textMuted'}
            accessible={false}
          />
          <Text style={[styles.filterPillText, hasActiveFilters && styles.filterPillTextActive]}>{hasActiveFilters ? 'Filter on' : 'Filter'}</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.sortTrigger, browseFilters.sort !== 'Recommended' && styles.sortTriggerActive]}
          onPress={onToggleSortMenu}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${browseFilters.sort}`}
          accessibilityState={{ expanded: sortMenuOpen }}
        >
          <AppIcon
            name="filter"
            size={IconSize.sm}
            color={browseFilters.sort !== 'Recommended' ? 'textPrimary' : 'textMuted'}
            accessible={false}
          />
          <Text style={[styles.sortTriggerText, browseFilters.sort !== 'Recommended' && styles.sortTriggerTextActive]}>{browseFilters.sort}</Text>
          <AppIcon
            name={sortMenuOpen ? 'chevronUp' : 'chevronDown'}
            size={IconSize.micro}
            color={browseFilters.sort !== 'Recommended' ? 'textPrimary' : 'textMuted'}
            accessible={false}
          />
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.filterPillOutline}
          onPress={() => navigation.navigate('Filter', { categoryId, subcategoryId, title })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Filter by brand"
          accessibilityHint={browseFilters.brands.length > 0 ? `${browseFilters.brands.length} brands selected` : 'Opens brand filter'}
        >
          <Text style={[styles.filterPillText, browseFilters.brands.length > 0 && styles.filterPillTextActive]}>{browseFilters.brands.length > 0 ? `Brand (${browseFilters.brands.length})` : 'Brand'}</Text>
          <AppIcon name="chevronDown" size={IconSize.micro} color={browseFilters.brands.length > 0 ? 'textPrimary' : 'textMuted'} accessible={false} />
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.filterPillOutline}
          onPress={() => navigation.navigate('Filter', { categoryId, subcategoryId, title })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Filter by size"
          accessibilityHint={browseFilters.sizes.length > 0 ? `${browseFilters.sizes.length} sizes selected` : 'Opens size filter'}
        >
          <Text style={[styles.filterPillText, browseFilters.sizes.length > 0 && styles.filterPillTextActive]}>{browseFilters.sizes.length > 0 ? `Size (${browseFilters.sizes.length})` : 'Size'}</Text>
          <AppIcon name="chevronDown" size={IconSize.micro} color={browseFilters.sizes.length > 0 ? 'textPrimary' : 'textMuted'} accessible={false} />
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.filterPillOutline}
          onPress={() => navigation.navigate('Filter', { categoryId, subcategoryId, title })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Filter by condition"
          accessibilityHint={browseFilters.condition !== 'Any' ? `Condition: ${browseFilters.condition}` : 'Opens condition filter'}
        >
          <Text style={[styles.filterPillText, browseFilters.condition !== 'Any' && styles.filterPillTextActive]}>{browseFilters.condition !== 'Any' ? browseFilters.condition : 'Condition'}</Text>
          <AppIcon name="chevronDown" size={IconSize.micro} color={browseFilters.condition !== 'Any' ? 'textPrimary' : 'textMuted'} accessible={false} />
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.filterPillOutline, browseFilters.sustainableOnly && styles.filterPillActive]}
          onPress={() => {
            haptic.light();
            updateBrowseFilters({ sustainableOnly: !browseFilters.sustainableOnly });
          }}
          activeOpacity={0.85}
          accessibilityRole="switch"
          accessibilityState={{ checked: browseFilters.sustainableOnly }}
          accessibilityLabel="Toggle sustainable items only"
        >
          <AppIcon
            name="leaf"
            size={IconSize.sm}
            color={browseFilters.sustainableOnly ? 'textPrimary' : 'textMuted'}
            focused={browseFilters.sustainableOnly}
            accessible={false}
          />
          <Text
            style={[
              styles.filterPillText,
              browseFilters.sustainableOnly && styles.filterPillTextActive,
            ]}
           maxFontSizeMultiplier={2}>
            Sustainable
          </Text>
        </AnimatedPressable>
        {saveSearchLabel && saveSearchLabel !== 'Browse All' && (
          <AnimatedPressable
            style={[styles.filterPillOutline, isCurrentSaved && styles.saveSearchPillActive]}
            activeOpacity={0.85}
            onPress={isCurrentSaved ? undefined : onSaveSearch}
            accessibilityLabel={isCurrentSaved ? 'Search saved with alerts' : 'Save this search with alerts'}
            accessibilityRole="button"
            accessibilityState={{ selected: isCurrentSaved }}
            accessibilityHint={isCurrentSaved ? 'Search is saved' : 'Saves this search and sends alerts for new matches'}
          >
            <Ionicons
              name={isCurrentSaved ? 'notifications' : 'notifications-outline'}
              size={16}
              color={isCurrentSaved ? colors.brand : colors.textSecondary}
              aria-hidden={true}
            />
            <Text style={[styles.filterPillText, isCurrentSaved && styles.saveSearchTextActive]} maxFontSizeMultiplier={2}>
              {isCurrentSaved ? 'Saved' : 'Save search'}
            </Text>
          </AnimatedPressable>
        )}
      </ScrollView>
    </View>
  );
}
