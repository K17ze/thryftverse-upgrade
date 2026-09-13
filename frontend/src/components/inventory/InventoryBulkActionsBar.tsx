import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { InventoryScreenStyles } from './inventoryScreenStyles';

export interface InventoryBulkActionsBarProps {
  selectedCount: number;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onCancel: () => void;
  colors: ThemeColors;
  styles: InventoryScreenStyles;
}

/** Bulk actions bar — docked at the bottom while selection mode is active. */
export function InventoryBulkActionsBar({
  selectedCount,
  onPause,
  onResume,
  onDelete,
  onCancel,
  colors,
  styles,
}: InventoryBulkActionsBarProps) {
  return (
    <View
      style={[styles.bulkBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}
    >
      <View style={styles.bulkBarInfo}>
        <Text style={styles.bulkBarCount}>{selectedCount} selected</Text>
      </View>
      <View style={styles.bulkBarActions}>
        <Pressable
          onPress={onPause}
          style={styles.bulkActionBtn}
          accessibilityRole="button"
          accessibilityLabel="Pause selected listings"
        >
          <Ionicons name="pause-outline" size={18} color={colors.textPrimary} />
          <Text style={styles.bulkActionText}>Pause</Text>
        </Pressable>
        <Pressable
          onPress={onResume}
          style={styles.bulkActionBtn}
          accessibilityRole="button"
          accessibilityLabel="Resume selected listings"
        >
          <Ionicons name="play-outline" size={18} color={colors.textPrimary} />
          <Text style={styles.bulkActionText}>Resume</Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          style={styles.bulkActionBtn}
          accessibilityRole="button"
          accessibilityLabel="Delete selected listings"
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={[styles.bulkActionText, { color: colors.danger }]}>Delete</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          style={styles.bulkActionBtn}
          accessibilityRole="button"
          accessibilityLabel="Cancel selection"
        >
          <Text style={styles.bulkCancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
