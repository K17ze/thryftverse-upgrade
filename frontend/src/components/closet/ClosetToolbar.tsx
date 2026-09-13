import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppInput } from '../ui/AppInput';
import type { ClosetSortOption } from '../../domain/closet';
import { closetStyles, useClosetThemedStyles } from './closetStyles';

interface ClosetToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  placeholder: string;
  /** Sort/filter controls only apply to the Saved and Wishlist tabs. */
  showItemControls: boolean;
  sortBy: ClosetSortOption;
  onToggleSortMenu: () => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  /** Whether a brand filter is active — drives the "1" badge. */
  brandFilterActive: boolean;
}

/**
 * Compact search + sort/filter toolbar — single icons, not chip walls.
 * The sort toggle intentionally has no haptic (unchanged from the screen).
 */
export function ClosetToolbar({
  searchQuery,
  onSearchChange,
  placeholder,
  showItemControls,
  sortBy,
  onToggleSortMenu,
  showFilters,
  onToggleFilters,
  brandFilterActive,
}: ClosetToolbarProps) {
  const { colors } = useAppTheme();
  const t = useClosetThemedStyles();
  return (
    <View style={closetStyles.closetToolbar}>
      <AppInput
        value={searchQuery}
        onChangeText={onSearchChange}
        placeholder={placeholder}
        prefix={<Ionicons name="search" size={18} color={colors.textMuted} />}
        suffix={
          searchQuery.length > 0 ? (
            <AnimatedPressable onPress={() => onSearchChange('')} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </AnimatedPressable>
          ) : null
        }
        containerStyle={{ flex: 1, marginBottom: 0 }}
      />
      {showItemControls ? (
        <>
          <AnimatedPressable
            style={closetStyles.closetToolbarBtn}
            onPress={onToggleSortMenu}
            accessibilityLabel={`Sort by ${sortBy}`}
            accessibilityRole="button"
          >
            <Ionicons name="swap-vertical" size={20} color={colors.textPrimary} />
          </AnimatedPressable>
          <AnimatedPressable
            style={closetStyles.closetToolbarBtn}
            onPress={onToggleFilters}
            accessibilityLabel={showFilters ? 'Close filters' : 'Open filters'}
            accessibilityRole="button"
          >
            <Ionicons name="options-outline" size={20} color={colors.textPrimary} />
            {brandFilterActive ? (
              <View style={[closetStyles.closetToolbarBadge, t.closetToolbarBadge]}>
                <Text style={[closetStyles.closetToolbarBadgeText, t.closetToolbarBadgeText]}>1</Text>
              </View>
            ) : null}
          </AnimatedPressable>
        </>
      ) : null}
    </View>
  );
}
