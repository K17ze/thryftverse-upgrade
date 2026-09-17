/**
 * backgroundSheetStyles — StyleSheet factory for BackgroundSheet.
 * Extracted verbatim from BackgroundSheet.tsx; consumed by the sheet
 * orchestrator and the extracted components under backgroundSheet/.
 */
import { StyleSheet } from 'react-native';
import { Space, Radius, Typography, FontFamily, Stroke, Control } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { ThemeColors } from '../../../theme/ThemeContext';

export function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 44,
      paddingHorizontal: Space.md },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size },
    closeBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.sm },
    // ── Type tabs — text-only with spring underline ──
    typeTabRow: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      position: 'relative' },
    typeTab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: Space.sm },
    typeTabLabel: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.meta.size },
    typeUnderline: {
      position: 'absolute',
      bottom: 0,
      height: Stroke.emphasis,
      borderRadius: Radius.full },
    // ── Body ──
    body: {
      paddingHorizontal: Space.md },
    bodyContent: {
      paddingBottom: Space.lg,
      gap: Space.sm },
    sectionLabel: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: Space.sm,
      marginBottom: Space.xs },
    // ── Swatches — larger, no labels, brand ring on selected ──
    swatchRow: {
      gap: Space.sm,
      paddingVertical: Space.sm },
    swatchWrap: {
      alignItems: 'center' },
    swatch: {
      width: 56,
      height: 56,
      borderRadius: Radius.md,
      overflow: 'hidden' },
    swatchActive: {
      borderWidth: Stroke.emphasis,
      borderColor: colors.brand },
    swatchFill: {
      width: '100%',
      height: '100%' },
    // ── Custom color picker section ──
    colorPickerSection: {
      marginTop: Space.md },
    // ── Blurred ──
    blurPreviewWrap: {
      gap: Space.xs },
    blurPreview: {
      width: '100%',
      height: 160,
      borderRadius: Radius.lg },
    blurHint: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      textAlign: 'center' },
    blurEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: Radius.lg,
      borderStyle: 'dashed' },
    blurEmptyText: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size },
    // ── Image ──
    imagePreviewWrap: {
      gap: Space.sm },
    imagePreview: {
      width: '100%',
      height: 180,
      borderRadius: Radius.lg },
    imageChangeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      minHeight: 44,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard },
    imageChangeBtnText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },
    imagePickerEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.xl + Space.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: Radius.lg,
      borderStyle: 'dashed',
      minHeight: 44 },
    imagePickerEmptyTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      marginTop: Space.xs },
    imagePickerEmptyHint: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size },
    // ── Slider ──
    sliderRow: {
      marginTop: Space.md },
    sliderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Space.xs },
    sliderLabel: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size },
    sliderValue: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
      fontVariant: ['tabular-nums'] },
    // ── Footer ──
    footer: {
      flexDirection: 'row',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth },
    footerBtn: {
      flex: 1,
      height: 50,
      borderRadius: Radius.lg,
      alignItems: 'center',
      justifyContent: 'center' },
    footerCancel: {
      backgroundColor: 'transparent' },
    footerCancelText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size },
    footerConfirm: {
      // backgroundColor set inline
    },
    footerConfirmText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size } });
}
