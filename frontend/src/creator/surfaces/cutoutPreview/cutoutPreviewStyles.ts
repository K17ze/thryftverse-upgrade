/**
 * cutoutPreviewStyles — StyleSheet for the CutoutPreviewSheet surface.
 * Extracted verbatim from CutoutPreviewSheet.tsx; consumed by the sheet
 * orchestrator and the extracted components under cutoutPreview/.
 */
import { StyleSheet } from 'react-native';
import { Space, Radius, Typography, FontFamily, Stroke, Control } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';

export const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    height: 44 },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    textAlign: 'center' },
  closeBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  // ── Message / state container ──
  messageContainer: {
    alignItems: 'center',
    paddingHorizontal: Space.lg,
    paddingVertical: Space.xl,
    gap: Space.xs },
  messageTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    textAlign: 'center' },
  messageBody: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size,
    textAlign: 'center',
    lineHeight: TypographyV2.body.lineHeight },
  retryBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    marginTop: Space.sm,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center' },
  retryBtnText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  // ── Preview ──
  previewContainer: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.sm },
  previewCell: {
    alignItems: 'center' },
  previewFrame: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent' },
  gestureRoot: {
    alignItems: 'center',
    justifyContent: 'center' },
  hint: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    textAlign: 'center',
    marginTop: Space.md,
    lineHeight: TypographyV2.meta.lineHeight,
    paddingHorizontal: Space.sm },
  // ── Control row (Refine / Hold to Compare / Invert) ──
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: Space.md,
    paddingHorizontal: Space.xs },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44 },
  controlBtnLabel: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  // ── Mode selector row — text-only tabs with underline ──
  modeRow: {
    flexDirection: 'row',
    marginTop: Space.sm,
    paddingHorizontal: Space.xs,
    position: 'relative' },
  modeTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.sm,
    minHeight: 44 },
  modeTabText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  modeUnderline: {
    position: 'absolute',
    bottom: 0,
    height: Stroke.emphasis,
    borderRadius: Radius.full },
  // ── Edge Softness slider ──
  sliderRow: {
    marginTop: Space.md,
    paddingHorizontal: Space.xs },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs },
  sliderLabel: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  sliderValue: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  // ── Footer — premium Cancel / Apply buttons ──
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
