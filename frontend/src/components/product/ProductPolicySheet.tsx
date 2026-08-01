import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Space, Type } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';

/**
 * ProductPolicySheet — content body for policy disclosure sheets
 * (return policy, shipping policy, privacy policy). Renders inside
 * a BottomSheet host. Flat canvas, no cards, proper typography hierarchy.
 */
export interface ProductPolicySheetProps {
  title: string;
  body: string;
  /** Optional icon for the policy type (e.g. "return", "ship", "lock-closed"). */
  icon?: keyof typeof Ionicons.glyphMap;
}

export function ProductPolicySheet({ title, body, icon }: ProductPolicySheetProps) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.container}>
      {icon ? (
        <View style={styles.iconRow}>
          <Ionicons name={icon} size={20} color={colors.textSecondary} />
        </View>
      ) : null}
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Space.sm,
    gap: Space.sm,
  },
  iconRow: {
    marginBottom: Space.xs,
  },
  title: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  body: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + Space.xs,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
});
