import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { closetStyles, useClosetThemedStyles } from './closetStyles';

interface ClosetPriceDropChipProps {
  count: number;
  active: boolean;
  onToggle: () => void;
}

/** "Price drops (n)" filter chip — Wishlist tab only. */
export function ClosetPriceDropChip({ count, active, onToggle }: ClosetPriceDropChipProps) {
  const { colors } = useAppTheme();
  const t = useClosetThemedStyles();
  return (
    <View style={closetStyles.filterChipRow}>
      <AnimatedPressable
        style={[
          closetStyles.filterChip,
          t.filterChip,
          active && closetStyles.filterChipActive,
          active && t.filterChipActive,
        ]}
        onPress={onToggle}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Filter price drops: ${count} items on sale`}
      >
        <Ionicons
          name="cash-outline"
          size={13}
          color={active ? colors.background : colors.brand}
        />
        <Text
          style={[
            closetStyles.filterChipText,
            t.filterChipText,
            active && closetStyles.filterChipTextActive,
            active && t.filterChipTextActive,
          ]}
          maxFontSizeMultiplier={2}
        >
          Price drops ({count})
        </Text>
      </AnimatedPressable>
    </View>
  );
}
