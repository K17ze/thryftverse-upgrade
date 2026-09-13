/**
 * liveSellerStyles — single styles factory for the seller broadcast
 * surface. Shared across the setup, live and summary phase components so
 * the style grammar stays authored in one place.
 */

import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { IconSize } from '../../theme/iconTokens';

export const createSellerStyles = (colors: ThemeColors) => StyleSheet.create({
  flushContent: {
    paddingHorizontal: 0,
    paddingTop: 0 },
  // ── Setup ──
  setupScroll: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.xl,
    gap: Space.sm },
  previewCaption: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center' },
  fieldGroup: {
    gap: Space.xs,
    marginTop: Space.sm },
  fieldLabel: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing },
  titleInput: {
    minHeight: Control.hit,
    borderBottomWidth: Stroke.standard,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    paddingVertical: Space.xs },
  lotHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between' },
  lotSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit + Space.sm,
    paddingVertical: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth },
  lotSelectThumb: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.md,
    overflow: 'hidden' },
  lotSelectThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center' },
  lotSelectInfo: {
    flex: 1,
    gap: 2 },
  lotSelectTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  lotSelectPrice: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  lotOrderMark: {
    width: IconSize.lg,
    height: IconSize.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.emphasis,
    alignItems: 'center',
    justifyContent: 'center' },
  lotOrderText: {
    fontSize: TypographyV2.caption.size,
    fontFamily: TypographyV2.caption.fontFamily,
    fontVariant: ['tabular-nums'] },
  footer: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: Space.xs },
  footerError: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center' },
  goLiveBtn: {
    minHeight: Control.hit,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center' },
  goLiveBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  // ── Live ──
  liveWrap: {
    flex: 1 },
  previewWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    gap: Space.xs },
  liveChromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  liveMetaCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md },
  liveMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 },
  liveMetaText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  endHit: {
    minWidth: Control.hit,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  endText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  // ── Lot panel ──
  lotPanel: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    padding: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Space.sm },
  lotPanelTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  lotPanelThumb: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.md },
  lotPanelInfo: {
    flex: 1,
    gap: 2 },
  lotPanelTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  lotPanelMetaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm },
  lotPanelPrice: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    fontVariant: ['tabular-nums'] },
  lotPanelStatus: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing },
  lotPanelSettle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  lotPanelIndex: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  lotActionsRow: {
    flexDirection: 'row',
    gap: Space.sm },
  lotActionBtn: {
    flex: 1,
    minHeight: Control.hit,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  lotActionText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  lotActionGhost: {
    minHeight: Control.hit,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    justifyContent: 'center' },
  lotActionGhostText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  queueText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center' },
  // ── Chat ──
  chatList: {
    flex: 1,
    marginTop: Space.sm },
  chatListContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg },
  chatRow: {
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth },
  chatLine: {
    flexShrink: 1 },
  chatSender: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  chatText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight },
  chatSystemText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontStyle: 'italic' },
  chatEmptyText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center',
    paddingVertical: Space.lg },
  // ── Summary ──
  summaryWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md },
  summaryTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  summaryStats: {
    width: '100%',
    marginTop: Space.sm,
    marginBottom: Space.sm } });

export type SellerStyles = ReturnType<typeof createSellerStyles>;

export function useSellerStyles(): SellerStyles {
  const { colors } = useAppTheme();
  return useMemo(() => createSellerStyles(colors), [colors]);
}
