import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '../../theme/designTokens';
import type { ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { INVENTORY_SORT_OPTIONS, type InventorySortOption } from '../../hooks/inventory/types';
import type { InventoryScreenStyles } from './inventoryScreenStyles';

export interface InventorySortMenuProps {
  sortOption: InventorySortOption;
  sortMenuOpen: boolean;
  onToggleMenu: () => void;
  onSelectOption: (option: InventorySortOption) => void;
  colors: ThemeColors;
  styles: InventoryScreenStyles;
}

/** Sort trigger row plus the inline dropdown menu it opens. */
export function InventorySortMenu({
  sortOption,
  sortMenuOpen,
  onToggleMenu,
  onSelectOption,
  colors,
  styles,
}: InventorySortMenuProps) {
  const haptic = useHaptic();

  return (
    <>
      <View style={styles.sortRow}>
        <Pressable
          onPress={onToggleMenu}
          style={styles.sortTrigger}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${INVENTORY_SORT_OPTIONS.find((o) => o.key === sortOption)?.label}`}
        >
          <Ionicons name="swap-vertical-outline" size={14} color={colors.textMuted} />
          <Text style={styles.sortTriggerText} numberOfLines={1}>
            {INVENTORY_SORT_OPTIONS.find((o) => o.key === sortOption)?.label ?? 'Sort'}
          </Text>
          <Ionicons name={sortMenuOpen ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Sort menu — inline dropdown */}
      {sortMenuOpen ? (
        <View style={styles.sortMenu}>
          {INVENTORY_SORT_OPTIONS.map((opt) => {
            const isActive = opt.key === sortOption;
            return (
              <Pressable
                key={opt.key}
                onPress={() => { haptic.selection(); onSelectOption(opt.key); }}
                style={[styles.sortMenuItem, opt.key === INVENTORY_SORT_OPTIONS[INVENTORY_SORT_OPTIONS.length - 1].key && { borderBottomWidth: 0 }]}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${opt.label}`}
              >
                <Text
                  style={[
                    styles.sortMenuItemText,
                    { color: isActive ? colors.brand : colors.textPrimary },
                    isActive && { fontFamily: Typography.family.semibold },
                  ]}
                >
                  {opt.label}
                </Text>
                {isActive ? <Ionicons name="checkmark" size={16} color={colors.brand} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </>
  );
}
