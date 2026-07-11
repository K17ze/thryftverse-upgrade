import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';

export interface ProductAttributeChipsProps {
  size?: string;
  condition?: string;
  category?: string;
  colour?: string;
  material?: string;
  /** When provided, the size chip becomes tappable and opens the size guide */
  onSizePress?: () => void;
}

export function ProductAttributeChips({
  size,
  condition,
  category,
  colour,
  material,
  onSizePress,
}: ProductAttributeChipsProps) {
  const chips: { label: string; value: string; onPress?: () => void }[] = [];
  if (size) chips.push({ label: 'Size', value: size, onPress: onSizePress });
  if (condition) chips.push({ label: 'Condition', value: condition });
  if (category) chips.push({ label: 'Category', value: category });
  if (colour) chips.push({ label: 'Colour', value: colour });
  if (material) chips.push({ label: 'Material', value: material });

  if (chips.length === 0) return null;

  return (
    <View style={styles.container}>
      {chips.map((chip) => {
        const isTappable = !!chip.onPress;
        const content = (
          <View style={[styles.chip, isTappable && styles.chipTappable]}>
            <View style={styles.chipLabelRow}>
              <Text style={styles.chipLabel}>{chip.label}</Text>
              {isTappable ? (
                <View style={styles.chipGuideIcon}>
                  <Ionicons name="resize-outline" size={11} color={Colors.brand} />
                </View>
              ) : null}
            </View>
            <Text style={styles.chipValue} numberOfLines={1}>
              {chip.value}
            </Text>
          </View>
        );

        if (isTappable && chip.onPress) {
          return (
            <Pressable
              key={chip.label}
              onPress={chip.onPress}
              style={({ pressed }) => [pressed && styles.chipPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Size ${chip.value}, tap to view size guide`}
            >
              {content}
            </Pressable>
          );
        }

        return <View key={chip.label}>{content}</View>;
      })}
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
    paddingVertical: Space.sm + 2,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    minWidth: 80,
    minHeight: 48,
  },
  chipTappable: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${Colors.brand}30`,
  },
  chipPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  chipLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  chipLabel: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  chipGuideIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: `${Colors.brand}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipValue: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});
