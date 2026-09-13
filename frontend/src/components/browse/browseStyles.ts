import { StyleSheet } from 'react-native';

import { Space, Radius, Typography, AspectRatio, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { ThemeColors } from '../../theme/ThemeContext';

/**
 * Styles factory for BrowseScreen and its extracted browse section
 * components. Relocated verbatim from BrowseScreen — including legacy card
 * styles (gridItem, imageWrap, sellerAction styles, etc.) that are no longer referenced
 * since the grid is owned by PinterestMasonryGrid. Kept intact so the refactor
 * is a pure move; dead keys can be pruned in a dedicated cleanup pass.
 */
export function createBrowseStyles(colors: ThemeColors, itemWidth: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xs },
    backBtn: { width: Control.hit, height: Control.hit, alignItems: 'center', justifyContent: 'center' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
    gridToggleBtn: { width: Control.hit, height: Control.hit, alignItems: 'center', justifyContent: 'center' },
    searchBtn: { width: Control.hit, height: Control.hit, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },

    titleContainer: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md },
    hugeTitle: {
      fontSize: TypographyV2.screenTitle.size,
      fontFamily: TypographyV2.screenTitle.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.screenTitle.letterSpacing,
      lineHeight: TypographyV2.screenTitle.lineHeight },
    itemCountText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
      marginTop: Space.xs },
    itemCountPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xxs },

    filterBar: { paddingBottom: Space.md },
    filterRow: { paddingHorizontal: Space.md, gap: Space.xs + 2, alignItems: 'center' },
    filterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: 'transparent' },
    filterPillActive: {
      borderColor: colors.textPrimary },
    filterPillTextActive: { color: colors.textPrimary, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.bodyStrong.fontFamily },
    filterPillOutline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: 'transparent' },
    filterPillText: { color: colors.textSecondary, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily },
    saveSearchPillActive: {
      borderColor: colors.brand },
    saveSearchTextActive: {
      color: colors.brand,
      fontFamily: Typography.family.semibold },
    sortTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: 'transparent' },
    sortTriggerActive: {
      borderColor: colors.textPrimary },
    sortTriggerText: { color: colors.textSecondary, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily },
    sortTriggerTextActive: { color: colors.textPrimary, fontFamily: TypographyV2.meta.fontFamily },
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
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary },
    sortMenuItemTextActive: {
      color: colors.brand,
      fontFamily: Typography.family.semibold },
    activeBadgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      gap: Space.xs,
      paddingBottom: Space.sm },
    activeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border },
    activeBadgeText: {
      color: colors.textPrimary,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    activeBadgeClose: {
      width: Control.iconCompact,
      height: Control.iconCompact,
      alignItems: 'center',
      justifyContent: 'center' },
    signalSubRail: {
      paddingBottom: Space.sm,
    },
    signalSubRailContent: {
      paddingHorizontal: Space.md,
      gap: Space.xs,
      alignItems: 'center',
    },
    signalSubChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: 'transparent',
    },
    signalSubChipPersonalized: {
      borderColor: colors.borderSubtle,
      backgroundColor: colors.surfaceAlt,
    },
    signalSubChipActive: {
      backgroundColor: colors.textPrimary,
      borderColor: colors.textPrimary,
    },
    signalSubDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.brand,
    },
    signalSubDotActive: {
      backgroundColor: colors.background,
    },
    signalSubText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
    },
    signalSubTextActive: {
      color: colors.background,
      fontFamily: Typography.family.semibold,
    },
    activeBadgeDivider: {
      width: StyleSheet.hairlineWidth,
      height: Space.md,
      backgroundColor: colors.borderSubtle,
      marginHorizontal: Space.xs / 2 },
    clearAllBtn: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border },
    clearAllText: {
      color: colors.textSecondary,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    syncRetryBanner: {
      marginHorizontal: Space.md,
      marginBottom: Space.sm + 2 },

    gridContent: { paddingHorizontal: Space.md, paddingBottom: 100 },
    rowWrapper: { justifyContent: 'space-between', marginBottom: Space.xl },
    loadingStateWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      rowGap: Space.xl },
    loadingCard: {
      width: itemWidth },
    loadingCardOffset: {
      marginTop: Space.lg },
    loadingCardBody: {
      marginTop: Space.sm + 2,
      paddingHorizontal: Space.xs },

    gridItem: { width: itemWidth },
    imageWrap: {
      width: itemWidth,
      borderRadius: Radius.sm,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
      marginBottom: Space.smMd },
    gridImageContainer: {
      width: '100%',
      aspectRatio: AspectRatio.portrait,
      borderRadius: Radius.lg },
    gridImage: { width: '100%', height: '100%' },
    sharedImageLayer: {
      ...StyleSheet.absoluteFill },
    likeBtn: {
      position: 'absolute',
      top: Space.sm + 2,
      right: Space.sm + 2,
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center' },

    infoWrap: { paddingHorizontal: Space.xs },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginBottom: Space.xs },
    priceText: { color: colors.textPrimary, fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, fontVariant: ['tabular-nums'] },
    brandText: { color: colors.textSecondary, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, textTransform: 'uppercase' },
    sizeText: { color: colors.textMuted, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily },
    sellerActionRow: {
      marginTop: Space.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.xs + 2 },
    sellerIdentityChip: {
      flex: 1,
      minHeight: Space.lg + Space.xs,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      paddingHorizontal: Space.sm },
    sellerActionAvatarWrap: {
      width: Control.iconCompact,
      height: Control.iconCompact,
      borderRadius: Radius.full },
    sellerActionAvatar: {
      width: Control.iconCompact,
      height: Control.iconCompact,
      borderRadius: Radius.full },
    sellerActionAvatarFallback: {
      width: Control.iconCompact,
      height: Control.iconCompact,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background },
    sellerActionHandle: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    sellerMessageBtn: {
      width: Space.lg + Space.xs,
      height: Space.lg + Space.xs,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center' } });
}

export type BrowseStyles = ReturnType<typeof createBrowseStyles>;
