import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

interface DiscoveryPreferenceRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  explanation: string;
  value: string;
  onPress: () => void;
  isLast?: boolean;
}

export function DiscoveryPreferenceRow({
  icon,
  title,
  explanation,
  value,
  onPress,
  isLast,
}: DiscoveryPreferenceRowProps) {
  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel={`${title}. Current value: ${value}. ${explanation}`}
    >
      <Ionicons name={icon} size={20} color={Colors.textSecondary} />
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.explanation} numberOfLines={1}>{explanation}</Text>
      </View>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      {!isLast && <View style={styles.separator} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md,
    gap: Space.md,
    minHeight: 48,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  explanation: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  value: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    maxWidth: 120,
  },
  separator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
});
