import { StyleSheet } from 'react-native';
import { Space, Radius, Typography, LetterSpacing } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// Wallet balance — large numeric display, not a typographic token.
// This is a financial display glyph size, not body text.
const WALLET_BALANCE_SIZE = 40;

/** Screen-level styles for WalletScreen and its wallet/* sections —
 *  extracted to keep the orchestrator under the size budget. All colours
 *  are applied inline at the call sites, so this stays a static sheet. */
export const walletScreenStyles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md },

  // ── Balance hero — flat, no card (spec 17 viewport 1) ──
  balanceHero: {
    paddingVertical: Space.sm },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  balanceLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase' },
  // 44pt transparent hit area — visible eye glyph is 20pt
  eyeToggle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Space.xs },
  balanceMasked: {
    fontSize: WALLET_BALANCE_SIZE,
    lineHeight: 44,
    fontFamily: Typography.family.bold,
    letterSpacing: 2,
    marginTop: Space.xs },
  // Largest text on screen — tabular-nums, bold
  balanceValue: {
    fontSize: WALLET_BALANCE_SIZE,
    lineHeight: 44,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    marginTop: Space.xs },
  balanceUnit: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: 44,
    fontFamily: Typography.family.semibold },
  localFiatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs + 2 },
  localFiatText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] },
  localFiatSuffix: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },

  // ── Primary actions — 3 equal-width buttons in a row ──
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.md },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs - 1,
    paddingVertical: Space.sm },
  actionBtnPrimary: {
    borderWidth: 0 },
  actionBtnSecondary: {
    borderWidth: StyleSheet.hairlineWidth },
  actionBtnLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },

  // ── Pending attention row (now FlagshipNavigationRow) ──

  // ── Seller earnings summary row (now FlagshipNavigationRow) ──

  // ── Sub-balance flat rows (restrained — muted, smaller) ──
  breakdownSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 0,
    paddingTop: Space.sm },
  subBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
    gap: Space.md },
  subBalanceLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  subBalanceValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.body.letterSpacing },
  subBalanceUnit: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

  // ── Withdrawable (restrained — muted) ──
  withdrawableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: Space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Space.md,
    marginTop: Space.lg },
  withdrawableLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  withdrawableLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  withdrawableValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.body.letterSpacing },

  // ── Transaction history ──
  txHistorySection: {
    marginTop: Space.lg },
  txHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm },
  txHistoryTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  txHistorySeeAll: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },

  // ── Skeleton ──
  skeletonSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + 2 },

  // ── Safeguarding info (flat canvas, hairline divider — no card) ──
  disclosureSection: {
    paddingHorizontal: 0,
    paddingVertical: Space.md,
    gap: Space.xs },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  infoTitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  infoBody: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  safeguardingLinksRow: {
    flexDirection: 'row',
    gap: Space.md,
    marginTop: Space.sm },
  safeguardingLink: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.wide,
    textTransform: 'uppercase' },
  infoDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginVertical: Space.sm } });
