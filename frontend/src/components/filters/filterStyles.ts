import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Typography, Radius, Space, Stroke, Control, LetterSpacing, DockConstants } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// Shared stylesheet for the filter sheet and every extracted section
// component. The sheet container itself lives in FilterScreen (it depends on
// window dimensions); everything else is theme-only and lives here so each
// section component renders identically to the original monolith.
export function createFilterStyles(colors: ThemeColors) {
  return StyleSheet.create({
  handleContainer: {
    alignItems: 'center',
    paddingTop: Space.sm + Space.xxs,
    paddingBottom: Space.sm },
  // iOS grabber geometry — 36×5pt, fully rounded. Fill is set by the header
  // (border in dark, 20% black in light) matching the house BottomSheet.
  handle: {
    width: 36,
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: colors.borderSubtle },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  headerTitle: { fontSize: TypographyV2.sectionTitle.size, fontFamily: TypographyV2.sectionTitle.fontFamily, color: colors.textPrimary, letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  activeCountBadge: {
    minWidth: Space.lg + 2,
    height: Space.lg + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs + 2 },
  activeCountBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: Typography.family.bold,
    color: colors.textInverse },
  // Transparent 44pt close target — visible shape is the ~22pt glyph only.
  closeBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Space.sm },
  statusRow: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm + 2 },
  statusMeta: {
    color: colors.textMuted,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  contextActionRow: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm },
  contextIdentity: {
    flex: 1,
    minHeight: Control.chromeCompact,
    borderRadius: Radius.lg,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    paddingHorizontal: Space.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 3 },
  contextText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

  // Filter presets — flat canvas, no card container (hairline separators only)
  presetsWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: 0,
    borderRadius: Radius.none,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border,
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.border },
  presetsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm },
  presetsLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase' },
  presetsSaveLink: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.brand },
  presetsScroll: {
    gap: Space.sm },
  presetChipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: Radius.full,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    minHeight: Control.chrome,
    paddingHorizontal: Space.sm + 2 },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  presetChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary,
    maxWidth: Space.xxl + Space.xxl + Space.lg },
  presetRemoveBtn: {
    width: Space.lg + Space.xs,
    height: Space.lg + Space.xs,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Space.xs },
  presetInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  presetInput: {
    flex: 1,
    height: Space.xl + Space.xs + 2,
    borderRadius: Radius.lg,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: Space.md,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  presetSaveBtn: {
    width: Space.xl + Space.xs + 2,
    height: Space.xl + Space.xs + 2,
    borderRadius: Radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center' },
  presetSaveBtnDisabled: {
    opacity: 0.4 },
  presetCancelBtn: {
    width: Space.xl + Space.xs + 2,
    height: Space.xl + Space.xs + 2,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center' },
  presetsEmptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md + 2,
    borderRadius: Radius.none,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent' },
  presetsEmptyCtaText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.brand },

  syncRetryBanner: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: colors.surface },
  syncRetryBtn: {
    backgroundColor: colors.surface },

  // Bottom padding clears the floating action dock so the last section is
  // never obscured at the resting detent.
  scrollContent: { paddingTop: Space.xs, paddingBottom: DockConstants.singleActionHeight },
  loadingStateWrap: {
    paddingHorizontal: Space.md,
    gap: Space.xl + 2 },
  loadingSection: {
    gap: Space.sm },
  loadingRowsWrap: {
    gap: Space.lg + Space.xs,
    paddingVertical: Space.sm },

  sectionHeading: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    paddingHorizontal: Space.md,
    marginBottom: 0,
    letterSpacing: TypographyV2.body.letterSpacing },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.xs + 2,
    flex: 1 },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: Space.md,
    paddingVertical: Space.md,
    minHeight: Control.hit },
  sectionHeaderValue: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  sectionHeaderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  sectionCountBadge: {
    minWidth: Space.md + 2,
    height: Space.md + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs },
  sectionCountBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: Typography.family.bold,
    color: colors.textSecondary },
  seeAllRow: {
    paddingHorizontal: Space.md,
    minHeight: Control.hit,
    justifyContent: 'center' },
  brandSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    height: Space.xl + Space.xs + 2,
    borderRadius: Radius.lg,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: Space.md },
  brandSearchIcon: { marginRight: Space.sm },
  brandSearchInput: {
    flex: 1,
    height: '100%',
    padding: 0,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  brandSearchClear: {
    minHeight: Control.chromeCompact,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.sm,
    borderWidth: 0,
    backgroundColor: 'transparent' },
  seeAllBtn: {
    minHeight: Control.chromeCompact,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.sm,
    borderWidth: 0,
    backgroundColor: 'transparent' },
  seeAllText: { color: colors.brand, fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily },

  emptySectionText: {
    paddingHorizontal: Space.md,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    fontStyle: 'italic' },

  // ── Option rows / quiet grid cells (FilterOptionRow) ──
  // The sheet's single option grammar: hairline-separated rows, label as the
  // object, brand check (radio) or hairline checkbox square (multi). No
  // fills, no pills, no boxed options.
  optionList: {
    marginHorizontal: Space.md,
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border },
  optionGridRow: { flexDirection: 'row' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit,
    paddingVertical: Space.xs },
  optionCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    minHeight: Control.hit,
    paddingVertical: Space.xs,
    paddingRight: Space.sm },
  optionDivider: {
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.border },
  optionCellDivider: {
    borderLeftWidth: Stroke.hairline,
    borderLeftColor: colors.border,
    paddingLeft: Space.md },
  optionText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  optionTextSelected: { fontFamily: TypographyV2.bodyStrong.fontFamily },
  optionCheckSlot: {
    width: Space.lg,
    alignItems: 'flex-end' },
  optionCheckbox: {
    width: Space.lg - 2,
    height: Space.lg - 2,
    borderRadius: Radius.sm,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center' },
  optionCheckboxSelected: { borderColor: colors.brand },
  optionQuietAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginHorizontal: Space.md,
    marginTop: Space.sm + 2,
    minHeight: Control.hit },
  optionQuietActionText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.brand },

  sectionDivider: {
    height: Stroke.hairline,
    backgroundColor: colors.border,
    marginVertical: Space.md + Space.xs,
    marginHorizontal: Space.md },

  // Floating action dock — rendered outside the sheet's transformed view,
  // pinned to the screen's bottom edge by FilterScreen's dock wrapper. The
  // sheet surface and dock share one material (surfaceElevated); separation
  // is a single hairline, not a second fill.
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.md - 2,
    paddingBottom: Space.md,
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border },
  resetBtn: {
    borderRadius: Radius.md,
    borderWidth: 0,
    backgroundColor: 'transparent',
    minHeight: Space.xxl + Space.xs,
    paddingHorizontal: Space.md },
  resetBtnDisabled: { opacity: 0.4 },
  resetBtnText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: LetterSpacing.wide },
  resetBtnTextDisabled: { color: colors.textMuted },
  applyBtn: {
    flex: 1,
    minHeight: Space.xxl + Space.xs,
    borderRadius: Radius.xl },
  applyBtnDisabled: { opacity: 0.6 },
  applyBtnText: {
    color: colors.textPrimary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: LetterSpacing.wide },
  applyBtnTextDisabled: { color: colors.textMuted },

  // ── Price range ──
  priceRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    gap: Space.sm },
  priceInputWrap: { flex: 1 },
  priceInputLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginBottom: Space.xs },
  priceInput: {
    height: Space.xxl - Space.xs,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    backgroundColor: colors.background },
  priceRangeDash: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textMuted,
    marginTop: Space.md + Space.xs },
  priceRangeError: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.dangerText,
    paddingHorizontal: Space.md,
    marginTop: Space.sm } });
}

export type FilterStyles = ReturnType<typeof createFilterStyles>;
