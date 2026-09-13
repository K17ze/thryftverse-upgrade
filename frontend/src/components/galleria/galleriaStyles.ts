import { StyleSheet, type ImageStyle } from 'react-native';

import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { COLLECTION_CARD_HEIGHT, MASONRY_GAP, MASONRY_PADDING } from './galleriaLayout';

/** Dimension-derived heights the stylesheet depends on (computed from screen width). */
export interface GalleriaStyleLayout {
  heroHeight: number;
  featuredCollectionHeight: number;
}

/**
 * Shared stylesheet for the Galleria surface — used by the screen orchestrator
 * and the extracted galleria components. Style values are verbatim from the
 * original monolithic screen.
 */
export function createGalleriaStyles(colors: ThemeColors, layout: GalleriaStyleLayout) {
  const { heroHeight: HERO_HEIGHT, featuredCollectionHeight: FEATURED_COLLECTION_HEIGHT } = layout;
  return StyleSheet.create({
    stateContainer: {
      flex: 1,
      justifyContent: 'center' },
    // ── Honest demo indicator (AGENTS.md §11) ──
    demoBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm },
    demoBadgeDot: {
      width: Space.xs,
      height: Space.xs,
      borderRadius: Radius.full,
      backgroundColor: colors.textMuted },
    demoBadgeText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: TypographyV2.label.letterSpacing },
    // ── Hero — full-bleed, no card chrome ──
    heroContainer: {
      width: '100%',
      marginBottom: Space.lg,
      overflow: 'hidden' },
    heroImage: {
      width: '100%',
      height: HERO_HEIGHT } as ImageStyle,
    heroGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '65%' },
    heroOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: Space.lg,
      gap: Space.sm },
    heroEyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    heroEyebrowDot: {
      width: Space.xs + 2,
      height: Space.xs + 2,
      borderRadius: Radius.full,
      backgroundColor: colors.scrimTextPrimary },
    heroEyebrow: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.scrimTextPrimary,
      letterSpacing: TypographyV2.label.letterSpacing,
      opacity: 0.9 },
    heroTitle: {
      fontSize: TypographyV2.priceList.size,
      lineHeight: TypographyV2.priceList.lineHeight,
      fontFamily: TypographyV2.priceList.fontFamily,
      color: colors.scrimTextPrimary,
      letterSpacing: -0.5 },
    heroMeta: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.scrimTextPrimary,
      opacity: 0.75 },
    // ── Section wrappers ──
    sectionWrap: {
      marginBottom: Space.lg },
    sectionHeaderWrap: {
      paddingHorizontal: Space.md,
      paddingTop: Space.lg,
      paddingBottom: Space.sm },
    sectionEyebrow: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: TypographyV2.label.letterSpacing,
      marginBottom: Space.xs },
    sectionTitle: {
      fontSize: TypographyV2.priceList.size,
      lineHeight: TypographyV2.priceList.lineHeight,
      fontFamily: TypographyV2.priceList.fontFamily,
      color: colors.textPrimary,
      letterSpacing: -0.4 },
    // ── Collections rail ──
    railContent: {
      paddingHorizontal: Space.md,
      gap: Space.sm },
    // ── Featured collection ──
    featuredCollectionContainer: {
      marginHorizontal: Space.md,
      marginBottom: Space.md,
      borderRadius: Radius.xl,
      overflow: 'hidden' },
    featuredCollectionImage: {
      width: '100%',
      height: FEATURED_COLLECTION_HEIGHT } as ImageStyle,
    featuredCollectionGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '70%' },
    featuredCollectionOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: Space.lg,
      gap: Space.xs },
    featuredCollectionTheme: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.scrimTextPrimary,
      letterSpacing: TypographyV2.label.letterSpacing,
      opacity: 0.85 },
    featuredCollectionTitle: {
      fontSize: TypographyV2.priceList.size,
      lineHeight: TypographyV2.priceList.lineHeight,
      fontFamily: TypographyV2.priceList.fontFamily,
      color: colors.scrimTextPrimary,
      letterSpacing: -0.5 },
    featuredCollectionCuratorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.xs },
    featuredCollectionAvatar: {
      width: Space.smMd,
      height: Space.smMd,
      borderRadius: Radius.full } as ImageStyle,
    featuredCollectionCurator: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.scrimTextPrimary,
      opacity: 0.8 },
    collectionCard: {
      gap: Space.sm },
    collectionImageWrap: {
      width: '100%',
      height: COLLECTION_CARD_HEIGHT - 40,
      borderRadius: Radius.lg,
      overflow: 'hidden' },
    collectionImage: {
      width: '100%',
      height: '100%' } as ImageStyle,
    collectionGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '55%' },
    collectionOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: Space.sm,
      gap: Space.xs / 2 },
    collectionTheme: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.scrimTextPrimary,
      opacity: 0.85,
      letterSpacing: TypographyV2.label.letterSpacing - 0.1 },
    collectionTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      color: colors.scrimTextPrimary,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing },
    collectionMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    collectionAvatar: {
      width: Space.smMd,
      height: Space.smMd,
      borderRadius: Radius.full } as ImageStyle,
    collectionCurator: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    // ── Featured assets masonry ──
    masonryGrid: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingHorizontal: MASONRY_PADDING,
      gap: MASONRY_GAP },
    masonryColumn: {
      flexDirection: 'column',
      gap: MASONRY_GAP },
    assetCard: {
      gap: Space.xs },
    assetImageWrap: {
      width: '100%',
      borderRadius: Radius.lg,
      overflow: 'hidden' },
    assetImage: {
      width: '100%',
      height: '100%' } as ImageStyle,
    assetMeta: {
      gap: Space.xs / 2 },
    assetCollection: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: TypographyV2.label.letterSpacing - 0.2 },
    assetTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.body.letterSpacing },
    assetValuation: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.size - 2,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      letterSpacing: TypographyV2.body.letterSpacing },
    // ── Editorial list ──
    editorialItem: {
      paddingHorizontal: Space.md,
      marginBottom: Space.lg },
    editorialItemLast: {
      marginBottom: Radius.none },
    editorialHeroWrap: {
      width: '100%',
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt },
    editorialHero: {
      width: '100%',
      height: '100%' } as ImageStyle,
    editorialHeroGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '40%' },
    editorialHeroOverlay: {
      position: 'absolute',
      bottom: Space.sm,
      right: Space.sm },
    editorialReadTime: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.scrimTextPrimary,
      letterSpacing: TypographyV2.label.letterSpacing - 0.2,
      backgroundColor: colors.overlay,
      paddingHorizontal: Space.xs + 2,
      paddingVertical: Space.xs / 2,
      borderRadius: Radius.sm,
      overflow: 'hidden' },
    editorialContent: {
      paddingTop: Space.sm,
      gap: Space.xs },
    editorialTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing },
    editorialTitleLarge: {
      fontSize: TypographyV2.priceList.size,
      lineHeight: TypographyV2.priceList.lineHeight,
      letterSpacing: -0.4 },
    editorialExcerpt: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary },
    editorialAuthorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.xs / 2 },
    editorialAvatar: {
      width: 18,
      height: 18,
      borderRadius: Radius.full } as ImageStyle,
    editorialAuthor: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    editorialSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: Space.lg },
    // ── Styling Tools — Poster Studio row (FlagshipNavigationRow owns
    //    its own padding + hairline grammar) ──
    stylingToolsWrap: {
      marginTop: Space.lg },
    screenContent: {
      paddingHorizontal: 0,
      paddingTop: 0 } });
}

export type GalleriaStyles = ReturnType<typeof createGalleriaStyles>;
