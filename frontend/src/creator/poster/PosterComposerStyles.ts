/**
 * PosterComposerStyles — the Poster composer's StyleSheet factory.
 *
 * Extracted from PosterComposerScreen (pure extraction — no visual or
 * behavioral change). The screen memoizes the result per theme:
 *   const styles = useMemo(() => createStyles(colors), [colors]);
 */
import { StyleSheet } from 'react-native';
import { Space, FontFamily, FontSize, Radius, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import type { ThemeColors } from '../../theme/ThemeContext';

export function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    ...createRecoveryStyles(colors),
    ...createStageStyles(colors),
    ...createTopBarStyles(colors),
    ...createPageSegmentStyles(colors),
    ...createCanvasOverlayStyles(colors),
    ...createBottomRailStyles(colors),
    ...createOverflowStyles(colors),
    ...createTimelineStyles(colors),
    ...createEffectsStyles(colors),
  });
}

// ── Section builders (pure extraction from createStyles) ─────────────

function createRecoveryStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Crash recovery banner (inline utility notification, not a card) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    // Calm utility: surfaceAlt background + brand left accent. Reads as a
    // quiet system notice, not a premium accent.
    recoveryBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: 10,
      paddingTop: 50,
      zIndex: 100,
      backgroundColor: colors.surfaceAlt,
      opacity: 0.8,
      borderLeftWidth: 2,
    },
    recoveryText: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textPrimary,
      marginLeft: 8,
    },
    recoveryBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    recoveryBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    recoveryDismiss: {
      padding: 8,
      marginLeft: 4,
    },
  });
}

function createStageStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Full-screen canvas stage ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    canvasStage: {
      ...StyleSheet.absoluteFill,
    },
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Filter HUD pill (Instagram/Snapchat swipe-to-filter indicator) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    filterHudPill: {
      position: 'absolute',
      alignSelf: 'center',
      backgroundColor: colors.mediaOverlayScrim,
      paddingHorizontal: Space.md,
      paddingVertical: 7,
      borderRadius: RadiusRoleValue.pillAvatar,
      zIndex: 150,
    },
    filterHudText: {
      fontFamily: FontFamily.bold,
      fontSize: 13,
      letterSpacing: 1.6,
      color: colors.scrimTextPrimary,
      textAlign: 'center',
    },
  });
}

function createTopBarStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Top bar ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    topBarContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
    },
    topBar: {
      height: 52,
      paddingHorizontal: Space.sm,
    },
    topBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    topBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: RadiusRoleValue.pillAvatar,
    },
    topCenter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
      justifyContent: 'center',
    },
    doneText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary,
    },
    selectionCountBadge: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      borderRadius: RadiusRoleValue.pillAvatar,
    },
    selectionCountText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.body.size,
    },
    canvasDimOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.25)',
      zIndex: 35,
    },
    topRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    topLeftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    topCenterGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      flex: 1,
      justifyContent: 'center',
    },
    topRightGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    publishBtn: {
      height: 36,
      borderRadius: RadiusRoleValue.pillAvatar,
      paddingHorizontal: Space.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    publishBtnText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size,
    },
    unsavedDot: {
      width: 7,
      height: 7,
      borderRadius: RadiusRoleValue.pillAvatar,
      marginLeft: -Space.xs,
      marginTop: Space.xs + 2,
    },
  });
}

function createPageSegmentStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Frame progress segments (quieter in editor) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    pageSegmentsContainer: {
      position: 'absolute',
      left: Space.sm,
      right: Space.sm,
      zIndex: 110,
    },
    pageSegmentsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    pageSegmentTarget: {
      flex: 1,
      height: 14,
      justifyContent: 'center',
    },
    pageSegmentTrack: {
      height: 2,
      borderRadius: RadiusRoleValue.pillAvatar,
      backgroundColor: colors.border,
      overflow: 'hidden',
      flexDirection: 'row',
    },
    pageSegmentFill: {
      height: 2,
      borderRadius: RadiusRoleValue.pillAvatar,
    },
    pageSegmentAdd: {
      width: 22,
      height: 22,
      borderRadius: RadiusRoleValue.pillAvatar,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
}

function createCanvasOverlayStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Canvas loading overlay ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    canvasLoadingOverlay: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 50,
    },
    canvasLoadingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.lg,
      paddingVertical: Space.md,
      borderRadius: Radius.md,
      overflow: 'hidden',
    },
    canvasLoadingText: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.body.size,
    },
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Empty canvas hint ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â authored two-line empty state ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    canvasEmptyHint: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 40,
      gap: Space.sm,
    },
    canvasEmptyHintTitle: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      color: colors.textSecondary,
    },
    canvasEmptyHintSubtitle: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textMuted,
    },
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Draft load error overlay ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    canvasErrorOverlay: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 55,
      gap: Space.xs,
      paddingHorizontal: Space.lg,
    },
    canvasErrorTitle: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      marginTop: Space.sm,
    },
    canvasErrorSubtitle: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      textAlign: 'center',
    },
    canvasErrorRetry: {
      marginTop: Space.sm,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.md,
    },
    canvasErrorRetryText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.body.size,
    },
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Safe zone overlay ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    safeZoneOverlay: {
      ...StyleSheet.absoluteFill,
      zIndex: 45,
    },
    safeZoneTop: {
      position: 'absolute',
      left: 0,
      right: 0,
      backgroundColor: colors.brandSubtle,
      borderBottomWidth: 1,
      borderBottomColor: colors.brand,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 4,
    },
    safeZoneBottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      backgroundColor: colors.brandSubtle,
      borderTopWidth: 1,
      borderTopColor: colors.brand,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 4,
    },
    safeZoneContent: {
      position: 'absolute',
      left: 0,
      right: 0,
      borderWidth: Stroke.standard,
      borderColor: colors.brand,
      borderStyle: 'dashed',
    },
    safeZoneLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.mediaOverlayScrim,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: RadiusRoleValue.pillAvatar,
    },
    safeZoneLabelText: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
      letterSpacing: 0.3,
    },
  });
}

function createBottomRailStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Bottom tool rail (default mode) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    bottomRailContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 100,
    },
    bottomRailContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.sm,
      gap: Space.xs,
      paddingVertical: Space.xs,
      backgroundColor: 'transparent',
    },
    bottomRailGlassDock: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.mediaOverlayScrim,
      borderRadius: Radius.xxl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 2,
      overflow: 'hidden',
    },
    frameBadgePill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: Radius.lg,
      backgroundColor: colors.mediaOverlayScrim,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    frameCountText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.meta.size,
      color: colors.scrimTextPrimary,
    },
    bottomStoryPostBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 3,
    },
  });
}

function createOverflowStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Overflow menu ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    overflowContainer: {
      ...StyleSheet.absoluteFill,
      zIndex: 220,
      justifyContent: 'flex-end',
    },
    overflowMenu: {
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      overflow: 'hidden',
    },
    overflowHeader: {
      minHeight: 56,
      paddingLeft: Space.md,
      paddingRight: Space.xs,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.scrimTextTertiary,
    },
    overflowClose: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    overflowClosePressed: {
      opacity: 0.56,
    },
    overflowScrollContent: {
      paddingTop: Space.xs,
      paddingBottom: Space.sm,
    },
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Overflow groups ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â spacing-only separation, no labels ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    overflowGroup: {
      gap: Space.sm,
    },
    overflowGroupGap: {
      marginTop: Space.md,
    },
    overflowSectionTitle: {
      marginLeft: Space.sm,
      marginBottom: Space.xs,
      fontSize: 11,
      letterSpacing: 0.08,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    overflowBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.mediaOverlayScrim,
    },
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ ContextToolRail inline ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    contextRail: {
      flex: 1,
    },
  });
}

function createTimelineStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Timeline ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    timelineContainer: {
      position: 'absolute',
      left: Space.md,
      right: Space.md,
      zIndex: 96,
      borderRadius: Radius.lg,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      gap: Space.xs,
      overflow: 'hidden',
    },
    timelinePlaybackBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.xxs,
    },
    timelinePlayBtn: {
      width: 36,
      height: 36,
      borderRadius: RadiusRoleValue.pillAvatar,
      backgroundColor: colors.scrimTextTertiary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    timelineTimecode: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.meta.size,
      color: colors.scrimTextPrimary,
      fontVariant: ['tabular-nums'],
    },
    timelinePlaybackSpacer: {
      flex: 1,
    },
    timelineUndoRedoBtn: {
      width: 32,
      height: 32,
      justifyContent: 'center',
      alignItems: 'center',
    },
    timelineDoneBtn: {
      minWidth: 44,
      minHeight: 32,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Space.sm,
      marginLeft: Space.xs,
    },
    timelineDoneText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.body.size,
    },
    timelineOverlayWrap: {
      marginTop: Space.xxs,
    },
    timelineWaveformWrap: {
      marginTop: Space.xxs,
    },
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Pinch-to-zoom scroll region ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    timelineScrollWrap: {
      position: 'relative',
    },
    timelineScroll: {
      width: '100%',
    },
    timelineContent: {
      // Width is set inline (scaledTrackWidth). Tracks stack vertically
      // (default flexDirection: column) and each fills the content width.
    },
    timelineZoomIndicatorWrap: {
      position: 'absolute',
      top: 2,
      right: Space.xs,
    },
    timelineZoomIndicator: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontVariant: ['tabular-nums'],
    },
    timelineEmptyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 52,
    },
    timelineEmptyText: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    timelineEmptyCta: {
      minWidth: 44,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Space.sm,
    },
    timelineEmptyCtaText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.body.size,
    },
    // Truthful note for edits the native preview cannot reflect (reverse,
    // freeze-frame). Uses the meta typography scale + secondary text color
    // so it reads as supportive metadata, not a primary label.
    previewNotReflectedNote: {
      marginTop: Space.sm,
      paddingHorizontal: Space.sm,
      textAlign: 'center',
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
  });
}

function createEffectsStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Effects sheet ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    effectsSheetScroll: {
      paddingVertical: Space.sm,
    },
    effectsAdjustWrap: {
      marginTop: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.scrimTextTertiary,
      paddingTop: Space.xs,
    },
    aiEffectsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      marginTop: Space.sm,
      minHeight: Control.hit,
      borderWidth: Stroke.standard,
      borderRadius: Radius.md,
    },
    aiEffectsBtnText: {
      flex: 1,
      fontSize: FontSize.body,
      fontFamily: FontFamily.semibold,
    },
    effectsAutoRow: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
    },
  });
}
