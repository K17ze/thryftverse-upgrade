import { StyleSheet } from 'react-native';

import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/**
 * Pinterest/Depop grid edge: ~8pt from screen edge to tile edge — the media
 * nearly touches the screen edge. This is the single source of truth for
 * the masonry grid's `horizontalPadding` AND for every content rail on the
 * discovery surface: first chips, rail cards, section titles and meta lines
 * all align to this one 8pt rail instead of stacking a wider text margin.
 */
export const DISCOVERY_GRID_PADDING = Space.sm;

/**
 * Horizontal inset the masonry grid applies around its content container —
 * `horizontalPadding − gap/2` for the grid's default geometry (= 5pt).
 * Header modules opt out with the negative of this value so media can bleed
 * to the screen edge while their inner DISCOVERY_GRID_PADDING padding keeps
 * first children on the same 8pt rail as the tiles below.
 */
export const DISCOVERY_GRID_INSET = DISCOVERY_GRID_PADDING - (Space.xs + 2) / 2;

/**
 * Shared stylesheet for the UnifiedDiscovery surface — used by the screen
 * orchestrator and the extracted discovery components.
 *
 * Composition rules (AGENTS.md §4): chrome is quiet and transparent, media
 * bleeds, utility respects the 16pt tile gutter, and section rhythm comes
 * from Space tokens — not from boxes.
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
    headerBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    // Search header — ONE quiet row: back glyph + a single-line field. No
    // filled container (Depop/Instagram grammar): the only field boundary
    // is a 1pt baseline that darkens on focus, and FlagshipScreen's own
    // scroll hairline owns separation once the feed moves.
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: Space.xs,
      paddingRight: Space.md },
    searchFieldWrap: {
      flex: 1,
      borderBottomWidth: Stroke.standard,
      borderBottomColor: colors.borderSubtle },
    searchFieldWrapFocused: {
      borderBottomColor: colors.textPrimary },
    // Flattens AppSearchBar's boxed container — glyph + a single line of
    // type on the canvas instead of a grey rounded rectangle.
    searchField: {
      backgroundColor: 'transparent',
      borderRadius: 0,
      borderWidth: 0,
      paddingHorizontal: 0,
      paddingVertical: 0 },
    // Category chips — compact Pinterest/Depop explore grammar: ~28pt tall,
    // hairline outline when unselected, filled dark ONLY for the selected
    // chip. Personalised chips are marked by the brand dot, never by a
    // second fill — two unselected fills reads as decorative chrome.
    // The bar owns only its top gap — the following module's margin (hero)
    // or feedStartSpace owns the chips→content gap so it stays ≤8pt with no
    // stacked double-padding.
    categoryBar: {
      paddingTop: Space.xs },
    categoryBarContent: {
      flexDirection: 'row',
      paddingHorizontal: DISCOVERY_GRID_PADDING,
      gap: Space.xs,
      alignItems: 'center' },
    categoryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: Space.smMd,
      paddingVertical: 6,
      borderRadius: Radius.full,
      backgroundColor: 'transparent',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle },
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
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary,
      letterSpacing: TypographyV2.caption.letterSpacing },
    categoryPillTextActive: {
      color: colors.textInverse },
    // Header modules — bleed out of the grid's content inset so editorial
    // media reaches the screen edge; inner DISCOVERY_GRID_PADDING padding
    // keeps text and first rail items aligned to the 8pt tile rail.
    headerBleed: {
      marginHorizontal: -DISCOVERY_GRID_INSET },
    // Hero editorial — media, not a banner card: edge-to-edge bleed, a 3:2
    // art-directed crop, and the title + meta set over a scrim. No eyebrow —
    // the media and its title are the label.
    heroWrap: {
      aspectRatio: 3 / 2,
      marginTop: Space.sm },
    heroImage: {
      width: '100%',
      height: '100%' },
    heroGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '55%' },
    heroOverlay: {
      position: 'absolute',
      left: Space.md,
      right: Space.md,
      bottom: Space.smMd },
    heroTitle: {
      color: colors.scrimTextPrimary,
      fontFamily: FontFamily.bold,
      fontSize: TypographyV2.sectionTitle.size + 2,
      lineHeight: TypographyV2.sectionTitle.lineHeight + 4,
      marginBottom: Space.xxs },
    heroMeta: {
      color: colors.scrimTextSecondary,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size },
    // Collections rail — one quiet header marks the content-type change;
    // the cards already carry theme + title + curator, so nothing else is
    // labelled.
    collectionsSection: {
      marginTop: Space.lg },
    sectionTitle: {
      paddingHorizontal: DISCOVERY_GRID_PADDING,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      marginBottom: Space.sm },
    railContent: {
      paddingHorizontal: DISCOVERY_GRID_PADDING },
    // Breathing room between the last header module and the first tiles —
    // one 8pt beat, matching the tile edge margin and the chips→hero gap.
    feedStartSpace: {
      height: Space.sm },
    // Skeleton — MasonrySkeleton owns its own horizontal padding AND top
    // rhythm (its category bar carries the same paddingTop as the real bar),
    // so the wrapper adds no band of its own.
    skeletonWrap: {
      flex: 1 },
    // Search results
    searchResultsWrap: {
      flex: 1 },
    scopeBar: {
      flexDirection: 'row',
      paddingHorizontal: DISCOVERY_GRID_PADDING,
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
    // Scope-bar glyph action (save search) — transparent 44pt hit area,
    // icon-only, matching the filter trigger's quiet chrome.
    scopeAction: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.sm,
      minWidth: Control.hit,
      minHeight: 44 },
    // Results meta — quiet count + retrieval-fallback note above the grid.
    // Meta size, muted ink; the grid is the dominant object, not the label.
    resultsMetaWrap: {
      // Rendered inside the grid's list header — bleed out of the content
      // inset, then re-apply the tile rail so the meta line aligns with the
      // tiles below (same pattern as headerBleed).
      marginHorizontal: -DISCOVERY_GRID_INSET,
      paddingHorizontal: DISCOVERY_GRID_PADDING,
      paddingTop: Space.sm,
      paddingBottom: Space.xs,
      gap: 2 },
    resultsMetaText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      letterSpacing: 0.2 },
    filterTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: Space.sm + 2,
      paddingLeft: DISCOVERY_GRID_PADDING,
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
      paddingHorizontal: DISCOVERY_GRID_PADDING,
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
      paddingHorizontal: DISCOVERY_GRID_PADDING,
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
