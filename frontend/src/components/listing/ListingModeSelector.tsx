import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

export type ListingMode = 'sell_now' | 'co_own' | 'auction';

interface ListingModeSelectorProps {
  mode: ListingMode;
  onChange: (mode: ListingMode) => void;
}

const MODES: { key: ListingMode; label: string; icon: string; description: string }[] = [
  { key: 'sell_now', label: 'Sell now', icon: 'pricetag-outline', description: 'List at a fixed price for immediate purchase.' },
  { key: 'auction', label: 'Auction', icon: 'hammer-outline', description: 'Let buyers bid over a set duration.' },
  { key: 'co_own', label: 'Co-Own', icon: 'people-outline', description: 'Offer fractional shares to investors.' },
];

export function ListingModeSelector({ mode, onChange }: ListingModeSelectorProps) {
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
                name={m.icon as any}
                size={15}
                color={active ? Colors.textInverse : Colors.textMuted}
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

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: Colors.surfaceAlt,
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
    backgroundColor: Colors.brand,
  },
  segmentText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  segmentTextActive: {
    fontFamily: Typography.family.bold,
    color: Colors.textInverse,
  },
  modeDescription: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 8,
    paddingHorizontal: 4,
  },
});
