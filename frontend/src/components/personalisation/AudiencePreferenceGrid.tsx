import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

export interface AudienceOption {
  key: string;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const AUDIENCE_OPTIONS: AudienceOption[] = [
  { key: 'Women', label: 'Women', subtitle: 'Womenswear and accessories', icon: 'female-outline' },
  { key: 'Men', label: 'Men', subtitle: 'Menswear and accessories', icon: 'male-outline' },
  { key: 'Kids', label: 'Kids', subtitle: "Children's clothing", icon: 'happy-outline' },
  { key: 'All', label: 'All', subtitle: 'Show every department', icon: 'grid-outline' },
];

interface AudiencePreferenceGridProps {
  selectedGenders: string[];
  onSelect: (gender: string) => void;
}

export function AudiencePreferenceGrid({
  selectedGenders,
  onSelect,
}: AudiencePreferenceGridProps) {
  return (
    <View style={styles.grid}>
      {AUDIENCE_OPTIONS.map((option) => {
        const isSelected = selectedGenders.includes(option.key);
        const isAllExclusive = option.key === 'All';
        return (
          <Pressable
            key={option.key}
            style={[
              styles.tile,
              isSelected && styles.tileSelected,
            ]}
            onPress={() => onSelect(option.key)}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${option.label} — ${option.subtitle}${
              isAllExclusive ? '. Mutually exclusive with other options.' : ''
            }${isSelected ? '. Selected' : ''}`}
          >
            <View style={styles.tileHeader}>
              <Ionicons
                name={option.icon}
                size={20}
                color={isSelected ? Colors.textPrimary : Colors.textSecondary}
              />
              {isSelected && (
                <Ionicons name="checkmark" size={16} color={Colors.textPrimary} />
              )}
            </View>
            <Text
              style={[
                styles.tileLabel,
                isSelected && styles.tileLabelSelected,
              ]}
            >
              {option.label}
            </Text>
            <Text style={styles.tileSubtitle} numberOfLines={2}>
              {option.subtitle}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  tile: {
    width: '48%',
    flexGrow: 1,
    padding: Space.md,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minHeight: 48,
  },
  tileSelected: {
    borderColor: Colors.textPrimary,
    backgroundColor: Colors.surfaceAlt,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  tileLabel: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  tileLabelSelected: {
    color: Colors.textPrimary,
  },
  tileSubtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    lineHeight: 17,
  },
});
