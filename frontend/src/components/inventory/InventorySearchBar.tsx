import React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { InventoryScreenStyles } from './inventoryScreenStyles';

export interface InventorySearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  colors: ThemeColors;
  styles: InventoryScreenStyles;
}

/** Inventory search field — title/brand query with clear affordance. */
export function InventorySearchBar({ value, onChangeText, colors, styles }: InventorySearchBarProps) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search-outline" size={16} color={colors.textMuted} style={styles.searchIcon} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search by title or brand"
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel="Search inventory"
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
