import { StyleSheet } from 'react-native';
import { Space, Radius, Typography, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
type ThemeColorsType = ReturnType<typeof useAppTheme>['colors'];

export function createPublishStyles(colors: ThemeColorsType) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary },
    closeBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.sm },
    scrollBody: {
      paddingHorizontal: Space.md },
    scrollContent: {
      paddingBottom: Space.xl,
      gap: Space.sm },
    sectionLabel: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      letterSpacing: 0.2,
      marginTop: Space.xs,
      textTransform: 'uppercase' },
    captionInput: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textPrimary,
      minHeight: 80,
      textAlignVertical: 'top',
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.hairline,
      borderColor: colors.borderSubtle,
      backgroundColor: colors.surfaceAlt },
    captionCount: {
      alignSelf: 'flex-end',
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      marginTop: Space.xs },
    captionErrorWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.xs },
    captionErrorText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.danger },
    audienceSegment: {
      flexDirection: 'row',
      alignSelf: 'center',
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      padding: 2 },
    audienceSegmentBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.md,
      borderRadius: Radius.full,
      justifyContent: 'center' },
    audienceSegmentBtnActive: {
      backgroundColor: colors.brand },
    audienceSegmentText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary },
    audienceSegmentTextActive: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold },
    interactionRow: {
      flexDirection: 'row',
      gap: Space.sm,
      paddingVertical: Space.xs },
    interactionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.md,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      borderColor: colors.border },
    interactionPillActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand },
    interactionPillText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary },
    interactionPillTextActive: {
      color: colors.textInverse },
    // ── Cover selection ──
    coverScroll: {
      marginHorizontal: -Space.md },
    coverContainer: {
      paddingHorizontal: Space.md,
      gap: Space.sm,
      paddingBottom: Space.xs },
    coverThumbWrap: {
      borderRadius: Radius.md,
      overflow: 'hidden',
      borderWidth: Stroke.emphasis,
      borderColor: 'transparent' },
    coverThumbActive: {
      borderColor: colors.brand },
    coverBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 20,
      height: 20,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center' },
    draftBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      height: 44,
      borderRadius: Radius.full },
    draftBtnText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary },
    publishBtn: {
      width: '100%',
      height: 50,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center' },
    publishBtnDisabled: {
      opacity: 0.4 },
    publishBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    // Offline banner — shown when device has no connectivity.
    // Uses warning color (amber) to signal caution without alarm.
    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: colors.warningSubtle,
      marginBottom: Space.sm },
    offlineBannerText: {
      flex: 1,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      lineHeight: TypographyV2.meta.lineHeight },
    centerState: {
      alignItems: 'center',
      paddingVertical: Space.xl,
      gap: Space.sm },
    centerStateTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.screenTitle.size,
      color: colors.textPrimary },
    centerStateText: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary,
      textAlign: 'center' },
    // ── Upload progress state ──
    progressState: {
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xl,
      gap: Space.sm },
    progressLabel: {
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      color: colors.textPrimary },
    progressBarTrack: {
      width: '100%',
      height: 4,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden' },
    progressBarFill: {
      height: '100%',
      borderRadius: Radius.full,
      backgroundColor: colors.brand },
    cancelUploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.md,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.md,
      alignSelf: 'center' },
    cancelUploadText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary },
    // ── Error state ──
    errorCircle: {
      width: 72,
      height: 72,
      borderRadius: Radius.full,
      backgroundColor: colors.dangerSubtle,
      justifyContent: 'center',
      alignItems: 'center' },
    errorTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      color: colors.textPrimary },
    errorDetail: {
      fontFamily: TypographyV2.body.fontFamily,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: Space.md },
    unknownCircle: {
      width: 72,
      height: 72,
      borderRadius: Radius.full,
      backgroundColor: colors.warningSubtle,
      justifyContent: 'center',
      alignItems: 'center' },
    unknownDetail: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: Space.md },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: 50,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      marginTop: Space.sm },
    retryBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    saveDraftLink: {
      paddingVertical: Space.sm,
      marginTop: Space.xs,
      alignItems: 'center',
      justifyContent: 'center' },
    saveDraftLinkText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary },
    // ── Success state ──
    successCircle: {
      width: 72,
      height: 72,
      borderRadius: Radius.full,
      backgroundColor: colors.successSubtle,
      justifyContent: 'center',
      alignItems: 'center' },
    successTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      color: colors.textPrimary },
    doneBtn: {
      width: '100%',
      height: 52,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.md },
    doneBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    viewLink: {
      marginTop: Space.sm,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.md,
    },
    viewLinkText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      color: colors.brand,
    },
    successBtnGroup: {
      width: '100%',
      gap: Space.sm,
      marginTop: Space.md },
    viewBtn: {
      width: '100%',
      height: 50,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center' },
    viewBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      width: '100%',
      height: 44,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      borderColor: colors.brand },
    createBtnText: {
      color: colors.brand,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },
    // ── Schedule failed state ──
    scheduleFailedDetail: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: Space.md },
    scheduleFailedViewBtn: {
      width: '100%',
      height: 44,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center' },
    scheduleFailedViewText: {
      color: colors.textSecondary,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },
    reviewBody: {
      flex: 1 },
    previewSection: {
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm },
    previewExpand: {
      position: 'absolute',
      bottom: Space.xs,
      right: Space.xs,
      width: 28,
      height: 28,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center' },
    previewHint: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      textAlign: 'center' },
    captionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center' },
    publishOptionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.sm },
    publishOptionLabel: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textPrimary },
    coverPreview: {
      alignSelf: 'center',
      width: 160,
      height: 200,
      borderRadius: Radius.md,
      overflow: 'hidden' },
    pageCountBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      minWidth: 20,
      height: 20,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6 },
    pageCountText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.meta.size,
      color: colors.textPrimary },
    stickyFooter: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: Space.xs } });
}
