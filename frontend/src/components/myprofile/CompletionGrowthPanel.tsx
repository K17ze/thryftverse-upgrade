import React from 'react';
import {
  View,
  Text,
  StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTranslation } from '../../i18n/useAppTranslation';

export interface CompletionGrowthPanelProps {
  showCompletionPrompt: boolean;
  showGrowthPrompt: boolean;
  completionPercent: number;
  completionDone: number;
  completionTotal: number;
  completionCtaLabel: string;
  completionCtaFocus?: 'avatar' | 'cover';
  showFirstListingGrowth: boolean;
  showAudienceGrowth: boolean;
  onDismissCompletion: () => void;
  onDismissGrowth: () => void;
  onCompleteProfile: (focus?: 'avatar' | 'cover') => void;
  onListFirstItem: () => void;
  onGrowAudience: () => void;
}

/**
 * Completion and growth presentation panel — surfaces profile completion
 * progress and optional growth tasks (first listing, audience growth).
 * Extracted from MyProfileScreen to isolate the onboarding-prompt domain.
 */
export function CompletionGrowthPanel({
  showCompletionPrompt,
  showGrowthPrompt,
  completionPercent,
  completionDone,
  completionTotal,
  completionCtaLabel,
  completionCtaFocus,
  showFirstListingGrowth,
  showAudienceGrowth,
  onDismissCompletion,
  onDismissGrowth,
  onCompleteProfile,
  onListFirstItem,
  onGrowAudience }: CompletionGrowthPanelProps) {
  const { colors } = useAppTheme();
  const { t: tt } = useAppTranslation('myProfile');
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  if (!showCompletionPrompt && !showGrowthPrompt) return null;

  return (
    <View style={styles.profileStatusPanel}>
      {showCompletionPrompt ? (
        <View style={styles.completionSection}>
          <View style={styles.completionHead}>
            <View style={styles.completionHeadText}>
              <Text style={styles.completionTitle}>{tt('completion.title')}</Text>
              <Text style={styles.completionPercent} maxFontSizeMultiplier={2}>
                {tt('completion.progress', { percent: completionPercent, done: completionDone, total: completionTotal })}
              </Text>
            </View>
            <AnimatedPressable
              style={styles.completionDismiss}
              onPress={onDismissCompletion}
              accessibilityRole="button"
              accessibilityLabel={tt('accessibility.dismissCompletion')}
            >
              <Ionicons name="close" size={16} color={colors.textMuted} aria-hidden={true} />
            </AnimatedPressable>
          </View>
          <View style={styles.completionTrack}>
            <View style={[styles.completionFill, { width: `${completionPercent}%` }]} />
          </View>
          <AnimatedPressable
            style={styles.completionCta}
            onPress={() => onCompleteProfile(completionCtaFocus)}
            accessibilityRole="button"
            accessibilityLabel={completionCtaLabel}
          >
            <Text style={styles.completionCtaText}>{completionCtaLabel}</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.textInverse} aria-hidden={true} />
          </AnimatedPressable>
        </View>
      ) : null}

      {showCompletionPrompt && showGrowthPrompt ? (
        <View style={styles.profileStatusDivider} />
      ) : null}

      {showGrowthPrompt ? (
        <View style={styles.growthSection}>
          <View style={styles.growthHead}>
            <Text style={styles.growthTitle}>{tt('growth.title')}</Text>
            <AnimatedPressable
              style={styles.completionDismiss}
              onPress={onDismissGrowth}
              accessibilityRole="button"
              accessibilityLabel={tt('accessibility.dismissGrowth')}
            >
              <Ionicons name="close" size={16} color={colors.textMuted} aria-hidden={true} />
            </AnimatedPressable>
          </View>

          {showFirstListingGrowth ? (
            <AnimatedPressable
              style={styles.growthRow}
              onPress={onListFirstItem}
              accessibilityRole="button"
              accessibilityLabel={tt('growth.listFirstItemTitle')}
              accessibilityHint={tt('accessibility.listFirstItemHint')}
            >
              <View style={styles.growthRowText}>
                <Text style={styles.growthRowTitle}>{tt('growth.listFirstItemTitle')}</Text>
                <Text style={styles.growthRowSub} maxFontSizeMultiplier={2}>
                  {tt('growth.listFirstItemSub')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
            </AnimatedPressable>
          ) : null}

          {showAudienceGrowth ? (
            <AnimatedPressable
              style={[styles.growthRow, styles.growthRowLast]}
              onPress={onGrowAudience}
              accessibilityRole="button"
              accessibilityLabel={tt('growth.growAudienceTitle')}
              accessibilityHint={tt('accessibility.growAudienceHint')}
            >
              <View style={styles.growthRowText}>
                <Text style={styles.growthRowTitle}>{tt('growth.growAudienceTitle')}</Text>
                <Text style={styles.growthRowSub} maxFontSizeMultiplier={2}>
                  {tt('growth.growAudienceSub')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
            </AnimatedPressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    profileStatusPanel: {
      marginHorizontal: Space.md,
      marginBottom: Space.md,
      borderRadius: RadiusRoleValue.sheetDialog,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt },
    profileStatusDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle },
    completionSection: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      gap: Space.md },
    completionHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.sm },
    completionHeadText: {
      flex: 1,
      gap: Space.xs / 2 },
    completionTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      color: colors.textPrimary },
    completionPercent: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      letterSpacing: 0.1,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
      color: colors.textMuted },
    completionDismiss: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -Space.xs / 2,
      marginRight: -Space.xs / 2,
      borderRadius: RadiusRoleValue.pillAvatar,
      backgroundColor: `${colors.textMuted}14` },
    completionTrack: {
      height: 4,
      borderRadius: RadiusRoleValue.pillAvatar,
      overflow: 'hidden',
      backgroundColor: colors.borderSubtle },
    completionFill: {
      height: '100%',
      borderRadius: RadiusRoleValue.pillAvatar,
      backgroundColor: colors.brand },
    completionCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      minHeight: Control.hit,
      borderRadius: RadiusRoleValue.mediaThumbnail,
      paddingHorizontal: Space.md,
      backgroundColor: colors.brand },
    completionCtaText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: 0.1,
      color: colors.textInverse },

    growthSection: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      gap: Space.sm },
    growthHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.sm },
    growthTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      color: colors.textPrimary },
    growthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.sm,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle },
    growthRowLast: {
      borderBottomWidth: StyleSheet.hairlineWidth },
    growthRowText: {
      flex: 1,
      gap: Space.xs / 2 },
    growthRowTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textPrimary },
    growthRowSub: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textMuted } });
}
