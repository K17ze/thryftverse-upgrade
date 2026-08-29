import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { haptics } from '../../utils/haptics';

interface ListingPreviewFooterProps {
  origin?: 'sell' | 'edit';
  onBack: () => void;
  bottomInset: number;
}

export function ListingPreviewFooter({
  origin,
  onBack,
  bottomInset }: ListingPreviewFooterProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const secondaryLabel = origin === 'sell'
    ? 'Return to publish'
    : origin === 'edit'
    ? 'Return to save'
    : null;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(bottomInset, 12) }]}>
      <Pressable
        style={styles.secondaryBtn}
        onPress={() => { haptics.press(); onBack(); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Back to edit"
      >
        <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        <Text style={styles.secondaryText}>Back to edit</Text>
      </Pressable>

      {secondaryLabel && (
        <Pressable
          style={styles.primaryBtn}
          onPress={() => { haptics.press(); onBack(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
        >
          <Text style={styles.primaryText}>{secondaryLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 48 },
  secondaryText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  primaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: colors.brand,
    minHeight: 48 },
  primaryText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textInverse } });
}
