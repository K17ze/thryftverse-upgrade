/**
 * MoodboardSelectionControls — selection overlay controls for the canvas.
 *
 * `SelectionControl` is the 44pt circular overlay button (delete / layer
 * order / comment). `SelectionControls` is the overlay row that hosts the
 * buttons: single-item controls (bring to front / send to back / comment /
 * delete) or, in multi-select mode with 2+ items, batch controls (bring all
 * to front / delete all). `MultiSelectBadge` is the count + cancel pill
 * overlaid at the top of the canvas while multi-select is active.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize, type IoniconsGlyphName, type SemanticIconName } from '../../theme/iconTokens';
import type { MoodboardItem } from '../../services/moodboardApi';

// ---------------------------------------------------------------------------
// Selection control button — delete / layer order
// ---------------------------------------------------------------------------
export interface SelectionControlProps {
  icon: SemanticIconName | IoniconsGlyphName;
  label: string;
  hint: string;
  onPress: () => void;
  destructive?: boolean;
}

export const SelectionControl = React.memo(function SelectionControl({
  icon,
  label,
  hint,
  onPress,
  destructive }: SelectionControlProps) {
  const { colors } = useAppTheme();
  return (
    <AnimatedPressable
      style={[
        styles.selectionControl,
        { backgroundColor: colors.overlay },
        destructive && { backgroundColor: colors.danger },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      scaleValue={0.94}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <AppIcon name={icon} size={IconSize.md} color={colors.scrimTextPrimary} accessible={false} />
    </AnimatedPressable>
  );
});

// ---------------------------------------------------------------------------
// Multi-select badge — count + cancel, overlaid at the top of the canvas
// ---------------------------------------------------------------------------
export interface MultiSelectBadgeProps {
  count: number;
  onCancel: () => void;
}

export function MultiSelectBadge({ count, onCancel }: MultiSelectBadgeProps) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.multiSelectBadge} pointerEvents="box-none">
      <View style={[styles.multiSelectPill, { backgroundColor: colors.overlay }]}>
        <Text style={[styles.multiSelectCountText, { color: colors.scrimTextPrimary }]}>
          {count} selected
        </Text>
        <Pressable
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel multi-select"
          accessibilityHint="Exits multi-select mode"
        >
          <Text style={[styles.multiSelectCancelText, { color: colors.scrimTextPrimary }]}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Selection controls row — overlaid on canvas, above items.
// In multi-select mode, batch controls replace the single-item controls.
// ---------------------------------------------------------------------------
export interface SelectionControlsProps {
  multiSelectMode: boolean;
  selectedCount: number;
  selectedItem: MoodboardItem | null;
  onBringAllToFront: () => void;
  onDeleteSelected: () => void;
  onReorder: (id: string, direction: 'front' | 'back') => void;
  onComment: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
}

export function SelectionControls({
  multiSelectMode,
  selectedCount,
  selectedItem,
  onBringAllToFront,
  onDeleteSelected,
  onReorder,
  onComment,
  onDeleteItem }: SelectionControlsProps) {
  if (multiSelectMode) {
    if (selectedCount < 2) return null;
    return (
      <View style={styles.selectionControlsRow} pointerEvents="box-none">
        <SelectionControl
          icon="arrow-up"
          label="Bring all to front"
          hint="Moves all selected items above the others"
          onPress={() => void onBringAllToFront()}
        />
        <SelectionControl
          icon="trash-outline"
          label="Delete all selected"
          hint="Deletes all selected items from the canvas"
          onPress={() => void onDeleteSelected()}
          destructive
        />
      </View>
    );
  }
  if (!selectedItem) return null;
  return (
    <View style={styles.selectionControlsRow} pointerEvents="box-none">
      <SelectionControl
        icon="arrow-up"
        label="Bring to front"
        hint="Moves this item above all others"
        onPress={() => void onReorder(selectedItem.id, 'front')}
      />
      <SelectionControl
        icon="arrow-down"
        label="Send to back"
        hint="Moves this item below all others"
        onPress={() => void onReorder(selectedItem.id, 'back')}
      />
      <SelectionControl
        icon="chatbubble-outline"
        label="Comment"
        hint="Add a comment anchored to this item"
        onPress={() => {
          onComment(selectedItem.id);
        }}
      />
      <SelectionControl
        icon="trash-outline"
        label="Remove from moodboard"
        hint="Deletes this item from the canvas"
        onPress={() => void onDeleteItem(selectedItem.id)}
        destructive
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Static styles (no theme dependency — themed colors are applied inline)
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  selectionControlsRow: {
    position: 'absolute',
    bottom: Space.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.sm },
  selectionControl: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  multiSelectBadge: {
    position: 'absolute',
    top: Space.sm,
    left: 0,
    right: 0,
    alignItems: 'center' },
  multiSelectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.full },
  multiSelectCountText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  multiSelectCancelText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily } });
