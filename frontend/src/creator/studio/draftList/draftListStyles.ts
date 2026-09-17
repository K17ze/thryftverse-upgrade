/**
 * draftListStyles — StyleSheet factory for CreatorDraftListScreen.
 * Extracted verbatim from CreatorDraftListScreen.tsx; consumed by the
 * screen orchestrator and the extracted components under draftList/.
 */
import { StyleSheet } from 'react-native';
import { Space, Radius, Typography, Control } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { ThemeColors } from '../../../theme/ThemeContext';

export function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm },
  backBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  organizeBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  headerTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.screenTitle.size,
    color: colors.textPrimary },
  // ── Folder tab bar ──
  folderTabBar: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs },
  // ── Sort bar ──
  sortBar: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs },
  listContent: {
    padding: Space.md },
  // ── Draft row ──
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md },
  draftRowPressed: {
    opacity: 0.85 },
  draftThumb: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt },
  draftIcon: {
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center' },
  draftInfo: {
    flex: 1,
    gap: Space.xxs },
  draftTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    color: colors.textPrimary },
  draftMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  draftTypeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 2 },
  draftTypeDotLook: {
    backgroundColor: colors.textPrimary },
  draftTypeDotPoster: {
    backgroundColor: colors.warning },
  draftMeta: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    color: colors.textSecondary },
  actions: {
    flexDirection: 'row',
    gap: Space.xs },
  actionBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm },
  actionBtnPressed: {
    opacity: 0.6 },
  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: Space.xl * 2,
    gap: Space.md },
  emptyTitle: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size,
    color: colors.textMuted,
    textAlign: 'center' },
  emptySubtitle: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: Space.xs },
  emptyCtaText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
    color: colors.brand } });
}
