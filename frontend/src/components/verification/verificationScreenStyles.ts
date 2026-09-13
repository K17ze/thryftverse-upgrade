import { StyleSheet } from 'react-native';
import { Space, Radius, Typography, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { ThemeColors } from '../../theme/ThemeContext';

/**
 * Style factory for the Verification screen's extracted flow components.
 * Centralised so every verification component shares one source of truth.
 */
export function createVerificationScreenStyles(colors: ThemeColors) {
  return StyleSheet.create({
  flowCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    marginBottom: Space.md,
    overflow: 'hidden' },
  flowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  flowTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  flowBody: {
    padding: Space.md,
    gap: Space.sm },
  fieldLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginBottom: Space.xs },
  input: {
    height: Control.hit,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    paddingHorizontal: Space.sm,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  fieldRow: {
    flexDirection: 'row',
    gap: Space.sm },
  fieldHalf: { flex: 1 },
  docOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.sm,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard },
  docOptionText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  uploadPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.lg,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    borderStyle: 'dashed' },
  uploadText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center',
    paddingHorizontal: Space.md },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    marginTop: Space.xs },
  uploadBtnRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs },
  uploadBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary },
  uploadPreview: {
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    overflow: 'hidden' },
  previewImage: {
    width: '100%',
    height: 180,
    backgroundColor: colors.surfaceAlt },
  previewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm },
  previewActionText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  previewActionDivider: {
    width: 1,
    height: 16 },
  reviewDocumentPreview: {
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: Space.xs },
  reviewDocumentImage: {
    width: '100%',
    height: 120,
    backgroundColor: colors.surfaceAlt },
  reviewDocumentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    padding: Space.sm },
  reviewDocumentText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  flowNavRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm },
  flowBackBtn: {
    flex: 1,
    height: Control.hit,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center' },
  flowBackBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary },
  flowPrimaryBtn: {
    flex: 1,
    height: Control.hit,
    borderRadius: Radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center' },
  flowPrimaryBtnDisabled: {
    opacity: 0.6 },
  flowPrimaryBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textInverse },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: Space.md },
  reviewLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  reviewValue: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    flex: 1,
    textAlign: 'right' },
  countryScroll: {
    marginVertical: -Space.xs },
  countryScrollContent: {
    gap: Space.xs + 2,
    paddingVertical: Space.xs },
  countryChip: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.sm,
    borderWidth: Stroke.standard },
  countryChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingVertical: Space.xs },
  checkboxText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },
  footerNote: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center',
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.lg },
  footerLink: {
    color: colors.brand,
    fontFamily: Typography.family.semibold } });
}

export type VerificationScreenStyles = ReturnType<typeof createVerificationScreenStyles>;
