import { StyleSheet, Platform } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/** Screen-level styles for SellerAuctionCentreScreen — extracted to keep the
 *  orchestrator under the 400-LOC charter. */
export function createSellerAuctionCentreScreenStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background },
    // ── Header ──
    header: {
      paddingBottom: Space.sm,
      paddingHorizontal: Space.sm },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      minHeight: Control.hit },
    headerIconBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    headerIconPressed: {
      opacity: 0.5 },
    headerTitleWrap: {
      flex: 1,
      marginLeft: Space.xs },
    headerTitle: {
      fontFamily: Typography.family.bold,
      fontSize: TypographyV2.priceHero.size,
      lineHeight: TypographyV2.priceHero.lineHeight,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.priceHero.letterSpacing },
    headerSubtitle: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      marginTop: Space.xs / 4,
      letterSpacing: -0.1 },
    // ── List ──
    listContent: {
      paddingBottom: Space.xl },
    rowSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginHorizontal: Space.md },
    // ── Floating CTA ──
    floatingCta: {
      position: 'absolute',
      left: Space.md,
      right: Space.md,
      ...Platform.select({
        ios: {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.12,
          shadowRadius: 12 },
        android: {
          elevation: 4 } }) } });
}
