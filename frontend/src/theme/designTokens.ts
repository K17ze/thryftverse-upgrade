/**
 * Design Tokens — Thryftverse Visual System
 * Production Art Direction: Editorial + tactile + trustworthy + fashion-native + commerce-precise.
 *
 * Quality comes from composition, hierarchy, rhythm, contrast and restraint —
 * not from shadows on every surface, cards around every element, gradients
 * everywhere, glass effects, or excessive animation.
 *
 * Anti-AI principles:
 * - No generic blue-purple gradients
 * - No glassmorphism on content cards
 * - No decorative orbs, sparkles, or breathing icons
 * - No shadows on every surface
 * - No card-on-card composition
 * - Luxury from geometry and typography, not gold ornament
 *
 * Use these tokens instead of random inline values.
 */

// ============================================================================
// SPACING SCALE (4px base grid)
// ============================================================================
export const Space = {
  /** 2px - Hairline gaps, sub-token adjustments */
  xxs: 2,
  /** 4px - Micro adjustments, icon gaps */
  xs: 4,
  /** 8px - Tight spacing, inline elements, grid gaps */
  sm: 8,
  /** 12px - Medium-tight spacing, grid gaps, rail gaps */
  smMd: 12,
  /** 16px - Default padding, card padding, section gaps */
  md: 16,
  /** 24px - Section breaks, major separators */
  lg: 24,
  /** 32px - Major sections, hero spacing */
  xl: 32,
  /** 48px - Large hero sections, onboarding */
  xxl: 48 } as const;

// ============================================================================
// BORDER RADIUS (Intentional, consistent shapes)
// ============================================================================
export const Radius = {
  /** 0 - Images (full-bleed), sharp edges */
  none: 0,
  /** 4px - Buttons, inputs, small elements */
  sm: 4,
  /** 8px - Small cards, chips, badges */
  md: 8,
  /** 12px - Modals, sheets, medium cards */
  lg: 12,
  /** 16px - Large cards, containers */
  xl: 16,
  /** 20px - Chat bubbles (WhatsApp 2026 fully-rounded look) */
  chat: 20,
  /** 24px - Navigation docks and genuinely dominant panels only */
  xxl: 24,
  /** 999px - Pills, avatars, floating buttons, tags */
  full: 999 } as const;

// ============================================================================
// TYPOGRAPHY (Inter — editorial scale with clear relationships)
// ============================================================================
interface TypeStyle {
  size: number;
  lineHeight: number;
  weight: '400' | '500' | '600' | '700';
  letterSpacing: number;
}

// ============================================================================
// FONT FAMILIES (Inter set)
// ============================================================================
export const FontFamily = {
  light: 'Inter_300Light',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold' } as const;

// Editorial serif accent — Playfair Display, loaded globally in App.tsx.
// Used sparingly for editorial/display moments: auction lot titles,
// editorial section headers, "Discover" module headers, seller profile
// names. Serifs measurably increase perceived quality (+13% per
// Monotype/Cotford study) and distinguish ThryftVerse from generic
// AI-generated marketplace UIs. On-brand for a vintage/secondhand marketplace.
// Per AGENTS.md §4: this is a deliberate, authored choice — not decoration.
export const FontFamilySerif = {
  regular: 'PlayfairDisplay_400Regular',
  bold: 'PlayfairDisplay_700Bold' } as const;

export const FontSize = {
  micro: 10,
  caption: 12,
  body: 15,
  bodyLarge: 16,
  title: 21,
  heading: 30,
  display: 40,
  hero: 56,
  giant: 72 } as const;

export const LetterSpacing = {
  tight: -0.42,
  normal: 0,
  wide: 0.12,
  caps: 0.82 } as const;

// ============================================================================
// SEMANTIC TYPOGRAPHY — Editorial type scale
// One weight delta is normally enough to express hierarchy.
// Prices and financial quantities use tabular figures (see Numeric below).
// ============================================================================
export const Type = {
  // ── Display / campaign ──
  /** 24/30/700 — Auth hero, empty state titles, rare campaign statement */
  display: { size: 24, lineHeight: 30, weight: '700', letterSpacing: -0.5 },
  /** 28/34/700 — Hero campaign statements, splash headlines */
  hero: { size: 28, lineHeight: 34, weight: '700', letterSpacing: -0.5 },

  // ── Screen identity ──
  /** 20/26/700 — Hero titles, screen headers, profile names */
  title: { size: 20, lineHeight: 26, weight: '700', letterSpacing: -0.6 },
  /** 20/26/700 — Semantic alias: screen identity (maps to title) */
  screenTitle: { size: 20, lineHeight: 26, weight: '700', letterSpacing: -0.6 },

  // ── Section / item titles ──
  /** 17/22/600 — Section titles, card headers, product names, feed item titles */
  heading: { size: 17, lineHeight: 22, weight: '600', letterSpacing: -0.4 },
  /** 17/24/600 — Section titles, card headers, product names */
  subtitle: { size: 17, lineHeight: 24, weight: '600', letterSpacing: -0.4 },
  /** 17/24/600 — Semantic alias: major section (maps to subtitle) */
  sectionTitle: { size: 17, lineHeight: 24, weight: '600', letterSpacing: -0.4 },
  /** 18/24/600 — Product/person/conversation title in lists */
  itemTitle: { size: 18, lineHeight: 24, weight: '600', letterSpacing: -0.3 },

  // ── Body ──
  /** 14/20/400 — Body text, descriptions, general content */
  body: { size: 14, lineHeight: 20, weight: '400', letterSpacing: -0.2 },
  /** 15/21/600 — Strong body, picker values, emphasized descriptions */
  bodyEmphasis: { size: 15, lineHeight: 21, weight: '600', letterSpacing: 0 },
  /** 15/21/600 — Semantic alias: emphasized body (maps to bodyEmphasis) */
  bodyStrong: { size: 15, lineHeight: 21, weight: '600', letterSpacing: 0 },
  /** 16/22/700 — Card price hero, emphasized numeric values */
  bodyLarge: { size: 16, lineHeight: 22, weight: '700', letterSpacing: -0.2 },

  // ── Price / financial ──
  /** 14/20/600 — Button text, emphasized content, compact prices (LEGACY — prefer priceList for actual prices) */
  price: { size: 14, lineHeight: 20, weight: '600', letterSpacing: -0.2 },
  /** 20/24/700 — Prices in lists, totals */
  priceList: { size: 20, lineHeight: 24, weight: '700', letterSpacing: -0.3 },
  /** 28/32/700 — Hero prices, checkout totals */
  priceLarge: { size: 28, lineHeight: 32, weight: '700', letterSpacing: -0.5 },
  /** 28/32/700 — Semantic alias: PDP/checkout total (maps to priceLarge) */
  priceHero: { size: 28, lineHeight: 32, weight: '700', letterSpacing: -0.5 },

  // ── Caption / metadata ──
  /** 12/16/400 — Captions, metadata, timestamps, hints */
  caption: { size: 12, lineHeight: 16, weight: '400', letterSpacing: 0 },
  /** 13/18/400 — Metadata, timestamps, hints (elevated) */
  captionElevated: { size: 13, lineHeight: 18, weight: '400', letterSpacing: 0.1 },
  /** 11/14/500 — Small metadata, seller handles */
  meta: { size: 11, lineHeight: 14, weight: '500', letterSpacing: 0.15 },
  /** 11/14/600 — Labels, badges, section headers (elevated) */
  metaElevated: { size: 11, lineHeight: 14, weight: '600', letterSpacing: 0.5 },
  /** 11/14/600 — Semantic alias: controls/field labels (maps to metaElevated) */
  label: { size: 11, lineHeight: 14, weight: '600', letterSpacing: 0.5 },

  // ── Numeric metadata ──
  /** 13/18/600 — Bids, quantities, P&L (tabular figures via Numeric.numericMeta) */
  numericMeta: { size: 13, lineHeight: 18, weight: '600', letterSpacing: 0 } } as const satisfies Record<string, TypeStyle>;

// REMOVED (to reduce visual chaos):
// - captionEmphasis (merged into caption or price)
// - bodyEmphasis (merged into price)
// - headline (renamed to subtitle)
// - title3, title2, title1 (consolidated to title only)
// - Multiple letterSpacing values (standardized)

// ============================================================================
// BACKWARD-COMPATIBLE TYPOGRAPHY RE-EXPORT (Phase 0 Migration)
// Use FontFamily / Type / FontSize directly in new code.
// ============================================================================
export const Typography = {
  family: FontFamily,
  size: FontSize,
  tracking: LetterSpacing } as const;

/**
 * @deprecated Use `Type` tokens + `FontFamily` directly. TypeStyles is kept
 * only for backward compatibility and now mirrors `Type` values exactly.
 * Do not add new variants here — use `Type` instead.
 */
export const TypeStyles: { [key: string]: import('react-native').TextStyle } = {
  display: {
    fontFamily: FontFamily.bold,
    fontSize: TypographyV2.display.size,
    letterSpacing: TypographyV2.display.letterSpacing,
    lineHeight: TypographyV2.display.lineHeight },
  hero: {
    fontFamily: FontFamily.bold,
    fontSize: TypographyV2.display.size,
    letterSpacing: TypographyV2.display.letterSpacing,
    lineHeight: TypographyV2.display.lineHeight },
  heading: {
    fontFamily: FontFamily.bold,
    fontSize: TypographyV2.sectionTitle.size,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    lineHeight: TypographyV2.sectionTitle.lineHeight },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: TypographyV2.screenTitle.size,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
    lineHeight: TypographyV2.screenTitle.lineHeight },
  body: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
    letterSpacing: TypographyV2.body.letterSpacing,
    lineHeight: TypographyV2.body.lineHeight },
  bodyEmphasis: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  bodyStrong: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  caption: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.meta.size,
    letterSpacing: TypographyV2.meta.letterSpacing,
    lineHeight: TypographyV2.meta.lineHeight },
  metadata: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.meta.size,
    letterSpacing: TypographyV2.meta.letterSpacing,
    lineHeight: TypographyV2.meta.lineHeight },
  overline: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.label.size,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
    lineHeight: TypographyV2.label.lineHeight },
  button: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    letterSpacing: 0,
    lineHeight: TypographyV2.bodyStrong.lineHeight } };

