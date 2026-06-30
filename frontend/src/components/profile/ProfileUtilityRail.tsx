import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

interface UtilityItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  accessibilityLabel: string;
}

interface ProfileUtilityRailProps {
  items: UtilityItem[];
}

export function ProfileUtilityRail({ items }: ProfileUtilityRailProps) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item, index) => (
          <React.Fragment key={item.label}>
            <AnimatedPressable
              style={styles.item}
              onPress={item.onPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={item.accessibilityLabel}
            >
              <Ionicons name={item.icon} size={18} color={Colors.textSecondary} />
              <Text style={styles.label} numberOfLines={1}>{item.label}</Text>
              {item.value ? (
                <Text style={styles.value} numberOfLines={1}>{item.value}</Text>
              ) : null}
            </AnimatedPressable>
            {index < items.length - 1 && <View style={styles.separator} />}
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Space.sm,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    gap: 0,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  label: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  value: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  separator: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: Colors.border,
  },
});
