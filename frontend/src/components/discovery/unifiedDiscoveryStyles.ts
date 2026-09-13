import { StyleSheet } from 'react-native';

import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/**
 * Shared stylesheet for the UnifiedDiscovery surface — used by the screen
 * orchestrator and the extracted discovery components. Style values are
 * verbatim from the original monolithic screen.
 */
export function createUnifiedDiscoveryStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background },
    stateWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Space.lg },
    searchingWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center' },
    headerBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    // Header search bar — sits right below the back/camera row
    headerWrap: {
      backgroundColor: colors.background },
    headerSearchWrap: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm },
    searchBar: {
      flex: 1 },
    // Category pills
    categoryBar: {
      paddingVertical: Space.xs },
    categoryBarContent: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      paddingRight: Space.md,
      gap: Space.xs,
      alignItems: 'center' },
    categoryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      backgroundColor: 'transparent',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle },
    categoryPillPersonalized: {
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt },
    categoryPillActive: {
      backgroundColor: colors.textPrimary,
      borderColor: colors.textPrimary },
    categoryDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.brand },
    categoryDotActive: {
      backgroundColor: colors.background },
    categoryPillText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary },
    categoryPillTextActive: {
      color: colors.textInverse },
    // Hero editorial
    heroWrap: {
      width: '100%',
      height: 120,
      marginVertical: Space.sm,
      position: 'relative' },
    heroImage: {
      width: '100%',
      height: '100%' },
    heroGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '60%' },
    heroOverlay: {
      position: 'absolute',
      left: Space.md,
      right: Space.md,
      bottom: Space.md },
    heroEyebrow: {
      color: colors.scrimTextPrimary,
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.meta.size,
      letterSpacing: 1,
      marginBottom: Space.xs },
    heroTitle: {
      color: colors.scrimTextPrimary,
      fontFamily: FontFamily.bold,
      fontSize: TypographyV2.sectionTitle.size + 2,
      lineHeight: TypographyV2.sectionTitle.lineHeight + 4,
      marginBottom: Space.xs / 2 },
    heroMeta: {
      color: colors.scrimTextSecondary,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size },
    // Collections rail
    collectionsSection: {
      paddingVertical: Space.sm },
    sectionTitle: {
      paddingHorizontal: Space.md,
      fontSize: TypographyV2.body.size + 2,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
      marginBottom: Space.sm },
    railContent: {
      paddingHorizontal: Space.md },
    // Feed label
    feedLabelWrap: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      paddingBottom: Space.xs },
    feedLabel: {
      fontSize: TypographyV2.body.size + 2,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary },
    // Skeleton
    skeletonWrap: {
      flex: 1,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm },
    // Search results
    searchResultsWrap: {
      flex: 1 },
    scopeBar: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    scopeTab: {
      flex: 1,
      paddingVertical: Space.sm + 2,
      alignItems: 'center',
      position: 'relative' },
    scopeTabActive: {},
    scopeTabText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      color: colors.textMuted },
    scopeTabTextActive: {
      color: colors.textPrimary,
      fontFamily: FontFamily.semibold },
    scopeIndicator: {
      position: 'absolute',
      bottom: 0,
      left: '25%',
      right: '25%',
      height: 2,
      backgroundColor: colors.textPrimary,
      borderRadius: 1 },
    filterTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: Space.sm + 2,
      paddingLeft: Space.md,
      minHeight: 44 },
    filterTriggerText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary },
    filterTriggerTextActive: {
      color: colors.brand,
      fontFamily: FontFamily.semibold },
    activeFiltersRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    activeFiltersText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary },
    clearFiltersText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.brand },
    // People results
    peopleList: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    peopleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    peopleAvatar: {
      width: 44,
      height: 44,
      borderRadius: Radius.full },
    peopleAvatarFallback: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center' },
    peopleInfo: {
      flex: 1,
      gap: 2 },
    peopleName: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary },
    peopleUsername: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted } });
}

export type UnifiedDiscoveryStyles = ReturnType<typeof createUnifiedDiscoveryStyles>;
