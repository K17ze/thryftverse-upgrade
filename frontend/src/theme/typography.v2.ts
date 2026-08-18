/**
 * Typography v2 Contract — Thryftverse Visual System
 *
 * Canonical semantic type roles for the entire app. This contract is the
 * single source of truth for type roles. The legacy `Type` / `TypeStyles`
 * maps in designTokens.ts are kept for backward compatibility during
 * migration; new code should import from here.
 *
 * Principles (audit §01 — Typography reconstruction):
 * - One weight delta is normally enough to express hierarchy.
 * - Never use uppercase merely to make a section "premium".
 * - Prices and financial quantities use tabular figures (see Numeric).
 * - Line-height remains readable when text scaling increases.
 * - Eliminate captionElevated/metaElevated/price/bodyLarge ambiguity after
 *   migration; the roles below are the canonical set.
 *
 * Migration order:
 *   1. This file defines the canonical roles.
 *   2. designTokens.ts `Type` already mirrors these roles as aliases.
 *   3. Flagship routes migrate first; legacy aliases are deleted only after
 *      screenshot parity.
 *
 * Anti-AI rules:
 * - No decorative subtitles or labels that merely name an obvious object.
 * - No duplicate headings.
 * - First viewport normally uses no more than three type sizes and one eyebrow.
 */

import { FontFamily } from './designTokens';

export type TypographyWeight = '400' | '500' | '600' | '700';

export interface TypographyV2Role {
  /** Canonical role name. */
  role: TypographyV2RoleName;
  /** Font size in points. */
  size: number;
  /** Line height in points. */
  lineHeight: number;
  /** Font weight. One weight delta is normally enough for hierarchy. */
  weight: TypographyWeight;
  /** Letter spacing in points. Negative = tighter. */
  letterSpacing: number;
  /** Font family token from FontFamily. */
  fontFamily: string;
  /** When true, text should use tabular figures (prices, financials). */
  tabularFigures?: boolean;
  /** Optional text transform. Avoid uppercase merely for "premium". */
  textTransform?: 'uppercase' | 'none';
}

export type TypographyV2RoleName =
  | 'display'
  | 'screenTitle'
  | 'sectionTitle'
  | 'itemTitle'
  | 'body'
  | 'bodyStrong'
  | 'meta'
  | 'label'
  | 'priceHero'
  | 'priceList'
  | 'numericMeta';

/**
 * The canonical semantic typography set.
 *
 * | Token         | Use                                              |
 * |---------------|--------------------------------------------------|
 * | display       | rare campaign/onboarding statement               |
 * | screenTitle   | screen identity                                  |
 * | sectionTitle  | major section                                    |
 * | itemTitle     | product/person/conversation title                |
 * | body          | content                                          |
 * | bodyStrong    | emphasized body                                  |
 * | meta          | timestamps/attributes                            |
 * | label         | controls/field labels                            |
 * | priceHero     | PDP/checkout total                               |
 * | priceList     | cards/listings                                   |
 * | numericMeta   | bids, quantities, P&L                            |
 */
