import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Space, Stroke } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import { saveCtaTitle } from './outfitBuilderViewModels';

export interface OutfitBuilderFooterProps {
  filledCount: number;
  onSave: () => void;
  onShare: () => void;
}

/** Footer CTA — share shortcut + save button gated on ≥2 selected items. */
function OutfitBuilderFooterImpl({ filledCount, onSave, onShare }: OutfitBuilderFooterProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.footer}>
      <View style={styles.footerRow}>
        <AnimatedPressable
          style={styles.shareBtn}
          onPress={onShare}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Share outfit"
          hapticFeedback="light"
        >
          <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
        </AnimatedPressable>
        <View style={{ flex: 1 }}>
          <AppButton
            title={saveCtaTitle(filledCount)}
            variant={filledCount >= 2 ? 'primary' : 'secondary'}
            size="lg"
            onPress={onSave}
            disabled={filledCount < 2}
            icon={<Ionicons name="bookmark-outline" size={18} color={filledCount >= 2 ? colors.background : colors.textPrimary} />}
            trailingIcon={<Ionicons name="arrow-forward" size={18} color={filledCount >= 2 ? colors.background : colors.textMuted} />}
          />
        </View>
      </View>
    </View>
  );
}

export const OutfitBuilderFooter = React.memo(OutfitBuilderFooterImpl);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Platform.OS === 'ios' ? Space.md : Space.sm,
    backgroundColor: colors.background,
    borderTopWidth: Stroke.standard,
    borderTopColor: colors.border },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  shareBtn: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center' } });
}
