import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { LetterSpacing, Radius, Space, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { T } from '../ui/Text';

export interface OutfitBuilderHeaderProps {
  onClose: () => void;
  onClear: () => void;
}

function OutfitBuilderHeaderImpl({ onClose, onClear }: OutfitBuilderHeaderProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.header}>
      <AnimatedPressable
        style={styles.iconBtn}
        onPress={onClose}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Close outfit builder"
        hapticFeedback="light"
      >
        <Ionicons name="close" size={28} color={colors.textPrimary} />
      </AnimatedPressable>
      <T.Headline style={styles.headerTitle}>Outfit Builder</T.Headline>
      <AnimatedPressable
        style={styles.iconBtn}
        onPress={onClear}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Clear outfit"
        hapticFeedback="light"
      >
        <Ionicons name="trash-outline" size={22} color={colors.danger} />
      </AnimatedPressable>
    </View>
  );
}

export const OutfitBuilderHeader = React.memo(OutfitBuilderHeaderImpl);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  iconBtn: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center' },
  headerTitle: {
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps,
    fontSize: TypographyV2.sectionTitle.size } });
}
