import { StyleSheet } from 'react-native';
import { Space, Radius, Control, LetterSpacing } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { ThemeColors } from '../../theme/ThemeContext';

export function createVisualSearchStyles(colors: ThemeColors) {
  return StyleSheet.create({
  scroll: { paddingHorizontal: Space.md, paddingBottom: Space.xxl },
  screenRoot: { flex: 1 },
  headerSection: { paddingHorizontal: Space.md },

  // ── Visual-query header ───────────────────────────────────────────────
  queryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.md },
  queryThumbWrap: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    position: 'relative' },
  queryThumb: { width: '100%', height: '100%' },
  queryThumbRemove: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    backgroundColor: colors.overlay,
    borderRadius: Radius.lg,
    width: Control.icon,
    height: Control.icon,
    alignItems: 'center',
    justifyContent: 'center' },
  queryActions: { flexDirection: 'row', gap: Space.sm },
  queryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  queryActionText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary },

  // ── Refinement bar ────────────────────────────────────────────────────
  refinementWrap: {
    marginTop: Space.lg,
    padding: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: Space.sm },
  refinementLabel: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    color: colors.textSecondary,
    letterSpacing: TypographyV2.label.letterSpacing },
  textInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.smMd,
    borderRadius: Radius.md,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  textInputIcon: { marginRight: 2 },
  textInput: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    padding: 0 },

  // ── Category rail ─────────────────────────────────────────────────────
  categoryRail: { marginHorizontal: -Space.xs },
  categoryRailContent: { paddingHorizontal: Space.xs, gap: Space.sm },
  categoryPill: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  categoryPillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand },
  categoryPillText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary },
  categoryPillTextActive: {
    color: colors.textInverse },

  // ── Filter row ────────────────────────────────────────────────────────
  filterRow: { flexDirection: 'row', gap: Space.sm },
  filterInputWrap: { flex: 1, gap: Space.xs },
  filterInputLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    letterSpacing: LetterSpacing.wide + 0.18 },
  filterInput: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary },

  // ── Brand suggestions ─────────────────────────────────────────────────
  suggestionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Space.xs + 2 },
  suggestionLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  suggestionChip: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt },
  suggestionText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary },

  // ── Refinement actions ────────────────────────────────────────────────
  refinementActions: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: Space.xs },
  applyBtn: { flex: 1 },
  clearBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt },
  clearBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },

  // ── Honest note ───────────────────────────────────────────────────────
  honestNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    marginBottom: Space.sm,
    backgroundColor: colors.surface,
    borderRadius: Radius.md },
  honestNoteText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    lineHeight: TypographyV2.meta.size + 3 },

  // ── Offline / partial banners ─────────────────────────────────────────
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    marginBottom: Space.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  offlineBannerText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  partialIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs,
    marginBottom: Space.sm },
  partialIndicatorText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },

  // ── Results ───────────────────────────────────────────────────────────
  resultsSection: { flex: 1, marginTop: Space.lg },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm },
  skeletonTile: {
    width: '48%',
    flexGrow: 1 },

  // ── Empty / error ─────────────────────────────────────────────────────
  emptyState: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xl, paddingHorizontal: Space.md },
  emptyIconWrap: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs },
  emptyTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary,
    textAlign: 'center' },
  emptyText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: TypographyV2.meta.size + 4 },
  emptyAction: { marginTop: Space.xs },

  // ── Category chips (capture surface) ──────────────────────────────────
  categoryChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.xxl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  categoryChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary },
  categoryChipCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted } });
}
