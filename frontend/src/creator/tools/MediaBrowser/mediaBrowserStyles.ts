/**
 * Styles for the MediaBrowser sheet.
 *
 * Extracted from MediaBrowserSheet — pure extraction, no behavior change.
 */
import { StyleSheet } from 'react-native';
import {
  Space,
  Radius,
  Typography,
  Stroke,
  FontFamily,
  Elevation } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { ThemeColors } from '../../../theme/ThemeContext';

export function createStyles(colors: ThemeColors, thumbSize: number) {
  return StyleSheet.create({
    // ── Header ──
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.screenTitle.size,
      color: colors.textPrimary,
      flex: 1 },
    closeBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.sm },

    // ── Tab bar ──
    tabRow: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      position: 'relative',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    tabIndicator: {
      position: 'absolute',
      bottom: 0,
      height: Stroke.emphasis,
      borderRadius: Stroke.emphasis },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.smMd,
      zIndex: 1 },
    tabLabel: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size },

    // ── Album list ──
    albumList: {
      flex: 1 },
    albumListContent: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    albumRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.smMd,
      paddingVertical: Space.xs,
      minHeight: 56 },
    albumThumb: {
      width: 48,
      height: 48,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden' },
    albumThumbImage: {
      width: '100%',
      height: '100%' },
    albumRowTextCol: {
      flex: 1,
      flexDirection: 'column',
      gap: 1 },
    albumRowText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.bodyStrong.size },
    albumRowSubtext: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size },

    // ── Limited-access banner ──
    limitedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.smMd,
      marginHorizontal: Space.md,
      marginBottom: Space.sm,
      borderRadius: Radius.md },
    limitedBannerText: {
      flex: 1,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size },

    // ── Media grid ──
    gridContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl },
    mediaGridCell: {
      width: thumbSize,
      height: thumbSize,
      borderRadius: Radius.md,
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
      gap: Space.xxs },
    mediaGridThumb: {
      width: '100%',
      height: '100%' },
    cameraTile: {
      justifyContent: 'center',
      alignItems: 'center' },
    mediaGridVideoBadge: {
      position: 'absolute',
      bottom: Space.xs,
      left: Space.xs,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.mediaOverlayScrim,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Radius.sm },
    mediaGridDuration: {
      color: colors.scrimTextPrimary,
      fontSize: TypographyV2.meta.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: 0.2 },
    mediaGridSelectionBadge: {
      position: 'absolute',
      top: Space.xs,
      right: Space.xs,
      width: 20,
      height: 20,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      ...Elevation.modal },
    mediaGridSelectionText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: Typography.family.bold },
    gridFooter: {
      paddingVertical: Space.md,
      alignItems: 'center' },

    // ── States ──
    centerState: {
      paddingVertical: Space.xxl,
      alignItems: 'center',
      gap: Space.md,
      paddingHorizontal: Space.xl },
    stateTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.screenTitle.size,
      marginTop: Space.sm },
    stateMessage: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size,
      textAlign: 'center',
      lineHeight: 22 },
    stateBtn: {
      paddingHorizontal: Space.lg,
      height: 44,
      borderRadius: Radius.md,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.sm },
    stateBtnText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size },
    emptyText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },

    // ── Bottom bar ──
    bottomBar: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth },
    confirmBtn: {
      height: 50,
      borderRadius: Radius.lg,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: Space.xxs },
    confirmBtnText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size } });
}

export type MediaBrowserStyles = ReturnType<typeof createStyles>;
