import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTranslation } from '../../i18n/useAppTranslation';

export interface AwayModeBannerProps {
  onPress: () => void;
}

/**
 * Away-mode indicator — shown under the identity hero when holiday mode is
 * enabled; routes to privacy settings. Extracted from MyProfileScreen.
 */
export function AwayModeBanner({ onPress }: AwayModeBannerProps) {
  const { colors } = useAppTheme();
  const { t: tt } = useAppTranslation('myProfile');
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      style={styles.awayBanner}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tt('accessibility.holidayMode')}
    >
      <Ionicons name="pause-circle" size={18} color={colors.textMuted} aria-hidden={true} />
      <View style={styles.awayBannerTextWrap}>
        <Text style={styles.awayBannerTitle}>{tt('holiday.title')}</Text>
        <Text style={styles.awayBannerSub} maxFontSizeMultiplier={2}>
          {tt('holiday.subtitle')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    awayBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + 2,
      marginHorizontal: Space.md,
      marginBottom: Space.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md - 2,
      borderRadius: RadiusRoleValue.sheetDialog,
      backgroundColor: colors.surfaceAlt },
    awayBannerTextWrap: {
      flex: 1,
      gap: Space.xs / 2 },
    awayBannerTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.semibold,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      color: colors.textPrimary },
    awayBannerSub: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textMuted } });
}
