import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';

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
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

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
                color={isSelected ? colors.textPrimary : colors.textSecondary}
              />
              {isSelected && (
                <Ionicons name="checkmark" size={16} color={colors.textPrimary} />
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  tile: {
    width: '48%',
    flexGrow: 1,
    padding: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  tileSelected: {
    borderColor: colors.textPrimary,
    backgroundColor: colors.surfaceAlt,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  tileLabel: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  tileLabelSelected: {
    color: colors.textPrimary,
  },
  tileSubtitle: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    lineHeight: 17,
  },
});
