import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
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
    gap: Space.sm },
  iconRow: {
    marginBottom: Space.xs },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  body: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + Space.xs,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing } });
