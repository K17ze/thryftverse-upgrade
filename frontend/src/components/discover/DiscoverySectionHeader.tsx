import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors } from '../../constants/colors';
import { Typography, Space } from '../../theme/designTokens';

interface Props {
  kicker?: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: object;
}

export function DiscoverySectionHeader({
  kicker,
  title,
  actionLabel,
  onAction,
  style,
}: Props) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.textBlock}>
        {kicker ? (
          <Text style={styles.kicker}>{kicker}</Text>
        ) : null}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
      {actionLabel && onAction ? (
        <AnimatedPressable
          style={styles.actionBtn}
          onPress={onAction}
          activeOpacity={0.8}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} ${title}`}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.textPrimary} />
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
    gap: 8,
  },
  textBlock: {
    flex: 1,
    flexShrink: 1,
  },
  kicker: {
    fontFamily: Typography.family.medium,
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 2,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: Typography.family.bold,
    fontSize: 20,
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.surfaceAlt,
  },
  actionLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: 12,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
});