export const TypographyV2: Record<TypographyV2RoleName, TypographyV2Role> = {
  display: {
    role: 'display',
    size: 32,
    lineHeight: 38,
    weight: '700',
    letterSpacing: -0.5,
    fontFamily: FontFamily.bold,
  },
  screenTitle: {
    role: 'screenTitle',
    size: 24,
    lineHeight: 32,
    weight: '700',
    letterSpacing: -0.6,
    fontFamily: FontFamily.bold,
  },
  sectionTitle: {
    role: 'sectionTitle',
    size: 17,
    lineHeight: 24,
    weight: '600',
    letterSpacing: -0.4,
    fontFamily: FontFamily.semibold,
  },
  itemTitle: {
    role: 'itemTitle',
    size: 18,
    lineHeight: 24,
    weight: '600',
    letterSpacing: -0.3,
    fontFamily: FontFamily.semibold,
  },
  body: {
    role: 'body',
    size: 14,
    lineHeight: 20,
    weight: '400',
    letterSpacing: -0.2,
    fontFamily: FontFamily.regular,
  },
  bodyStrong: {
    role: 'bodyStrong',
    size: 15,
    lineHeight: 21,
    weight: '600',
    letterSpacing: 0,
    fontFamily: FontFamily.semibold,
  },
  meta: {
    role: 'meta',
    size: 11,
    lineHeight: 14,
    weight: '500',
    letterSpacing: 0.15,
    fontFamily: FontFamily.medium,
  },
  label: {
    role: 'label',
    size: 11,
    lineHeight: 14,
    weight: '600',
    letterSpacing: 0.5,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
  },
  priceHero: {
    role: 'priceHero',
    size: 28,
    lineHeight: 32,
    weight: '700',
    letterSpacing: -0.5,
    fontFamily: FontFamily.bold,
    tabularFigures: true,
  },
  priceList: {
    role: 'priceList',
    size: 20,
    lineHeight: 24,
    weight: '700',
    letterSpacing: -0.3,
    fontFamily: FontFamily.bold,
    tabularFigures: true,
  },
  numericMeta: {
    role: 'numericMeta',
    size: 13,
    lineHeight: 18,
    weight: '600',
    letterSpacing: 0,
    fontFamily: FontFamily.semibold,
    tabularFigures: true,
  },
} as const;

/**
 * Roles that must use tabular figures (fontVariant: ['tabular-nums']).
 * Used by lint/codemod rules to enforce numeric typography.
 */
export const TABULAR_FIGURE_ROLES: ReadonlySet<TypographyV2RoleName> = new Set([
  'priceHero',
  'priceList',
  'numericMeta',
]);

/**
 * Roles where uppercase is allowed (labels only).
 * Every other role must use default text transform — no decorative caps.
 */
export const UPPERCASE_ALLOWED_ROLES: ReadonlySet<TypographyV2RoleName> = new Set([
  'label',
]);

/**
 * Converts a TypographyV2Role into a React Native TextStyle object.
 * Use this when you need a concrete style rather than the role metadata.
 */
export function typographyV2Style(role: TypographyV2RoleName): import('react-native').TextStyle {
  const t = TypographyV2[role];
  const style: import('react-native').TextStyle = {
    fontFamily: t.fontFamily,
    fontSize: t.size,
    lineHeight: t.lineHeight,
    fontWeight: t.weight,
    letterSpacing: t.letterSpacing,
  };
  if (t.tabularFigures) {
    style.fontVariant = ['tabular-nums'];
  }
  if (t.textTransform) {
    style.textTransform = t.textTransform;
  }
  return style;
}

/**
 * Migration map from legacy `Type` keys to canonical TypographyV2 roles.
 * Used by the codemod/lint rule to report forbidden old tokens.
 */
export const LEGACY_TO_V2_MAP: Record<string, TypographyV2RoleName> = {
  display: 'display',
  title: 'screenTitle',
  screenTitle: 'screenTitle',
  subtitle: 'sectionTitle',
  sectionTitle: 'sectionTitle',
  itemTitle: 'itemTitle',
  body: 'body',
  bodyEmphasis: 'bodyStrong',
  bodyStrong: 'bodyStrong',
  bodyLarge: 'priceList', // bodyLarge was a price-hero variant; canonical role is priceList
  price: 'priceList',
  priceList: 'priceList',
  priceLarge: 'priceHero',
  priceHero: 'priceHero',
  caption: 'meta',
  captionElevated: 'meta',
  meta: 'meta',
  metaElevated: 'label',
  label: 'label',
  numericMeta: 'numericMeta',
};

/**
 * Legacy `Type` keys that are forbidden in new code after migration.
 * The lint rule flags any import of these from designTokens.
 */
export const FORBIDDEN_LEGACY_TOKENS: readonly string[] = [
  'captionElevated',
  'metaElevated',
  'bodyLarge',
  'bodyEmphasis',
  'price',
  'priceLarge',
  'subtitle',
  'title',
];
