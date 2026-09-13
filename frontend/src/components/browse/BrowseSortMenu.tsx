import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../theme/ThemeContext';
import { getSortOptions } from './sortOptions';
import type { BrowseStyles } from './browseStyles';

interface BrowseSortMenuProps {
  styles: BrowseStyles;
  colors: ThemeColors;
  categoryId: string;
  searchQuery?: string;
  activeSort: string;
  onSelect: (sortValue: string) => void;
}

export function BrowseSortMenu({
  styles,
  colors,
  categoryId,
  searchQuery,
  activeSort,
  onSelect }: BrowseSortMenuProps) {
  return (
    <View style={styles.sortMenu}>
      {getSortOptions(categoryId, searchQuery).map((opt, idx) => {
        const sortOpts = getSortOptions(categoryId, searchQuery);
        const isActive = activeSort === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            style={[styles.sortMenuItem, idx === sortOpts.length - 1 && { borderBottomWidth: 0 }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${opt.label}`}
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.sortMenuItemText, isActive && styles.sortMenuItemTextActive]} maxFontSizeMultiplier={2}>
              {opt.label}
            </Text>
            {isActive ? <Ionicons name="checkmark" size={16} color={colors.brand} aria-hidden={true} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
