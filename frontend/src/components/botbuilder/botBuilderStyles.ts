import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Radius, Space, Typography, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// Shared stylesheet for the bot builder screen and every extracted step /
// primitive component. Pure refactor — identical rules to the original
// monolithic screen so the rendered output is unchanged.
export function createBotBuilderStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.lg },
  hydrateWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md },
  // Progressive disclosure — collapsible steps
  stepSection: {
    gap: Space.sm },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Control.hit,
    paddingVertical: Space.sm,
    gap: Space.sm },
  stepHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1 },
  stepNumber: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    width: Control.icon,
    textAlign: 'center' },
  stepHeaderText: {
    flex: 1,
    gap: Space.xs / 2 },
  stepTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  stepDetail: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  stepBody: {
    gap: Space.md - 2,
    paddingTop: Space.xs,
    paddingBottom: Space.sm },
  // Publish section (Step 5)
  publishSection: {
    gap: Space.sm,
    paddingTop: Space.md,
    marginTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  publishHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth },
  publishTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  publishHint: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  validationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  validateBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  validateBtnText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  validationResult: {
    flex: 1,
    gap: Space.xs / 2 },
  validationStatus: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size },
  validationError: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  multilineShort: { minHeight: Control.hit * 2, alignItems: 'flex-start' },
  instructionsInput: { minHeight: 156, alignItems: 'flex-start' },
  multilineInput: { textAlignVertical: 'top', paddingTop: Space.sm + Space.xs },
  fieldLabel: {
    color: colors.textSecondary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  option: {
    minHeight: Control.hit,
    justifyContent: 'center',
    paddingHorizontal: Space.md - 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background },
  optionActive: { borderColor: colors.textPrimary, backgroundColor: colors.textPrimary },
  optionText: {
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.body.size },
  optionTextActive: { color: colors.textInverse, fontFamily: Typography.family.semibold },
  choiceList: {},
  choiceRow: { minHeight: Control.hit + Space.lg, flexDirection: 'row', alignItems: 'center', gap: Space.md },
  choiceCopy: { flex: 1, gap: Space.xs - 2 },
  choiceTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  choiceDetail: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  radio: {
    width: Control.icon,
    height: Control.icon,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center' },
  radioActive: { borderColor: colors.textPrimary },
  radioDot: { width: Space.sm + Space.xs, height: Space.sm + Space.xs, borderRadius: Radius.md, backgroundColor: colors.textPrimary },
  invocationPreview: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  invocationText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  caution: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingTop: Space.xs - 2 },
  cautionText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight - 1 },
  riskGroup: { gap: Space.sm },
  riskGroupHeader: { gap: Space.xs - 2 },
  riskGroupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  riskGroupTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  capabilityGroup: { gap: Space.sm },
  capabilityGroupTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  plannedHeader: { gap: Space.xs - 2 },
  plannedHint: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight - 1 },
  permissionList: {},
  permissionRow: { paddingVertical: Space.sm, gap: Space.xs, flexDirection: 'row', alignItems: 'center' },
  permissionCopy: { flex: 1, minHeight: Control.hit, justifyContent: 'center' },
  permissionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  permissionTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  comingSoonBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs - 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt },
  comingSoonText: {
    color: colors.textMuted,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  actions: { flexDirection: 'row', gap: Space.sm },
  action: { flex: 1 } });
}

export type BotBuilderStyles = ReturnType<typeof createBotBuilderStyles>;
