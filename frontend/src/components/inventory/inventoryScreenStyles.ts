import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/** Screen-level styles for InventoryManagementScreen — extracted to keep the
 *  orchestrator under the 400-LOC charter. */
export function createInventoryScreenStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1 },
    headerAction: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center' },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      backgroundColor: colors.surfaceAlt,
      marginHorizontal: Space.md,
      marginTop: Space.sm,
      borderRadius: Radius.md },
    searchIcon: {
      marginLeft: Space.xs },
    searchInput: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      paddingVertical: Space.sm,
      color: colors.textPrimary },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    summaryCell: {
      flex: 1,
      alignItems: 'center',
      gap: Space.xs / 2,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.border,
      paddingHorizontal: Space.xs },
    summaryValue: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    summaryLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    filterRail: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    filterRailContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      gap: Space.md },
    filterTab: {
      paddingVertical: Space.sm,
      position: 'relative' },
    filterTabLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    filterIndicator: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: Stroke.emphasis,
      borderRadius: Radius.none, // Hairline indicator — intentionally 1pt
      backgroundColor: 'transparent' },
    sortRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs },
    sortTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.sm },
    sortTriggerText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    sortMenu: {
      marginHorizontal: Space.md,
      marginBottom: Space.sm,
      borderRadius: Radius.md,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border },
    sortMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    sortMenuItemText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },
    listScroll: {
      flex: 1 },
    listContent: {
      flexGrow: 1 },
    emptyScroll: {
      flex: 1 },
    filteredEmptyWrap: {
      flex: 1,
      justifyContent: 'center',
      paddingVertical: Space.xl },
    rowWrap: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2 },
    selectCheckbox: {
      // Intentional checkbox size
      width: Control.icon,
      height: Control.icon,
      borderRadius: Radius.sm,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center' },
    thumbnailWrap: {
      // Intentional thumbnail size
      width: Control.hit + Space.sm,
      height: Control.hit + Space.sm,
      borderRadius: Radius.md,
      overflow: 'hidden' },
    thumbnail: {
      width: Control.hit + Space.sm,
      height: Control.hit + Space.sm },
    thumbnailFallback: {
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center' },
    rowBody: {
      flex: 1,
      gap: Space.xs - 1,
      minWidth: 0 },
    rowTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.textPrimary },
    rowPrice: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      color: colors.textPrimary },
    rowMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.sm },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    statusDot: {
      width: Space.xs + 2,
      height: Space.xs + 2,
      borderRadius: Radius.sm },
    statusText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    metricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    metricItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs - 1 },
    metricText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    quickActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2 },
    rowSpinner: {
      marginRight: Space.sm },
    bulkBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface },
    bulkBarInfo: {
      flex: 1 },
    bulkBarCount: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    bulkBarActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    bulkActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm - 2,
      paddingHorizontal: Space.xs },
    bulkActionText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textPrimary },
    bulkCancelText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary } });
}

export type InventoryScreenStyles = ReturnType<typeof createInventoryScreenStyles>;

/** Shared chrome for the row quick-action icon buttons — intentionally
 *  outside the theme-dependent sheet (matches the pre-extraction layout). */
export const inventorySharedStyles = StyleSheet.create({
  iconActionBtn: {
    width: Control.chrome,
    height: Control.chrome,
    justifyContent: 'center',
    alignItems: 'center' } });
