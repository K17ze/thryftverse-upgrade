/**
 * Edit-listing surface styles — static layout geometry plus the themed colour
 * overlay, extracted verbatim from EditListingScreen. Follows the same
 * convention as closetStyles.ts: section components import `editListingStyles`
 * and `useEditListingThemedStyles` directly instead of receiving a themed bag
 * through props.
 */
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export const editListingStyles = StyleSheet.create({
  navStatusText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  navStatusUnsaved: {
    fontFamily: Typography.family.semibold },
  scroll: {
    flex: 1 },
  scrollContent: {
    paddingBottom: Space.md },
  loadingContainer: {
    flex: 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.md },
  skeletonFormGap: {
    gap: Space.sm },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl },
  errorTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  retryBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.xxl },
  retryBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  statusDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.sm },
  statusDotActive: {},
  statusText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  restrictedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm },
  restrictedText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  sectionGroup: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg },
  sectionHeading: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Space.sm },
  fieldGroup: {
    paddingVertical: Space.xs },
  fieldLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginBottom: Space.xs },
  fieldInput: {
    fontSize: Typography.size.bodyLarge,
    fontFamily: Typography.family.regular,
    paddingVertical: Space.sm,
    minHeight: Control.hit + Space.sm },
  fieldInputDisabled: {
    opacity: 0.5 },
  hairline: {
    height: Stroke.hairline,
    marginVertical: Space.xs },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    minHeight: Control.hit + Space.sm },
  pickerRowInner: {
    flex: 1 },
  pickerValue: {
    fontSize: Typography.size.bodyLarge,
    fontFamily: Typography.family.regular },
  pickerPlaceholder: {},
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center' },
  currencySymbol: {
    fontSize: Typography.size.bodyLarge,
    fontFamily: Typography.family.bold,
    marginRight: Space.xs + 2 },
  priceInput: {
    flex: 1,
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily },
  discountPreview: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs },
  descInput: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    minHeight: Space.xxl + Space.xxl + Space.sm,
    paddingVertical: Space.sm,
    lineHeight: TypographyV2.bodyStrong.lineHeight + 1 },
  charCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'right' },
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm },
  inlineErrorText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

  /* -- price suggestion block -- */
  priceSuggestionBlock: {
    marginTop: Space.xs,
    gap: 0 },
  soldCompsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
    paddingVertical: Space.xs },
  soldCompsText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    flex: 1 },
  soldCompsAction: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

  /* -- field validation -- */
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs },
  fieldRequiredHint: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

  /* -- category-aware completeness indicator (flat inline) -- */
  completenessRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  completenessTextWrap: {
    flex: 1,
    gap: Space.xs / 2 },
  completenessLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  completenessHint: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily } });

/**
 * Theme-aware colour overlays for `editListingStyles`. The static sheet
 * carries only non-colour geometry; every colour comes from here so the
 * surface stays dark-mode compatible.
 */
export function useEditListingThemedStyles() {
  const { colors } = useAppTheme();
  return useMemo(() => ({
    navStatusText: { color: colors.textMuted },
    navStatusUnsaved: { color: colors.brand },
    errorTitle: { color: colors.textPrimary },
    retryBtn: { backgroundColor: colors.brand },
    retryBtnText: { color: colors.textInverse },
    statusDot: { backgroundColor: colors.textMuted },
    statusDotActive: { backgroundColor: colors.success },
    statusText: { color: colors.textSecondary },
    restrictedText: { color: colors.textMuted },
    sectionHeading: { color: colors.textSecondary },
    fieldLabel: { color: colors.textSecondary },
    fieldInput: { color: colors.textPrimary },
    hairline: { backgroundColor: colors.border },
    pickerValue: { color: colors.textPrimary },
    pickerPlaceholder: { color: colors.textMuted },
    currencySymbol: { color: colors.textMuted },
    discountPreview: { color: colors.success },
    descInput: { color: colors.textPrimary },
    charCount: { color: colors.textMuted },
    inlineErrorText: { color: colors.danger },
    priceSuggestion: { color: colors.brand },
    priceMarketHigh: { color: colors.warning },
    priceMarketLow: { color: colors.textMuted },
    priceMarketGood: { color: colors.success },
    priceNoCompsHint: { color: colors.textMuted },
    fieldValid: { color: colors.success },
    fieldRequiredHint: { color: colors.textMuted },
    charCountWarn: { color: colors.warning },
    soldCompsText: { color: colors.textMuted },
    soldCompsAction: { color: colors.brand } }), [colors]);
}