// ============================================================================
// ELEVATION / SHADOWS — deliberate depth, not decoration
// Use depth only to clarify hierarchy, touchability, or modal separation.
// Avoid shadows on every card, cards inside cards, and decorative badges.
// ============================================================================
export interface ShadowConfig {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export const Elevation = {
  /** No shadow — flat elements, default utility structure */
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0 },
  /** Hairline — barely perceptible separation for grouped content.
   *  Use for cards that need to float above a same-colour canvas. */
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1 },
  /** Card — elevated cards, buttons. Deliberate but restrained. */
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3 },
  /** Floating — FABs, sticky docks, overlays. Separates from scroll content. */
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 6 },
  /** Modal — bottom sheets, dialogs. Clear material separation. */
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 12 } } as const satisfies Record<string, ShadowConfig>;

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================
import { Dimensions } from 'react-native';


import { TypographyV2 } from '../theme/typography.v2';

export const Layout = {
  get screenWidth() { return Dimensions.get('window').width; },
  get screenHeight() { return Dimensions.get('window').height; },
  /** 2-column masonry grid item width with 16px gaps */
  get gridItemWidth() { return (Dimensions.get('window').width - Space.md * 3) / 2; },
  /** Full width minus padding */
  get contentWidth() { return Dimensions.get('window').width - Space.md * 2; },
  /** Standard grid configuration */
  gridColumns: 2,
  gridGap: Space.sm };

// ============================================================================
// Z-INDEX SCALE
// ============================================================================
export const ZIndex = {
  base: 0,
  elevated: 10,
  sticky: 100,
  dropdown: 200,
  modal: 300,
  toast: 400,
  overlay: 500 } as const;

// ============================================================================
// STICKY DOCK GEOMETRY
// ============================================================================
// CoOwnStickyActionDock and CommerceStickyDock both have minHeight: 72.
// Use these to compute scroll bottom padding instead of hardcoded spacers.
export const DockConstants = {
  /** Base dock content height (minHeight from dock styles) */
  baseHeight: 72,
  /** Single-action dock (one full-width button) — typical total */
  singleActionHeight: 104,
  /** Two-action dock (cancel + confirm side by side) — typical total */
  dualActionHeight: 140,
  /** Stacked compact dock (buttons stacked vertically) — typical total */
  stackedActionHeight: 188,
  /** Primary button height per Design.md button-primary spec (52px) */
  primaryButtonHeight: 52,
  /** Secondary/quiet button height per Design.md button-quiet spec (44px) */
  secondaryButtonHeight: 44,
  /** Dock top padding — breathing room above action buttons */
  dockTopPadding: 10 } as const;

