import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';

export interface ProductAttributeChipsProps {
  size?: string;
  condition?: string;
  category?: string;
  colour?: string;
  material?: string;
}

export function ProductAttributeChips({
  size,
  condition,
  category,
  colour,
  material,
}: ProductAttributeChipsProps) {
  const chips: { label: string; value: string }[] = [];
  if (size) chips.push({ label: 'Size', value: size });
  if (condition) chips.push({ label: 'Condition', value: condition });
  if (category) chips.push({ label: 'Category', value: category });
  if (colour) chips.push({ label: 'Colour', value: colour });
  if (material) chips.push({ label: 'Material', value: material });

  if (chips.length === 0) return null;

  return (
    <View style={styles.container}>
      {chips.map((chip) => (
        <View key={chip.label} style={styles.chip}>
          <Text style={styles.chipLabel}>{chip.label}</Text>
          <Text style={styles.chipValue} numberOfLines={1}>
            {chip.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.sm,
  },
  chip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    minWidth: 80,
  },
  chipLabel: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  chipValue: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});
