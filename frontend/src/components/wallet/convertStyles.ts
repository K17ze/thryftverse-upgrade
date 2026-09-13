import { StyleSheet } from 'react-native';

import type { ThemeColors } from '../../theme/ThemeContext';
import {
  Space,
  Radius,
  Stroke,
  Control,
  LetterSpacing } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// -- Styles --
// Shared styles factory for the WalletConvert surface and its
// components/wallet/Convert* step components. Moved verbatim from
// screens/WalletConvertScreen.tsx — pure refactor, no visual changes.
export function createConvertStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    skeletonContainer: {
      paddingHorizontal: Space.md + Space.xs,
      paddingTop: Space.md },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      height: Space.xl + Space.xl + 8,
      borderBottomWidth: Stroke.standard,
      borderBottomColor: colors.border },
    backBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'flex-start' },
    headerTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      color: colors.textPrimary },

    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: Stroke.standard },
    offlineBannerText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight },

    // -- Step indicator --
    stepIndicatorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md + Space.xs,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    stepItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    stepDot: {
      width: 22,
      height: 22,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      alignItems: 'center',
      justifyContent: 'center' },
    stepDotText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: LetterSpacing.wide },
    stepLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    stepConnector: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      marginHorizontal: Space.xs },

    content: {
      flex: 1,
      paddingHorizontal: Space.md + Space.xs },

    // -- Hero balance (flat, no card or decorative icon circle) --
    balanceBlock: {
      marginTop: Space.md,
      marginBottom: Space.lg,
      paddingHorizontal: Space.xs },
    heroTitle: {
      fontSize: TypographyV2.priceHero.size,
      lineHeight: TypographyV2.priceHero.lineHeight,
      fontFamily: TypographyV2.priceHero.fontFamily,
      letterSpacing: TypographyV2.priceHero.letterSpacing,
      fontVariant: ['tabular-nums'] },
    heroSubtitle: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginTop: Space.xs / 2 },

    // -- Amount input --
    amountWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Space.xl + Space.xl - 8,
      marginBottom: Space.sm + Space.xs },
    amountSuffix: {
      fontSize: TypographyV2.priceHero.size + 12,
      fontFamily: TypographyV2.priceHero.fontFamily,
      color: colors.textMuted,
      marginRight: Space.sm,
      letterSpacing: LetterSpacing.wide },
    amountInput: {
      fontSize: TypographyV2.priceHero.size + 28,
      fontFamily: TypographyV2.priceHero.fontFamily,
      color: colors.textPrimary,
      minWidth: Space.xxl * 3 + Space.xs + 2,
      fontVariant: ['tabular-nums'] },
    availableText: {
      textAlign: 'center',
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary,
      marginBottom: Space.sm,
      fontVariant: ['tabular-nums'] },
    balanceError: {
      textAlign: 'center',
      marginTop: Space.xs,
      marginBottom: Space.md + 4,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.danger },

    // -- Calculation / summary (flat, no card wrapper) --
    calcBlock: {
      marginTop: Space.sm,
      paddingHorizontal: Space.xs },
    quoteLoadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs },
    quoteErrorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs },
    quoteStatusText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    reviewBlock: {
      marginTop: Space.md,
      gap: Space.xs,
      paddingHorizontal: Space.xs },
    reviewTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    reviewHint: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight + 2,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginTop: Space.sm + Space.xs },
    rateTimestampRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.sm },
    rateTimestampText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    rateExpiryText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontVariant: ['tabular-nums'] },

    // -- Summary rows --
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.xs },
    summaryLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    summaryValue: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      fontVariant: ['tabular-nums'] },

    // -- Centered step (auth / executing / error) --
    centeredStep: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.lg,
      paddingTop: Space.xxl },
    stepIcon: {
      marginBottom: Space.md },
    stepTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      textAlign: 'center',
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      marginBottom: Space.xs },
    stepSubtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      textAlign: 'center',
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
      marginBottom: Space.lg,
      maxWidth: 320 },
    authActions: {
      flexDirection: 'column',
      gap: Space.sm,
      width: 280,
      maxWidth: '100%' },
    authActionBtn: {
      width: '100%' },

    // -- Receipt --
    receiptWrap: {
      alignItems: 'center',
      paddingTop: Space.xl,
      paddingHorizontal: Space.md },
    receiptBlock: {
      width: '100%',
      paddingHorizontal: Space.xs },
    receiptTitle: {
      fontSize: TypographyV2.screenTitle.size,
      lineHeight: TypographyV2.screenTitle.lineHeight,
      fontFamily: TypographyV2.screenTitle.fontFamily,
      letterSpacing: TypographyV2.screenTitle.letterSpacing,
      textAlign: 'center',
      marginBottom: Space.xs },
    receiptSubtitle: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Space.lg,
      maxWidth: 320 },
    footer: {
      paddingVertical: Space.md + 4,
      paddingHorizontal: Space.md + Space.xs,
      borderTopWidth: Stroke.standard,
      borderTopColor: colors.border,
      backgroundColor: colors.background },
    primaryBtn: {
      backgroundColor: colors.textPrimary,
      height: Space.xl + Space.xl + 8,
      borderRadius: Space.lg + 4,
      alignItems: 'center',
      justifyContent: 'center' },
    primaryBtnDisabled: { opacity: 0.45 },
    primaryText: {
      color: colors.background,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      fontVariant: ['tabular-nums'] },
    secondaryBtn: {
      height: Space.xl + 8,
      borderRadius: Space.lg + 4,
      alignItems: 'center',
      justifyContent: 'center' } });
}
