import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Type } from '../../theme/designTokens';

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
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel={`${title}. Current value: ${value}. ${explanation}`}
    >
      <Ionicons name={icon} size={20} color={colors.textSecondary} />
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.explanation} numberOfLines={1}>{explanation}</Text>
      </View>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      {!isLast && <View style={styles.separator} />}
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md,
    gap: Space.md,
    minHeight: 48,
  },
  content: {
    flex: 1,
    gap: Space.xs / 2,
  },
  title: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  explanation: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  value: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    maxWidth: 120,
  },
  separator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
