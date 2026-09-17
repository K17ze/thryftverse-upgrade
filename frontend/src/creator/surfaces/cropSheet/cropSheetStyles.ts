/**
 * cropSheetStyles — StyleSheet for CreatorCropSheet. Extracted verbatim
 * from CreatorCropSheet.tsx; consumed by the sheet orchestrator and the
 * extracted components under cropSheet/. The styles are static — theme
 * colors are applied inline at the call sites.
 */
import { StyleSheet } from 'react-native';
import { Space, Radius, Stroke, Typography } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';

export const cropSheetStyles = StyleSheet.create({
  stage: {
    ...StyleSheet.absoluteFill,
    zIndex: 300 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    height: 52 },
  topBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center' },
  resetBtn: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.sm },
  resetText: {
    fontSize: TypographyV2.body.size,
    fontFamily: Typography.family.medium },
  doneBtn: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full },
  doneText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: Typography.family.semibold },
  mediaStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center' },
  previewFrame: {
    overflow: 'hidden' },
  dimOverlay: {},
  cropBorder: {
    position: 'absolute',
    borderWidth: Stroke.emphasis },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1 },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1 },
  // Minimal corner handles — 8pt visible squares, no shadows.
  corner: {
    position: 'absolute',
    width: 8,
    height: 8 },
  cornerTL: {
    top: -4,
    left: -4,
    borderTopWidth: Stroke.emphasis,
    borderLeftWidth: Stroke.emphasis },
  cornerTR: {
    top: -4,
    right: -4,
    borderTopWidth: Stroke.emphasis,
    borderRightWidth: Stroke.emphasis },
  cornerBL: {
    bottom: -4,
    left: -4,
    borderBottomWidth: Stroke.emphasis,
    borderLeftWidth: Stroke.emphasis },
  cornerBR: {
    bottom: -4,
    right: -4,
    borderBottomWidth: Stroke.emphasis,
    borderRightWidth: Stroke.emphasis },
  focalReticle: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    borderWidth: Stroke.emphasis },
  focalReticleOuter: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: Stroke.hairline },
  ratioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  ratioChip: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    borderRadius: Radius.full },
  ratioText: {
    fontSize: TypographyV2.body.size,
    fontFamily: Typography.family.medium },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.lg,
    paddingVertical: Space.sm },
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44 },
  straightenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    paddingBottom: Space.sm,
    gap: Space.sm },
  straightenSlider: {
    flex: 1 },
  straightenReadout: {
    minWidth: 44,
    textAlign: 'right',
    fontSize: TypographyV2.meta.size,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'] },
  straightenReset: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32 },
});
