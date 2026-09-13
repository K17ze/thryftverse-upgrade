/**
 * Closet surface styles — static layout geometry plus the themed colour
 * overlay, extracted verbatim from ClosetScreen. Skeleton-specific styles
 * live in ClosetSkeletons next to their geometry constants.
 */
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  Space,
  Radius,
  Typography,
  Stroke,
  LetterSpacing,
} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export const closetStyles = StyleSheet.create({
  container: {
    flex: 1 },
  headerBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: Space.xxl + Space.xl + Space.sm + 2,
    zIndex: 1 },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  shareBtn: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.md,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center' },
  tabBar: {
    flexDirection: 'row',
    gap: Space.lg,
    borderBottomWidth: Stroke.hairline },
  tabItem: {
    paddingVertical: Space.sm,
    position: 'relative' },
  tabLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  tabLabelActive: {
    fontFamily: Typography.family.bold },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: Stroke.emphasis,
    borderTopLeftRadius: Radius.none + 1,
    borderTopRightRadius: Radius.none + 1 },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    borderWidth: 0 },
  countBadge: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  closetToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    gap: Space.sm,
    marginBottom: Space.sm },
  closetToolbarBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' },
  closetToolbarBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4 },
  closetToolbarBadgeText: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  tabsWrap: {
    paddingHorizontal: Space.md,
    marginBottom: Space.sm },
  scrollContent: {
    paddingTop: Space.xs },
  sortMenu: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.none,
    borderWidth: 0,
    overflow: 'visible' },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    borderBottomWidth: Stroke.hairline },
  sortOptionActive: {},
  sortOptionText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  sortOptionTextActive: {
    fontFamily: Typography.family.bold },
  filterChipRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
    gap: Space.sm },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.xs / 2 + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.hairline,
    minHeight: Space.xl + Space.xs },
  filterChipActive: {},
  filterChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  filterChipTextActive: {},
  createCollectionBtn: {
    marginTop: Space.lg,
    marginBottom: Space.md },
  outfitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    gap: Space.sm,
    paddingTop: Space.sm },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center' },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs / 2 },
  statDivider: {
    width: Stroke.standard,
    height: Space.lg + 4 },
  statValue: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: LetterSpacing.tight + LetterSpacing.wide },
  statLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps + LetterSpacing.tight },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: Stroke.hairline },
  savingsText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  brandChipScroll: {
    marginBottom: Space.sm },
  brandChipContent: {
    paddingHorizontal: Space.md,
    gap: Space.xs + 2 },
  brandChip: {
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.xs / 2 + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.hairline,
    minHeight: Space.xl + Space.xs,
    justifyContent: 'center' },
  brandChipActive: {},
  brandChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  brandChipTextActive: {} });

/** Themed colour overlay — the `t` style set from the screen, verbatim. */
export function useClosetThemedStyles() {
  const { colors } = useAppTheme();
  return useMemo(() => StyleSheet.create({
    container: { backgroundColor: colors.background },
    headerBorder: { backgroundColor: colors.background, borderBottomColor: colors.border },
    tabBar: { borderBottomColor: colors.border },
    tabLabel: { color: colors.textSecondary },
    tabLabelActive: { color: colors.textPrimary },
    tabIndicator: { backgroundColor: colors.textPrimary },
    countPill: { backgroundColor: 'transparent', borderColor: colors.border },
    countBadge: { color: colors.textMuted },
    sortMenu: { backgroundColor: 'transparent', borderColor: 'transparent' },
    sortOption: { borderBottomColor: colors.border },
    sortOptionActive: { backgroundColor: 'transparent' },
    sortOptionText: { color: colors.textPrimary },
    sortOptionTextActive: { color: colors.brand },
    filterChip: { backgroundColor: 'transparent', borderColor: colors.border },
    filterChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    filterChipText: { color: colors.brand },
    filterChipTextActive: { color: colors.background },
    identityStrip: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
    marginBottom: Space.sm,
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.border },
    statDivider: { backgroundColor: colors.border },
    statValue: { color: colors.textPrimary },
    statLabel: { color: colors.textMuted },
    savingsRow: { borderTopColor: colors.border },
    savingsText: { color: colors.success },
    brandChip: { backgroundColor: 'transparent', borderColor: colors.border },
    brandChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    brandChipText: { color: colors.textSecondary },
    brandChipTextActive: { color: colors.background },
    closetToolbarBadge: { backgroundColor: colors.textPrimary },
    closetToolbarBadgeText: { color: colors.background } }), [colors]);
}
