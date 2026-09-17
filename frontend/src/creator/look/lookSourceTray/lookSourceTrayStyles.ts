/**
 * lookSourceTrayStyles — StyleSheet for LookSourceTray and
 * SourceTrayPeek. Extracted verbatim from LookSourceTray.tsx; consumed
 * by the tray orchestrator and the extracted components under
 * lookSourceTray/.
 */
import { StyleSheet, type TextStyle } from 'react-native';
import { Space, Radius, Typography, Elevation, Stroke } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { RadiusRoleValue } from '../../../theme/surfaceRadiusRules';
import { PEEK_HEIGHT, CONTENT_HEIGHT, PREVIEW_SIZE } from './lookSourceTrayShared';

export const styles = StyleSheet.create({
  // ── Wrapper — holds the animated container + floating drag preview ──
  wrapper: {
    // The tray sits at the bottom, above the action bar.
    // Positioned by the parent (sourceTrayContainer in LookComposerScreen).
  },
  // ── Container — clips content, rounded top corners ──
  container: {
    overflow: 'hidden',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl },
  // ── Scrim — always visible, subtle so peek bar is readable ──
  scrim: {
    opacity: 0.5 },
  // ── Sheet background — fades in when expanded ──
  sheetBg: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl },
  // ── Peek bar (48pt — always visible) ──
  peekBar: {
    height: PEEK_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm },
  peekBarPressed: {
    opacity: 0.6 },
  peekLabel: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  // ── Expanded content ──
  content: {
    height: CONTENT_HEIGHT },
  // ── Tab bar ──
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    height: 44 },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    height: 44,
    position: 'relative' },
  tabBtnPressed: {
    opacity: 0.6 },
  tabLabel: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: Space.sm,
    right: Space.sm,
    height: 2,
    borderRadius: RadiusRoleValue.pillAvatar },
  // ── Search row ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth },
  searchInput: {
    flex: 1,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size,
    paddingVertical: 4 },
  // ── State container (loading/empty) ──
  stateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.lg,
    paddingHorizontal: Space.md },
  stateText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  // ── Item scroll ──
  itemScroll: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    alignItems: 'center',
    paddingVertical: Space.sm },
  // ── Item card — media-first gallery, no card background or border ──
  // Image is the dominant element; name + price sit below as flat text.
  itemCard: {
    width: 88,
    alignItems: 'center',
    gap: Space.xs },
  itemImage: {
    width: 88,
    height: 88,
    borderRadius: Radius.md },
  // ── Dedup indicator — subtle dot on items already on canvas ──
  onCanvasDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: '#fff' },
  itemImagePlaceholder: {
    width: 88,
    height: 88,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  itemTitle: {
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontWeight: TypographyV2.meta.weight as TextStyle['fontWeight'],
    marginTop: 2,
    textAlign: 'center' },
  itemPrice: {
    fontFamily: TypographyV2.numericMeta.fontFamily,
    fontSize: TypographyV2.numericMeta.size,
    lineHeight: TypographyV2.numericMeta.lineHeight,
    fontWeight: TypographyV2.numericMeta.weight as TextStyle['fontWeight'],
    fontVariant: ['tabular-nums'] },
  // ── Floating drag preview ──
  dragPreview: {
    position: 'absolute',
    width: PREVIEW_SIZE,
    alignItems: 'center',
    gap: 2,
    zIndex: 1000 },
  previewImage: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
    ...Elevation.floating },
  previewTitle: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    marginTop: 2,
    textAlign: 'center' },
  previewPrice: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size },
  // ── Source tray peek strip ──
  peekStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs },
  peekThumb: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.05)' },
  peekMore: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size } });
