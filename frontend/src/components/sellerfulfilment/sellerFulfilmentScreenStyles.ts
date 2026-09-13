import { StyleSheet } from 'react-native';
import { Space, Radius, Typography, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { ThemeColors } from '../../theme/ThemeContext';

/**
 * Screen-level styles for SellerFulfilmentScreen — extracted to keep the
 * orchestrator under the size budget. All colours come from theme tokens.
 */
export function createSellerFulfilmentStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md },
    // ─── A. Item-dominant header ───
    itemHeader: {
      flexDirection: 'row',
      gap: Space.md,
      paddingVertical: Space.sm },
    itemImage: {
      width: 64,
      height: 64,
      borderRadius: Radius.md },
    itemImagePlaceholder: {
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center' },
    itemInfo: {
      flex: 1,
      gap: Space.xs / 2,
      justifyContent: 'center' },
    itemTitle: {
      fontSize: TypographyV2.itemTitle.size,
      fontFamily: TypographyV2.itemTitle.fontFamily,
      color: colors.textPrimary,
      lineHeight: TypographyV2.itemTitle.lineHeight },
    shipByLine: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight },
    serviceLine: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      lineHeight: TypographyV2.meta.lineHeight },
    // ─── D. Escrow footnote ───
    escrowFootnote: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      marginTop: Space.xs,
      marginBottom: Space.lg },
    // ─── B. One next action ───
    actionSection: {
      marginTop: Space.md,
      gap: Space.sm },
    actionContext: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
      marginBottom: Space.xs },
    // Dominant button — the single next action
    dominantBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.brand,
      minHeight: Control.hit + Space.sm },
    dominantBtnDisabled: {
      opacity: 0.6 },
    dominantBtnText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textInverse },
    // Label error — attached to the label action, not a separate banner
    labelErrorInline: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      paddingVertical: Space.xs + 2 },
    labelErrorText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.danger,
      lineHeight: TypographyV2.meta.size + 4 },
    manualAltHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      lineHeight: TypographyV2.meta.size + 4,
      marginBottom: Space.xs },
    // QR / label preview (replaces the get-label button)
    qrPreview: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.lg,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      minHeight: Control.hit + Space.lg },
    qrPreviewText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    dropOffLine: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary },
    findLocationLink: {
      minHeight: Control.hit,
      justifyContent: 'center' },
    findLocationText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.brand },
    waitingLine: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
      marginTop: Space.xs },
    waitingHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      lineHeight: TypographyV2.meta.size + 4 },
    // Recovery — quiet text link, not a footer panel
    recoveryLink: {
      minHeight: Control.hit,
      justifyContent: 'center',
      marginTop: Space.xs },
    recoveryLinkText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      textDecorationLine: 'underline' },
    // ─── Manual shipping form ───
    inputLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary,
      marginBottom: Space.xs + 2,
      marginTop: Space.sm },
    carrierSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      height: Control.hit,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface },
    carrierSelectorText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    placeholderText: {
      color: colors.textMuted },
    carrierDropdown: {
      marginTop: Space.xs,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden' },
    carrierOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      minHeight: Control.hit },
    carrierOptionText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textSecondary },
    carrierOptionTextActive: {
      color: colors.textPrimary,
      fontFamily: Typography.family.semibold },
    textInput: {
      paddingHorizontal: Space.md,
      height: Control.hit,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    hintText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      marginTop: Space.xs,
      lineHeight: TypographyV2.meta.size + 5 },
    // ─── Warning (cannot dispatch) ───
    warningInline: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs + 2,
      marginTop: Space.md,
      paddingVertical: Space.sm },
    warningText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.danger,
      lineHeight: TypographyV2.meta.size + 4 },
    // ─── Dispatch extension — quiet row + inline day chips ───
    extensionPendingLine: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      lineHeight: TypographyV2.meta.size + 4,
      marginTop: Space.md },
    extensionBlock: {
      marginTop: Space.md },
    extensionToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: Control.hit },
    extensionToggleText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary },
    extensionPicker: {
      gap: Space.sm },
    extensionChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs + 2 },
    extensionChip: {
      minWidth: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: Space.sm },
    extensionChipText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'] },
    extensionHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      lineHeight: TypographyV2.meta.size + 4 },
    extensionConfirm: {
      alignSelf: 'flex-start',
      minHeight: Control.hit,
      justifyContent: 'center' },
    extensionConfirmDisabled: {
      opacity: 0.6 },
    extensionConfirmText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.brand },
    // ─── Footer ───
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background },
    dispatchBtn: {
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.hit + Space.sm },
    dispatchBtnDisabled: {
      opacity: 0.6 },
    dispatchBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textInverse } });
}