// ============================================================================
// EXCHANGE LAYOUT GEOMETRY — Co-Own market surfaces
// Deterministic geometry for skeletons to match final layouts.
// ============================================================================
export const ExchangeLayout = {
  // Order ticket sheet snap points (bottom sheet on mobile)
  ticketSnapCollapsed: 120,
  ticketSnapExpanded: '80%' as const,
  // Order book row height — deterministic for skeleton match (44pt touch target)
  bookRowHeight: 44,
  bookVisibleLevels: 5,      // mobile default; 10 on tablet
  // Market-status strip height
  statusStripHeight: 36,
  // Value strip (last/bid/ask/mid/NAV) row height
  valueStripRowHeight: 44,
  // Chart hero min height on AssetDetail
  chartHeroMinHeight: 220 } as const;

// ============================================================================
// NUMERIC TYPOGRAPHY — tabular figures for all 1ZE values
// Inter supports tnum via fontVariant: ['tabular-nums'] — no new font needed.
// Every 1ZE amount, unit count, percentage, P&L uses a Numeric.* style.
// ============================================================================
export const Numeric = {
  // Prices in lists, totals
  price: {
    ...Type.price,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
    fontFeatureSettings: '"tnum" 1, "lnum" 1' },
  // Elevated price (20/24/700)
  priceList: {
    ...Type.priceList,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  // Hero price (28/32/700)
  priceLarge: {
    ...Type.priceLarge,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  // Hero portfolio / wallet value (24/30/700)
  display: {
    ...Type.display,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  // Numeric metadata — bids, quantities, P&L (13/18/600)
  numericMeta: {
    ...Type.numericMeta,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  // Order book, depth, stats grids — compact mono feel
  mono: {
    size: 13,
    lineHeight: 18,
    weight: '500' as const,
    letterSpacing: 0,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] } } as const;

// ============================================================================
// CONTROL GEOMETRY (hit area and visible chrome are deliberately separate)
// ============================================================================
export const Control = {
  /** Minimum practical touch target. This is not the visible button size. */
  hit: 44,
  /** Compact visible background used only when a control needs containment. */
  chromeCompact: 32,
  /** Standard visible background used for prominent contained controls. */
  chrome: 36,
  /** Standard navigation/action glyph. */
  icon: 22,
  /** Compact inline glyph. */
  iconCompact: 18 } as const;

export const Stroke = {
  /** Subtle separators and grouped-list hairlines. */
  hairline: 0.5,
  /** Fields and intentionally outlined controls. */
  standard: 1,
  /** Selection/focus only; never routine card decoration. */
  emphasis: 2 } as const;

// ============================================================================
// THUMBNAIL & AVATAR SIZES — canonical dimensions for card media and identity
// Replaces hardcoded IMAGE_SIZE / AVATAR_SIZE in flagship primitives (audit M16).
// ============================================================================
export const ThumbSize = {
  /** 40px — sticky dock anchor thumbnail */
  dock: 40,
  /** 64px — compact list row thumbnail */
  sm: 64,
  /** 72px — standard list row thumbnail (order cards, asset cards) */
  md: 72,
  /** 80px — large list row thumbnail (asset cards) */
  lg: 80 } as const;

export const AvatarSize = {
  /** 24px — inline metadata avatar (comment rows, chat list) */
  inline: 24,
  /** 32px — compact avatar (notification rows) */
  sm: 32,
  /** 40px — standard list avatar (chat list, seller row) */
  md: 40,
  /** 56px — utility rail avatar */
  lg: 56,
  /** 76px — edit preview avatar */
  edit: 76,
  /** 84px — identity hero avatar */
  identity: 84,
  /** 88px — standard profile hero avatar */
  hero: 88,
  /** 104px — large profile hero avatar */
  xl: 104 } as const;

// ============================================================================
// ICON GRAMMAR — one icon family, one optical size band, stable outline/filled rule
// Ionicons is the single icon family. Filled state = selected/active/saved.
// ============================================================================
export const IconGrammar = {
  /** Standard navigation/action glyph. 20–24pt optical band. */
  standard: 22,
  /** Compact inline glyph for metadata rows. 14–18pt optical band. */
  metadata: 16,
  /** Small badge/indicator glyph. 12–14pt optical band. */
  badge: 12,
  /** Hero/empty-state glyph. 28–32pt optical band. */
  hero: 28,
  /** Outline = default/resting state. Filled = selected/active/saved. */
  filledStates: ['heart', 'bookmark', 'star', 'bookmark-outline', 'heart-outline'] as readonly string[] } as const;

// ============================================================================
// PRESS FEEDBACK — scale values for press interactions
// Press scale: 0.97–0.985 per Design.md motion patterns
// ============================================================================
export const PressScale = {
  /** Crisp tap — buttons, list rows */
  tap: 0.97,
  /** Gentle press — large surfaces, cards */
  gentle: 0.985,
  /** Icon-only press — controls with transparent background */
  icon: 0.92 } as const;

// ============================================================================
// ASPECT RATIOS (width / height)
// 2026 standard: portrait 3:4 imagery (Poshmark March 2026 redesign).
// Use these tokens instead of inline numeric ratios so media geometry stays
// consistent across discovery, detail, and creator surfaces.
// ============================================================================
export const AspectRatio = {
  /** 1:1 — legacy/default square */
  square: 1,
  /** 3:4 — Poshmark 2026 portrait standard */
  portrait: 3 / 4,
  /** 9:16 — story / tall portrait format */
  portraitTall: 9 / 16,
  /** 4:3 — landscape */
  landscape: 4 / 3,
  /** 16:9 — wide */
  wide: 16 / 9,
  /** 4:5 — marketplace standard (Depop, Instagram) */
  marketplace: 4 / 5 } as const;

// ============================================================================
// FEED LAYOUT GEOMETRY — Home and discovery feed surfaces
// Replaces hardcoded constants in HomeScreen with tokenized values.
// ============================================================================
export const FeedLayout = {
  /** Expanded header height (wordmark + actions visible) */
  headerExpanded: 58,
  /** Collapsed header height (compact, scrolled state) */
  headerCollapsed: 52,
  /** Grid gap between masonry columns */
  gridGap: Space.smMd,
  /** Poster rail card width */
  posterCardWidth: 76,
  /** Poster rail card height (9:16-ish aspect) */
  posterCardHeight: 135,
  /** Listing card chrome height (title + price + seller row) */
  listingCardChromeHeight: 110,
  /** Skeleton height variation ratios for natural masonry rhythm */
  skeletonHeightRatios: [1.25, 1.08, 1.32, 1.16] as readonly number[],
  /** Missing media fallback height ratio */
  missingMediaHeightRatio: 0.78,
  /** Feed tab indicator height */
  tabIndicatorHeight: 2,
  /** Feed tab horizontal padding */
  tabPaddingH: Space.md,
  /** Feed tab vertical padding */
  tabPaddingV: Space.sm,
  /** Pull-to-refresh distance threshold */
  refreshDistance: 80 } as const;

// ============================================================================
// PROFILE LAYOUT GEOMETRY — Profile and identity surfaces
// Replaces 7 different hardcoded COVER_HEIGHT and 5 AVATAR_SIZE values
// with a single canonical token set.
// ============================================================================
export const ProfileLayout = {
  /** Standard cover height — used by ProfileHero and UserProfileScreen */
  coverHeight: 160,
  /** Compact cover height — used by MyProfileScreen (slightly shorter for own profile) */
  coverHeightCompact: 152,
  /** Skeleton cover height — matches coverHeight for no-shift loading */
  coverHeightSkeleton: 160,
  /** Edit preview cover height — smaller for edit profile sheet */
  coverHeightEdit: 120,
  /** States cover height — for error/unavailable state canvas */
  coverHeightStates: 168,
  /** Standard avatar size — used by ProfileHero (seam-row composition) */
  avatarStandard: 88,
  /** Identity hero avatar — used by MyProfileIdentityHero */
  avatarIdentity: 84,
  /** Public identity avatar — used by PublicProfileIdentityHero */
  avatarPublic: 88,
  /** Edit preview avatar — smaller for edit profile sheet */
  avatarEdit: 76,
  /** Skeleton avatar — matches avatarIdentity */
  avatarSkeleton: 84,
  /** Avatar overlap into cover (half the standard avatar) */
  avatarOverlap: 44,
  /** Stats row height in seam composition */
  statsRowHeight: 44,
  /** Tab rail height (44pt touch target per AGENTS.md §13) */
  tabRailHeight: 44,
  /** Utility rail item size */
  utilityRailItem: 56,
  /** Co-Own portfolio preview card height */
  portfolioPreviewHeight: 72 } as const;

// ============================================================================
// SEARCH LAYOUT GEOMETRY — Search and explore surfaces
// ============================================================================
export const SearchLayout = {
  /** Search bar height (44pt touch target + internal padding) */
  searchBarHeight: 48,
  /** Search bar border radius */
  searchBarRadius: Radius.lg,
  /** Tab bar height (44pt touch target) */
  tabBarHeight: 44,
  /** Tab indicator height */
  tabIndicatorHeight: 2,
  /** Recent search pill height */
  recentPillHeight: 36,
  /** Recent search pill radius */
  recentPillRadius: Radius.full,
  /** Suggestion row height (44pt touch target) */
  suggestionRowHeight: 44,
  /** Filter chip height */
  filterChipHeight: 32,
  /** Filter chip radius */
  filterChipRadius: Radius.full,
  /** Trending search pill height */
  trendingPillHeight: 36,
  /** Editorial card height */
  editorialCardHeight: 120,
  /** Explore grid gap */
  exploreGridGap: Space.smMd } as const;

// ============================================================================
// COMMERCE DETAIL LAYOUT — Product detail hardcoded dimensions
// Replaces hardcoded card widths, image heights, zoom constants.
// ============================================================================
export const CommerceLayout = {
  /** Related rail card width */
  relatedCardWidth: 148,
  /** Related rail card image height */
  relatedCardImageHeight: 168,
  /** Related rail badge offset */
  relatedBadgeOffset: Space.sm,
  /** Bundle upsell thumbnail size */
  bundleThumbSize: 72,
  /** Dock thumbnail size (anchoring product in sticky dock) */
  dockThumbnailSize: 40,
  /** Dock protection strip icon size */
  dockProtectionIcon: 16,
  /** Media stage max zoom */
  mediaMaxZoom: 4,
  /** Media stage min zoom */
  mediaMinZoom: 1,
  /** Media stage double-tap zoom target (normal motion) */
  mediaDoubleTapZoom: 2.5,
  /** Media stage double-tap zoom target (reduced motion) */
  mediaDoubleTapZoomReduced: 2,
  /** Fullscreen viewer max zoom */
  fullscreenMaxZoom: 5,
  /** Fullscreen viewer swipe-to-dismiss threshold */
  fullscreenDismissThreshold: 100,
  /** Price chart height */
  priceChartHeight: 120,
  /** Price chart padding */
  priceChartPadding: Space.sm,
  /** Price chart min width */
  priceChartMinWidth: 280,
  /** Price chart max width */
  priceChartMaxWidth: 440,
  /** Candle chart height */
  candleChartHeight: 140,
  /** Candle chart volume section height */
  candleChartVolumeHeight: 30,
  /** Candle width */
  candleWidth: 6,
  /** Candle gap */
  candleGap: 2 } as const;

// ============================================================================
// EDITOR CHROME — 2026 flagship media-editor grammar
// Glass materials for FLOATING editor chrome (sheets, rails, plates) over
// media. Design.md forbids glass on CONTENT cards — these tokens are for
// floating chrome only, matching IG Stories / Snapchat editor patterns.
// Calibrated against Aug 2026 teardowns (see .devin/reports/flagship-editor-upgrade-analysis.md).
// ============================================================================

/** Blur tint names compatible with expo-blur BlurView `tint` prop. */
export type EditorBlurTint =
  | 'light'
  | 'dark'
  | 'default'
  | 'systemUltraThinMaterial'
  | 'systemThinMaterial'
  | 'systemMaterial'
  | 'systemThickMaterial'
  | 'systemUltraThinMaterialDark'
  | 'systemThinMaterialDark'
  | 'systemMaterialDark'
  | 'systemThickMaterialDark';

export interface EditorMaterialSpec {
  /** expo-blur BlurView intensity (0–100). */
  blurIntensity: number;
  /** expo-blur BlurView tint. */
  tint: EditorBlurTint;
  /** Overlay color painted on top of the blur (adds legibility/depth). */
  overlay: string;
  /** Hairline border color for the glass edge. */
  hairline: string;
}

export const EditorMaterial = {
  /** Editor sheet / tray — glass panel over media (effects, overflow, sticker). */
  sheet: {
    blurIntensity: 90,
    tint: 'systemThickMaterialDark' as EditorBlurTint,
    overlay: 'rgba(20,20,20,0.55)',
    hairline: 'rgba(255,255,255,0.10)' },
  /** Floating tool rail / dock over media (timeline, bottom rail). */
  rail: {
    blurIntensity: 24,
    tint: 'dark' as EditorBlurTint,
    overlay: 'rgba(0,0,0,0.35)',
    hairline: 'rgba(255,255,255,0.12)' },
  /** Single on-media control plate (32pt tool backplate, loading pill). */
  plate: {
    blurIntensity: 16,
    tint: 'dark' as EditorBlurTint,
    overlay: 'rgba(0,0,0,0.30)',
    hairline: 'rgba(255,255,255,0.14)' } } as const satisfies Record<string, EditorMaterialSpec>;

/** Role-based radii for editor chrome — replaces ad-hoc Radius.sm/xl usage. */
export const EditorRadius = {
  /** Sheet top corners (replaces mixed 16/20). */
  sheet: 20,
  /** Floating rail / dock capsule corners. */
  rail: 18,
  /** Tool backplate (replaces Radius.sm=4 — the biggest "2015" tell). */
  plate: 10,
  /** Slider thumbs / pills. */
  thumb: 999 } as const;

/** On-media glyph & text legibility — single source of truth.
 *  Replaces 26+ files of hand-rolled textShadow values with divergent
 *  radii/offsets. Apply via `style={GlyphShadow.glyph}` on white-on-media
 *  Text/glyph elements. */
export const GlyphShadow = {
  /** 22–24pt glyph on media. */
  glyph: {
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3 },
  /** 11pt label under glyph. */
  label: {
    textShadowColor: 'rgba(0,0,0,0.40)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2 },
  /** 17pt sheet title / larger text on media. */
  title: {
    textShadowColor: 'rgba(0,0,0,0.50)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4 } } as const;

/** Scrim gradients for top/bottom/side edges over media.
 *  Consumed via expo-linear-gradient `<LinearGradient colors={Scrim.top.colors} locations={Scrim.top.locations} />`. */
export const Scrim = {
  /** Top edge scrim — fades from 45% black to transparent. */
  top: {
    colors: ['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.18)', 'transparent'],
    locations: [0, 0.6, 1] },
  /** Bottom edge scrim — fades from transparent to 55% black. */
  bottom: {
    colors: ['transparent', 'rgba(0,0,0,0.22)', 'rgba(0,0,0,0.55)'],
    locations: [0, 0.5, 1] },
  /** Side edge scrim — for left/right tool columns. */
  edge: {
    colors: ['rgba(0,0,0,0.30)', 'transparent'],
    locations: [0, 1] } } as const;

// ============================================================================
// OUTFIT BUILDER COLOURS — pastel background swatches for outfit slots
// Used by OutfitBuilderScreen background picker. The pastels are warm-neutral
// editorial tones; the dark entry provides a high-contrast backdrop option.
// ============================================================================
export const OutfitColors = {
  pastels: ['#F5F5F0', '#E8E4DF', '#D4C9BE', '#C9D9E8', '#D9D0E1', '#E8D4D4', '#D4E8D6'],
  dark: '#1A1A1A' } as const;

// ============================================================================
// COIN GRADIENT — 1ZE coin icon gradient
// The signature gold gradient for the OnezeCoinIcon component. Replaces
// hardcoded inline hex values with a single source of truth.
// ============================================================================
export const CoinGradient = {
  start: '#f4d27b',
  end: '#c68a2d' } as const;
