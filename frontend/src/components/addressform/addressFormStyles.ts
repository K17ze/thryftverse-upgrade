import { StyleSheet } from 'react-native';
import { type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Control, LetterSpacing, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/**
 * Style factory for the AddressForm screen and its extracted field
 * components. Centralised so the orchestrator and the components share
 * one source of truth. Mirrors components/settings/settingsScreenStyles.ts.
 */
export function createAddressFormStyles(colors: ThemeColors) {
  return StyleSheet.create({
  flex: {
    flex: 1 },

  // Scroll
  scrollContent: {
    paddingHorizontal: Space.md },

  // Intro
  intro: {
    paddingTop: Space.lg,
    paddingBottom: Space.lg,
    gap: Space.xs },
  introTitle: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    color: colors.textPrimary,
    letterSpacing: LetterSpacing.tight + LetterSpacing.wide },
  introBody: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textSecondary,
    lineHeight: TypographyV2.bodyStrong.lineHeight },

  // Section
  section: {
    paddingVertical: Space.sm },
  sectionLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginBottom: Space.xs + 2 },
  input: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: 0,
    minHeight: Control.hit },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border },

  // Error
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs },
  errorText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger },
  postcodeSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.smMd,
    backgroundColor: colors.brandSubtle,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandBorder },
  postcodeSuggestionText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  postcodeSuggestionBold: {
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary },
  saveErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  saveErrorText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger },

  // Country
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Control.hit,
    paddingVertical: Space.sm + 2 },
  countryText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  countryPlaceholder: {
    color: colors.textMuted },

  // Default toggle
  defaultToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    marginTop: Space.sm,
    minHeight: Control.hit + Space.xs },
  defaultToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1 },
  defaultToggleTextCol: {
    flex: 1,
    gap: Space.xs - 2 },
  defaultToggleTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  defaultToggleSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing },
  defaultSwitch: {
    width: Space.xxl - Space.sm,
    height: Space.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    justifyContent: 'center',
    padding: Space.xs },
  defaultSwitchKnob: {
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: Radius.full },

  // Remove
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    marginTop: Space.lg,
    minHeight: Control.hit + Space.xs },
  removeBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textMuted },

  // Sticky footer
  stickyFooter: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  saveBtn: {
    backgroundColor: colors.brand,
    paddingVertical: Space.md - 2,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Control.hit + Space.xs },
  saveBtnPressed: {
    opacity: 0.7 },
  saveBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textInverse },

  // Signed out
  signedOutContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.sm },
  signedOutTitle: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    color: colors.textPrimary,
    marginTop: Space.sm },
  signedOutBody: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  signedOutBtn: {
    marginTop: Space.md,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md - 2,
    backgroundColor: colors.brand,
    borderRadius: Radius.md,
    minHeight: Control.hit + Space.xs,
    justifyContent: 'center' },
  signedOutBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textInverse } });
}
