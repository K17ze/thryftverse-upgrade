import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CLOSET_SORT_OPTIONS, type ClosetSortOption } from '../../domain/closet';
import { closetStyles, useClosetThemedStyles } from './closetStyles';

interface ClosetSortMenuProps {
  sortBy: ClosetSortOption;
  onSelect: (option: ClosetSortOption) => void;
}

/** Compact sort dropdown — Saved/Wishlist only (visibility owned by parent). */
export function ClosetSortMenu({ sortBy, onSelect }: ClosetSortMenuProps) {
  const { colors } = useAppTheme();
  const t = useClosetThemedStyles();
  return (
    <View style={[closetStyles.sortMenu, t.sortMenu]}>
      {CLOSET_SORT_OPTIONS.map((opt) => (
        <AnimatedPressable
          key={opt}
          style={[
            closetStyles.sortOption,
            t.sortOption,
            sortBy === opt && closetStyles.sortOptionActive,
            sortBy === opt && t.sortOptionActive,
          ]}
          onPress={() => onSelect(opt)}
          activeOpacity={0.85}
        >
          <Text
            style={[
              closetStyles.sortOptionText,
              t.sortOptionText,
              sortBy === opt && closetStyles.sortOptionTextActive,
              sortBy === opt && t.sortOptionTextActive,
            ]}
          >
            {opt}
          </Text>
          {sortBy === opt && <Ionicons name="checkmark" size={16} color={colors.brand} />}
        </AnimatedPressable>
      ))}
    </View>
  );
}
