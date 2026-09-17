import { StyleSheet } from 'react-native';
import { Space, Radius, Typography, FontFamily, FontSize, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';

// ── Look composer styles ────────────────────────────────────────────
// Extracted from LookComposerScreen.tsx — pure relocation, no changes.
export const lookComposerStyles = StyleSheet.create({
  container: {
    flex: 1 },
  // ── Crash recovery banner (inline notification, not a card) ──
  // Calm but noticeable: soft tinted background + left accent bar gives the
  // banner proper visual hierarchy (accent → text → action) without heavy chrome.
  recoveryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    paddingTop: 50,
    borderLeftWidth: 3 },
  recoveryText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    marginLeft: 8 },
  recoveryBtn: {
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 6 },
  recoveryBtnText: {
    fontSize: TypographyV2.body.size,
    fontWeight: '600' },
  recoveryDismiss: {
    padding: 8,
    marginLeft: 4 },
  // ── Canvas stage ──
  canvasStage: {
    ...StyleSheet.absoluteFill },
  // ── Top bar ──
  topBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100 },
  topBar: {
    height: 52,
    paddingHorizontal: Space.sm },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  topBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RadiusRoleValue.pillAvatar },
  topCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center' },
  doneText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  topLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  topCenterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flex: 1,
    justifyContent: 'center' },
  topRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  publishBtn: {
    height: 36,
    borderRadius: RadiusRoleValue.pillAvatar,
    paddingHorizontal: Space.md,
    justifyContent: 'center',
    alignItems: 'center' },
  publishBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  unsavedDot: {
    width: 7,
    height: 7,
    borderRadius: RadiusRoleValue.pillAvatar,
    marginLeft: -Space.xs,
    marginTop: Space.xs + 2 },
  // ── Canvas loading overlay ──
  canvasLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50 },
  // ── Source look error banner ──
  sourceLookErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    marginHorizontal: Space.md,
    borderRadius: Radius.md,
    zIndex: 50 },
  sourceLookErrorText: {
    fontFamily: TypographyV2.body.fontFamily,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontWeight: TypographyV2.body.weight },
  sourceLookErrorRetry: {
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontWeight: TypographyV2.bodyStrong.weight },
  // ── AI Effects button (inline button, not a card) ──
  // Premium button: subtle tinted fill + refined hairline border + radius.
  aiEffectsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    marginTop: Space.sm,
    minHeight: Control.hit,
    borderWidth: Stroke.standard,
    borderRadius: Radius.md },
  aiEffectsBtnText: {
    flex: 1,
    fontSize: FontSize.body,
    fontFamily: FontFamily.semibold },
  // ── Bottom surface container (shared by all surfaces) ──
  bottomBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100 },
  bottomBar: {
    paddingVertical: Space.xs },
  toolRail: {
    flex: 1 },
  // ── Layout panel ──
  layoutPanel: {
    maxHeight: '70%' },
  layoutPanelContent: {
    paddingVertical: Space.sm },
  layoutEmptyText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    textAlign: 'center',
    paddingVertical: Space.lg,
    paddingHorizontal: Space.md },
  // ── Effects surface ──
  effectsSurface: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '85%',
    overflow: 'hidden' },
  // ── Overflow menu ──
  overflowContainer: {
    position: 'absolute',
    right: Space.sm,
    zIndex: 120 },
  overflowMenu: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.xs,
    minWidth: 180,
    overflow: 'hidden' },
  overflowBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: -1 },
  overflowSectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.xs,
    marginHorizontal: Space.sm },
  overflowGroup: {
    gap: Space.sm },
  overflowGroupGap: {
    marginTop: Space.md },
  // ── Effects surface (shared header styles) ──
  effectsSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth },
  effectsSheetTitle: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size },
  effectsSheetDone: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end' },
  effectsSheetDoneText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size },
  effectsSheetScroll: {
    paddingVertical: Space.sm },
  effectsEmptyState: {
    paddingVertical: Space.xl * 2,
    alignItems: 'center' },
  effectsEmptyText: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size },
  effectsAdjustWrap: {
    marginTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.xs },
  effectsAutoRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs },
  // ── Multi-select ──
  selectionCountBadge: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar },
  selectionCountText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size },
  canvasDimOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
    zIndex: 35 } });
