/**
 * cutoutSheetStyles — StyleSheet for the CreatorCutoutSheet surface.
 * Extracted verbatim from CreatorCutoutSheet.tsx; consumed by the sheet
 * orchestrator and the extracted components under cutoutSheet/.
 */
import { StyleSheet } from 'react-native';
import { Space, Radius, FontFamily, Stroke, Typography } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';

export const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 300 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Space.sm,
    zIndex: 301,
    elevation: 24 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    height: 44 },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: Typography.family.semibold,
    textAlign: 'center' },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center' },
  instructions: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center',
    paddingBottom: 4 },
  canvasArea: {
    alignItems: 'center',
    paddingVertical: Space.sm },
  canvasFrame: {
    overflow: 'hidden' },
  toolSelectorRow: {
    flexDirection: 'row',
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    position: 'relative' },
  toolUnderline: {
    position: 'absolute',
    bottom: 0,
    height: Stroke.emphasis,
    borderRadius: Radius.full },
  toolSelectorBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    zIndex: 1 },
  toolSelectorLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  toolRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.md,
    paddingVertical: Space.md },
  toolBtn: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 10 },
  toolLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  // ── Footer — premium Cancel / Crop buttons ──
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
