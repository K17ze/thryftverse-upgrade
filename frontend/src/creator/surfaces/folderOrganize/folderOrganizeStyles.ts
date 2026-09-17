/**
 * folderOrganizeStyles — StyleSheet factory for the generic
 * FolderOrganizeSheet surface. Extracted verbatim from
 * FolderOrganizeSheet.tsx; consumed by the sheet orchestrator and the
 * extracted content components under folderOrganize/.
 */
import { StyleSheet } from 'react-native';
import { Space, Radius, Typography, FontFamily, Control, Stroke } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { ThemeColors } from '../../../theme/ThemeContext';

export function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Sheet container ──
    sheetInner: {
      flex: 1,
      paddingHorizontal: Space.md,
    },
    // ── Modal container ──
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // ── Header ──
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      height: 44,
    },
    headerTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: 17,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    closeBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    hint: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      lineHeight: TypographyV2.meta.lineHeight,
    },
    // ── Error banner ──
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      backgroundColor: colors.danger,
      borderRadius: Radius.md,
      marginHorizontal: Space.md,
      marginTop: Space.sm,
    },
    errorText: {
      flex: 1,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textInverse,
    },
    // ── New folder button ──
    newFolderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.smMd,
      marginBottom: Space.sm,
    },
    newFolderText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.brand,
    },
    // ── Scroll ──
    scrollArea: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: Space.lg,
    },
    emptyHint: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary,
      paddingVertical: Space.md,
    },
    // ── Tap-mode folder rows ──
    folderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.md,
      paddingHorizontal: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    folderRowSelected: {
      backgroundColor: colors.brandSubtle,
    },
    folderInfo: {
      flex: 1,
      gap: 2,
    },
    folderName: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary,
    },
    folderNameSelected: {
      color: colors.brand,
    },
    folderCount: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
    },
    folderActions: {
      flexDirection: 'row',
      gap: Space.xs,
    },
    folderActionBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // ── Tap-mode assign section ──
    assignSection: {
      marginTop: Space.lg,
      paddingTop: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    assignHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.sm,
    },
    assignTitle: {
      flex: 1,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary,
    },
    assignConfirmBtn: {
      backgroundColor: colors.brand,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
    },
    assignConfirmText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      color: colors.textInverse,
    },
    // ── Tap-mode item pick rows ──
    itemPickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    itemPickRowSelected: {
      backgroundColor: colors.brandSubtle,
    },
    itemPickInfo: {
      flex: 1,
      gap: 2,
    },
    itemPickTitle: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textPrimary,
    },
    itemPickMeta: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
    },
    itemPickRemove: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // ── Quick-move chips ──
    quickMoveSection: {
      marginTop: Space.lg,
    },
    quickMoveRow: {
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    quickMoveInfo: {
      gap: 2,
      marginBottom: Space.xs,
    },
    quickMoveTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      color: colors.textPrimary,
    },
    quickMoveFolder: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
    },
    quickChip: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      marginRight: Space.xs,
      minHeight: Control.hit,
      justifyContent: 'center',
      borderRadius: Radius.md,
    },
    // Accessibility fix: visible active fill
    quickChipActive: {
      backgroundColor: colors.brandSubtle,
    },
    quickChipInactive: {
      backgroundColor: 'transparent',
    },
    quickChipUnfile: {
      backgroundColor: 'transparent',
    },
    quickChipText: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.body.size,
    },
    quickChipTextActive: {
      color: colors.brand,
    },
    quickChipTextInactive: {
      color: colors.textSecondary,
    },
    quickChipTextUnfile: {
      color: colors.danger,
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.body.size,
    },
    footerHint: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: Space.lg,
    },
    // ── Drag-mode drop zones ──
    dropZone: {
      borderRadius: Radius.lg,
      backgroundColor: colors.surfaceAlt,
      padding: Space.sm,
      marginBottom: Space.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'transparent',
    },
    dropZoneActive: {
      borderColor: colors.brand,
      borderWidth: 2,
      backgroundColor: colors.brandSubtle,
    },
    dropZoneHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs,
      minHeight: 44,
    },
    dropZoneTitle: {
      flex: 1,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary,
    },
    dropZoneCount: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      backgroundColor: colors.surface,
      paddingHorizontal: Space.sm,
      paddingVertical: 2,
      borderRadius: Radius.full,
      overflow: 'hidden',
    },
    folderNameBtn: {
      flex: 1,
      minHeight: 44,
      justifyContent: 'center',
    },
    // ── Drag-mode item rows ──
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.sm,
      borderRadius: Radius.md,
      minHeight: 44,
      backgroundColor: colors.surface,
      marginBottom: Space.xxs,
    },
    itemRowDragging: {
      opacity: 0.4,
    },
    itemTitle: {
      flex: 1,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textPrimary,
    },
    dragHandle: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dragItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
      width: 120,
      height: 44,
    },
    dragItemText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.meta.size,
      color: colors.textInverse,
      flex: 1,
    },
    // ── Manage mode ──
    managePanel: {
      paddingVertical: Space.md,
      flex: 1,
    },
    manageTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      color: colors.textPrimary,
      textAlign: 'center',
      marginTop: Space.sm,
    },
    manageBody: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: Space.xs,
      marginBottom: Space.lg,
    },
    nameInput: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      borderRadius: Radius.lg,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      marginBottom: Space.md,
      minHeight: 44,
    },
    manageConfirmBtn: {
      backgroundColor: colors.brand,
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      alignItems: 'center',
      marginBottom: Space.sm,
      minHeight: 44,
      justifyContent: 'center',
    },
    manageConfirmDisabled: {
      opacity: 0.4,
    },
    manageConfirmText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textInverse,
    },
    manageDangerBtn: {
      backgroundColor: colors.danger,
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      alignItems: 'center',
      marginBottom: Space.sm,
      minHeight: 44,
      justifyContent: 'center',
    },
    manageDangerText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textInverse,
    },
    manageCancelBtn: {
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      alignItems: 'center',
      minHeight: 44,
      justifyContent: 'center',
    },
    manageCancelText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary,
    },
  });
}
