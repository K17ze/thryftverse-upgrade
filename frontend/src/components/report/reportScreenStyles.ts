import { StyleSheet } from 'react-native';
import { Space, Typography, Radius, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { ThemeColors } from '../../theme/ThemeContext';

/**
 * Themed styles for ReportScreen and its decomposed sections — extracted
 * to keep the orchestrator under the size budget. Created once in the
 * screen via `useMemo` and passed down as `ReportScreenStyles`.
 */
export function createReportScreenStyles(colors: ThemeColors) {
  return StyleSheet.create({
  intro: {
    paddingVertical: Space.md },
  introTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  introBody: {
    maxWidth: 340,
    marginTop: Space.xs,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2 },
  reasons: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  reason: {
    minHeight: Control.hit + Space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md },
  reasonDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  reasonIcon: {
    width: Space.lg + Space.xs,
    height: Space.lg + Space.xs,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt },
  reasonIconSelected: {
    // TODO: replace `${colors.textPrimary}14` with textPrimarySubtle token when available
    backgroundColor: `${colors.textPrimary}14` },
  reasonCopy: {
    minWidth: 0,
    flex: 1,
    gap: Space.xs / 2 },
  reasonLabel: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight },
  reasonDescription: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2 },
  radio: {
    width: Space.lg - Space.xs,
    height: Space.lg - Space.xs,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center' },
  radioSelected: {
    borderColor: colors.textPrimary },
  radioDot: {
    width: Space.sm + 2,
    height: Space.sm + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.textPrimary },
  details: {
    marginTop: Space.lg },
  detailsLabel: {
    marginBottom: Space.xs + 2,
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  detailsInput: {
    minHeight: Space.xl * 3 + Space.md + Space.xs,
    padding: Space.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    borderRadius: Radius.md,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight },
  characterCount: {
    marginTop: Space.xs,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textAlign: 'right' },
  evidenceLabel: {
    marginTop: Space.lg,
    marginBottom: Space.xs + 2,
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  evidenceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm },
  evidenceTileWrap: {
    position: 'relative' },
  evidenceTile: {
    width: Space.xxl + Space.xl,
    height: Space.xxl + Space.xl,
    borderRadius: Radius.md },
  evidenceRemoveBtn: {
    position: 'absolute',
    top: -Space.xs,
    right: -Space.xs,
    width: Control.chrome,
    height: Control.chrome,
    alignItems: 'center',
    justifyContent: 'center' },
  evidenceTilePlaceholder: {
    backgroundColor: colors.surfaceAlt },
  evidenceStateOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center' },
  evidenceStateBadge: {
    position: 'absolute',
    bottom: Space.xs,
    left: Space.xs,
    width: Space.lg - Space.xs,
    height: Space.lg - Space.xs,
    borderRadius: Radius.full,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center' },
  evidenceUploadRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm },
  evidenceUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    minHeight: Control.hit },
  evidenceUploadText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary },
  evidenceCount: {
    marginTop: Space.xs,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing },
  submitAction: {
    minHeight: Space.xxl,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textPrimary },
  submitDisabled: {
    opacity: 0.36 },
  submitText: {
    color: colors.textInverse,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight },
  complete: {
    alignItems: 'center',
    paddingHorizontal: Space.xl,
    paddingTop: Control.hit * 2 },
  completeTitle: {
    marginTop: Space.md,
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    textAlign: 'center' },
  reportIdText: {
    marginTop: Space.xs,
    color: colors.brand,
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    textAlign: 'center' },
  reportIdNote: {
    marginTop: Space.xs,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    textAlign: 'center' },
  completeBody: {
    maxWidth: 330,
    marginTop: Space.xs,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    textAlign: 'center' },
  submittedAtText: {
    marginTop: Space.xs,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textAlign: 'center' },
  submittedEvidence: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.md,
    justifyContent: 'center' },
  doneAction: {
    minWidth: 150,
    minHeight: Control.hit,
    marginTop: Space.lg,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center' },
  doneActionText: {
    color: colors.textInverse,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight },
  blockAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    minWidth: 160,
    minHeight: Control.hit,
    marginTop: Space.md,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.danger,
    backgroundColor: colors.danger },
  blockActionText: {
    color: colors.textInverse,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight },
  blockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.md,
    maxWidth: 300 },
  blockedNoteText: {
    flex: 1,
    color: colors.success,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2 },
  secondaryDoneAction: {
    minWidth: 140,
    minHeight: Control.hit,
    marginTop: Space.lg,
    paddingHorizontal: Space.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  secondaryDoneText: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight } });
}

export type ReportScreenStyles = ReturnType<typeof createReportScreenStyles>;
