import React from 'react';
import {
  View,
  Text,
  StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { SellerTrustSummary } from '../../platform/product';

export interface CoOwnHoldingPreview {
  id: string;
  title: string;
  image: string;
  yourUnits: number;
}

export interface StorefrontAboutTabProps {
  coOwnHoldings: CoOwnHoldingPreview[];
  website: string | null;
  sellerTrust: SellerTrustSummary | null | undefined;
  reducedMotion: boolean;
  onViewPortfolio: () => void;
}

/**
 * About tab body — flat editorial layout showing co-own portfolio preview,
 * website, and shop policies. Extracted from MyProfileScreen.
 */
export function StorefrontAboutTab({
  coOwnHoldings,
  website,
  sellerTrust,
  reducedMotion,
  onViewPortfolio }: StorefrontAboutTabProps) {
  const { colors } = useAppTheme();
  const { t: tt } = useAppTranslation('myProfile');
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <Reanimated.View
      key="about"
      entering={reducedMotion ? undefined : FadeIn.duration(200)}
      style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}
    >
      {/* ── CO-OWN PORTFOLIO PREVIEW — recessed into About tab ── */}
      {coOwnHoldings.length > 0 ? (
        <AnimatedPressable
          style={styles.portfolioPreview}
          onPress={onViewPortfolio}
          accessibilityRole="button"
          accessibilityLabel={tt('accessibility.viewCoOwnPortfolio')}
          accessibilityHint={tt('accessibility.viewCoOwnPortfolioHint')}
        >
          <View style={styles.portfolioHeader}>
            <Text style={styles.portfolioLabel}>{tt('about.coOwnPortfolio')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xs / 2 }}>
              <Text style={styles.portfolioHoldingUnits}>{tt('about.viewAll')}</Text>
              <Ionicons name="chevron-forward" size={12} color={colors.textMuted} aria-hidden={true} />
            </View>
          </View>
          <View style={styles.portfolioHoldings}>
            {coOwnHoldings.slice(0, 3).map((h) => (
              <View key={h.id} style={styles.portfolioHoldingCard}>
                {h.image ? (
                  <CachedImage
                    uri={h.image}
                    style={styles.portfolioHoldingImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.portfolioHoldingImage, { backgroundColor: colors.surfaceAlt }]} />
                )}
                <View style={styles.portfolioHoldingInfo}>
                  <Text style={styles.portfolioHoldingTitle} numberOfLines={1} maxFontSizeMultiplier={2}>
                    {h.title}
                  </Text>
                  <Text style={styles.portfolioHoldingUnits} maxFontSizeMultiplier={2}>
                    {h.yourUnits} {h.yourUnits === 1 ? tt('about.unit') : tt('about.units')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </AnimatedPressable>
      ) : null}

      {website ? (
        <View style={styles.aboutContainer}>
          <View style={[styles.aboutRow, styles.aboutRowLast]}>
            <Text style={styles.aboutLabel}>{tt('about.website')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xs }}>
              <Text style={[styles.aboutValue, { flexShrink: 1 }]} numberOfLines={1}>{website}</Text>
              <Ionicons name="open-outline" size={12} color={colors.textMuted} aria-hidden={true} />
            </View>
          </View>
        </View>
      ) : null}

      {/* Shop policies — canonical home for dispatch/response details.
          Trust badges above show a compact "Replies Xh" pill; this section
          provides the full policy context without duplicating the badge. */}
      <View style={styles.aboutContainer}>
        <Text style={styles.aboutSectionTitle}>{tt('about.shopPolicies')}</Text>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>{tt('about.payments')}</Text>
          <Text style={styles.aboutValue}>{tt('about.paymentsValue')}</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>{tt('about.shipping')}</Text>
          <Text style={styles.aboutValue} maxFontSizeMultiplier={2}>
            {sellerTrust?.dispatchTimeLabel
              ? tt('about.shippingSeller', { label: sellerTrust.dispatchTimeLabel.toLowerCase() })
              : tt('about.shippingDefault')}
          </Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>{tt('about.returns')}</Text>
          <Text style={styles.aboutValue}>{tt('about.returnsValue')}</Text>
        </View>
        {sellerTrust?.responseRate !== null && sellerTrust?.responseRate !== undefined ? (
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>{tt('about.responseRate')}</Text>
            <Text style={styles.aboutValue}>{sellerTrust.responseRate}%</Text>
          </View>
        ) : null}
        <View style={[styles.aboutRow, styles.aboutRowLast]}>
          <Text style={styles.aboutLabel}>{tt('about.response')}</Text>
          <Text style={styles.aboutValue} maxFontSizeMultiplier={2}>
            {sellerTrust?.responseTimeLabel
              ? tt('about.responseSeller', { label: sellerTrust.responseTimeLabel.toLowerCase() })
              : tt('about.responseDefault')}
          </Text>
        </View>
      </View>

      {!website && !sellerTrust && (
        <Text style={styles.aboutEmpty}>{tt('about.noDetails')}</Text>
      )}
    </Reanimated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Co-Own portfolio preview — flagship elevated card ──
    portfolioPreview: {
      marginHorizontal: Space.md,
      marginTop: Space.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      borderRadius: RadiusRoleValue.sheetDialog,
      backgroundColor: colors.surfaceAlt },
    portfolioHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Space.md },
    portfolioLabel: {
      fontSize: TypographyV2.label.size,
      fontFamily: FontFamily.bold,
      letterSpacing: TypographyV2.label.letterSpacing,
      color: colors.textSecondary },
    portfolioHoldings: {
      flexDirection: 'row',
      gap: Space.md },
    portfolioHoldingCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2 },
    portfolioHoldingImage: {
      width: 48,
      height: 48,
      borderRadius: RadiusRoleValue.mediaThumbnail,
      flexShrink: 0 },
    portfolioHoldingInfo: {
      flexShrink: 1,
      gap: Space.xxs },
    portfolioHoldingTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textPrimary },
    portfolioHoldingUnits: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      lineHeight: TypographyV2.meta.lineHeight,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
      color: colors.textMuted },

    // About — flat editorial rows, flagship elevated
    aboutContainer: {
      paddingHorizontal: Space.md },
    aboutSectionTitle: {
      fontSize: TypographyV2.label.size,
      fontFamily: FontFamily.bold,
      letterSpacing: TypographyV2.label.letterSpacing,
      paddingTop: Space.md + 4,
      paddingBottom: Space.sm,
      color: colors.textPrimary },
    aboutRow: {
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: Space.xs },
    aboutRowLast: {
      borderBottomWidth: 0 },
    aboutLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.label.letterSpacing,
      color: colors.textMuted },
    aboutValue: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textPrimary },
    aboutEmpty: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      textAlign: 'center',
      paddingVertical: Space.xl + Space.sm,
      color: colors.textMuted } });
}
