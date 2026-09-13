import { Platform, StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Typography, Radius, Space, Stroke, Control, LetterSpacing } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// Shared stylesheet for the filter sheet and every extracted section
// component. The sheet container itself lives in FilterScreen (it depends on
// window dimensions); everything else is theme-only and lives here so each
// section component renders identically to the original monolith.
export function createFilterStyles(colors: ThemeColors) {
  return StyleSheet.create({
  handleContainer: {
    alignItems: 'center',
    paddingVertical: Space.sm + Space.xs },
  handle: {
    width: Space.xl + Space.xs,
    height: Space.xs,
    borderRadius: Radius.sm,
    backgroundColor: colors.borderSubtle },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.lg,
    paddingBottom: Space.md },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  headerTitle: { fontSize: TypographyV2.priceList.size, fontFamily: TypographyV2.priceList.fontFamily, color: colors.textPrimary, letterSpacing: TypographyV2.priceList.letterSpacing },
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
  clearBtn: {
    minHeight: Control.chromeCompact,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.sm,
    borderWidth: 0,
    backgroundColor: 'transparent' },
  clearText: { color: colors.brand, fontSize: TypographyV2.bodyStrong.size, fontFamily: TypographyV2.bodyStrong.fontFamily },
  statusRow: {
    paddingHorizontal: Space.lg,
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
    marginHorizontal: Space.lg,
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
    marginHorizontal: Space.lg,
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
    marginHorizontal: Space.lg,
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
    marginHorizontal: Space.lg,
    marginBottom: Space.sm,
    backgroundColor: colors.surface },
  syncRetryBtn: {
    backgroundColor: colors.surface },

  scrollContent: { paddingTop: Space.sm, paddingBottom: Space.xxl + Space.xs + Space.xs },
  loadingStateWrap: {
    paddingHorizontal: Space.xl,
    gap: Space.xl + 2 },
  loadingSection: {
    gap: Space.sm },
  loadingChipRow: {
    flexDirection: 'row',
    gap: Space.sm + 2 },
  loadingChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm + 2 },

  sectionHeading: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    paddingHorizontal: Space.xl,
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
    paddingRight: Space.xl,
    paddingVertical: Space.md,
    minHeight: Control.hit },
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
    paddingHorizontal: Space.xl,
    marginBottom: Space.sm },
  seeAllBtn: {
    minHeight: Control.chromeCompact,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.sm,
    borderWidth: 0,
    backgroundColor: 'transparent' },
  seeAllText: { color: colors.brand, fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily },

  hScroll: { paddingHorizontal: Space.xl, gap: Space.sm },

  wrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.xl,
    gap: Space.sm },

  emptySectionText: {
    paddingHorizontal: Space.xl,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    fontStyle: 'italic' },

  chip: {
    minHeight: Control.chrome,
    paddingHorizontal: Space.md - 2,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
    borderWidth: Stroke.hairline,
    borderColor: colors.border },
  sizeChip: { minWidth: Space.xxl + Space.sm, alignItems: 'center' },
  mySizeChip: {
    borderColor: colors.brand,
    borderWidth: Stroke.standard + Stroke.hairline },
  mySizeMarkedChip: {
    borderWidth: Stroke.standard + Stroke.hairline,
    borderColor: colors.brand },
  mySizesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.xl,
    marginBottom: Space.sm,
    gap: Space.sm },
  mySizesLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  mySizesScroll: {
    gap: Space.xs + 2 },
  saveSizesRow: {
    paddingHorizontal: Space.md + Space.xs,
    marginTop: Space.sm + 2,
    marginBottom: Space.xs },
  saveSizesBtn: {
    alignSelf: 'flex-start',
    minHeight: Control.chromeCompact,
    borderRadius: Radius.xl,
    borderWidth: Stroke.hairline,
    borderColor: colors.brand,
    backgroundColor: 'transparent' },
  saveSizesBtnText: {
    color: colors.brand,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  chipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },

  chipText: { fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, color: colors.textPrimary },
  chipTextActive: { color: colors.background, fontFamily: TypographyV2.body.fontFamily },

  // ── Sustainability toggle ──
  sustainableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md + Space.xs,
    paddingVertical: Space.sm,
    minHeight: Control.hit },
  sustainableLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1 },
  sustainableTextWrap: {
    flexDirection: 'column' },
  sustainableTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  sustainableCaption: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs / 4 },
  sustainableToggle: {
    width: Control.hit,
    height: Space.lg + 2,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    justifyContent: 'center',
    padding: Space.xs / 2 },
  sustainableToggleThumb: {
    width: Space.md + Space.xs,
    height: Space.md + Space.xs,
    borderRadius: Radius.full },

  sectionDivider: {
    height: Stroke.hairline,
    backgroundColor: colors.border,
    marginVertical: Space.md + Space.xs,
    marginHorizontal: Space.md + Space.xs },

  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md + Space.xs,
    paddingTop: Space.md - 2,
    paddingBottom: Platform.OS === 'ios' ? Space.xl : Space.lg - 2,
    backgroundColor: colors.background,
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border },
  resetBtn: {
    borderRadius: Radius.xl,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    minHeight: Space.xxl + Space.xs,
    paddingHorizontal: Space.lg },
  resetBtnDisabled: {
    opacity: 0.4 },
  resetBtnText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: LetterSpacing.wide },
  resetBtnTextDisabled: {
    color: colors.textMuted },
  applyBtn: {
    flex: 1,
    minHeight: Space.xxl + Space.xs,
    borderRadius: Radius.xl },
  applyBtnDisabled: {
    opacity: 0.6 },
  applyBtnText: {
    color: colors.textPrimary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: LetterSpacing.wide },
  applyBtnTextDisabled: {
    color: colors.textMuted },

  // ── Price range ──
  priceRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.sm },
  priceInputWrap: {
    flex: 1 },
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
    marginTop: Space.md + Space.xs } });
}

export type FilterStyles = ReturnType<typeof createFilterStyles>;
