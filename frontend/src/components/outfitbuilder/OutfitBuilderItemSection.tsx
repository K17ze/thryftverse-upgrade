import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { getSlotPluralLabel, type OutfitSlot, type StyleItem } from '../../services/styleGraph';
import { EmptyState } from '../EmptyState';
import { T } from '../ui/Text';
import { OutfitBuilderItemThumb } from './OutfitBuilderItemThumb';

export interface OutfitBuilderItemSectionProps {
  activeSlot: OutfitSlot;
  slotItems: StyleItem[];
  selectedItemId: string | undefined;
  onToggleItem: (item: StyleItem) => void;
  screenWidth: number;
}

/** Section header + 2-column item grid for the active slot (with its own
 *  per-slot empty state). Layout preserved verbatim from the original. */
function OutfitBuilderItemSectionImpl({
  activeSlot,
  slotItems,
  selectedItemId,
  onToggleItem,
  screenWidth }: OutfitBuilderItemSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(), []);
  return (
    <>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <T.Title2 color={colors.textPrimary}>{getSlotPluralLabel(activeSlot)}</T.Title2>
        <T.Meta color={colors.textMuted}>{slotItems.length} items</T.Meta>
      </View>

      {/* Item Grid */}
      {slotItems.length === 0 ? (
        <EmptyState
          icon="shirt-outline"
          title="No items"
          subtitle={`You don't have any ${getSlotPluralLabel(activeSlot).toLowerCase()} in your closet yet.`}
        />
      ) : (
        <View style={styles.grid}>
          {slotItems.map((item) => (
            <View key={item.id}>
              <OutfitBuilderItemThumb
                item={item}
                onPress={() => onToggleItem(item)}
                isSelected={selectedItemId === item.id}
                screenWidth={screenWidth}
              />
            </View>
          ))}
        </View>
      )}
    </>
  );
}

export const OutfitBuilderItemSection = React.memo(OutfitBuilderItemSectionImpl);

function createStyles() {
  return StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Space.md,
    marginBottom: Space.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md } });
}
