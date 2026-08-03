import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography } from '../../theme/designTokens';

export type ListingMode = 'sell_now' | 'co_own' | 'auction';

interface ListingModeSelectorProps {
  mode: ListingMode;
  onChange: (mode: ListingMode) => void;
}

const MODES: { key: ListingMode; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; description: string }[] = [
  { key: 'sell_now', label: 'Sell now', icon: 'pricetag-outline', description: 'List at a fixed price for immediate purchase.' },
  { key: 'auction', label: 'Auction', icon: 'hammer-outline', description: 'Let buyers bid over a set duration.' },
  { key: 'co_own', label: 'Co-Own', icon: 'people-outline', description: 'Offer fractional shares to investors.' },
];

export function ListingModeSelector({ mode, onChange }: ListingModeSelectorProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const activeMode = MODES.find((m) => m.key === mode);

  return (
    <View style={styles.container}>
      <View style={styles.segmentRow}>
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <Pressable
              key={m.key}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => onChange(m.key)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${m.label} mode`}
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                name={m.icon}
                size={15}
                color={active ? colors.textInverse : colors.textMuted}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.segmentText,
                  active && styles.segmentTextActive,
                ]}
              >
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {activeMode && (
        <Text style={styles.modeDescription}>{activeMode.description}</Text>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    padding: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: colors.brand,
  },
  segmentText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
  },
  segmentTextActive: {
    fontFamily: Typography.family.bold,
    color: colors.textInverse,
  },
  modeDescription: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  });
}
