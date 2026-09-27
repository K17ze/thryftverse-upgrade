/**
 * ThryftVerse Web Design Tokens — 1:1 port of the mobile app's
 * `frontend/src/constants/colors.ts` + `frontend/src/theme/designTokens.ts`.
 *
 * The CSS custom properties in `globals.css` are generated from these values;
 * keep them in sync. Dark is the flagship theme.
 */

export const DARK_COLORS = {
  background: '#0A0A0A',
  surface: '#141414',
  surfaceAlt: '#1C1C1C',
  surfaceRaised: '#1F1F1F',
  surfaceElevated: '#242424',
  brand: '#F4F0E8',
  brandPressed: '#D8D0C3',
  brandSubtle: 'rgba(244,240,232,0.08)',
  textPrimary: '#FFFFFF',
  textSecondary: '#A3A3A3',
  textMuted: '#888888',
  textInverse: '#000000',
  border: '#262626',
  borderSubtle: '#1E1E1E',
  danger: '#9b0202',
  dangerSubtle: 'rgba(155,2,2,0.10)',
  dangerText: '#EF6461',
  success: '#215634',
  successSubtle: 'rgba(33,86,52,0.10)',
  successText: '#4BB377',
  warning: '#D49454',
  warningSubtle: 'rgba(212,148,84,0.12)',
  warningText: '#D49454',
  ratingStar: '#D49454',
  brandBorder: 'rgba(244,240,232,0.20)',
  warningBorder: 'rgba(212,148,84,0.25)',
  dangerBorder: 'rgba(155,2,2,0.20)',
  successBorder: 'rgba(33,86,52,0.20)',
  commerceTrustBorder: 'rgba(74,122,196,0.20)',
  coownUp: '#8ED1A7',
  coownDown: '#FF9B9B',
  coownUpSubtle: 'rgba(142,209,167,0.16)',
  coownDownSubtle: 'rgba(255,155,155,0.16)',
  social: '#9A6B7A',
  discovery: '#B85566',
  commerceTrust: '#4A7AC4',
  commerceTrustSubtle: 'rgba(74,122,196,0.10)',
  discoverySubtle: 'rgba(184,85,102,0.12)',
  antiqueGold: '#C9A46A',
  scrimTextPrimary: '#FFFFFF',
  scrimTextSecondary: 'rgba(255,255,255,0.88)',
  scrimTextTertiary: 'rgba(255,255,255,0.40)',
  mediaOverlayText: '#FFFFFF',
  mediaOverlayTextMuted: 'rgba(255,255,255,0.7)',
  mediaOverlayScrim: 'rgba(0,0,0,0.6)',
  overlay: 'rgba(0,0,0,0.66)',
  input: '#1A1A1A',
  inputText: '#FFFFFF',
  row: '#141414',
  rowPressed: '#1A1A1A',
  header: '#0A0A0A',
  shadow: '#000000',
} as const;

export const LIGHT_COLORS = {
  background: '#FFFFFF',
  surface: '#F5F5F5',
  surfaceAlt: '#EFEFEF',
  surfaceRaised: '#F8F8F8',
  surfaceElevated: '#FFFFFF',
  brand: '#111111',
  brandPressed: '#333333',
  brandSubtle: 'rgba(17,17,17,0.06)',
  textPrimary: '#000000',
  textSecondary: '#666666',
  textMuted: '#6C6C6C',
  textInverse: '#FFFFFF',
  border: '#E5E5E5',
  borderSubtle: '#F0F0F0',
  danger: '#9b0202',
  dangerSubtle: 'rgba(155,2,2,0.08)',
  dangerText: '#9b0202',
  success: '#215634',
  successSubtle: 'rgba(33,86,52,0.08)',
  successText: '#215634',
  warning: '#C47A2E',
  warningSubtle: 'rgba(196,122,46,0.10)',
  warningText: '#8F5A10',
  ratingStar: '#C47A2E',
  brandBorder: 'rgba(17,17,17,0.16)',
  warningBorder: 'rgba(196,122,46,0.20)',
  dangerBorder: 'rgba(155,2,2,0.16)',
  successBorder: 'rgba(33,86,52,0.16)',
  commerceTrustBorder: 'rgba(6,72,154,0.16)',
  coownUp: '#1C5631',
  coownDown: '#5F1616',
  coownUpSubtle: 'rgba(28,86,49,0.10)',
  coownDownSubtle: 'rgba(95,22,22,0.10)',
  social: '#6B3245',
  discovery: '#7B0E1E',
  commerceTrust: '#06489A',
  commerceTrustSubtle: 'rgba(6,72,154,0.08)',
  discoverySubtle: 'rgba(123,14,30,0.10)',
  antiqueGold: '#C9A46A',
  scrimTextPrimary: '#FFFFFF',
  scrimTextSecondary: 'rgba(255,255,255,0.88)',
  scrimTextTertiary: 'rgba(255,255,255,0.40)',
  mediaOverlayText: '#FFFFFF',
  mediaOverlayTextMuted: 'rgba(255,255,255,0.7)',
  mediaOverlayScrim: 'rgba(0,0,0,0.6)',
  overlay: 'rgba(0,0,0,0.44)',
  input: '#FFFFFF',
  inputText: '#000000',
  row: '#F5F5F5',
  rowPressed: '#EBEBEB',
  header: '#FFFFFF',
  shadow: '#000000',
} as const;

/** Spacing scale — 4px base grid (Space in designTokens.ts). */
export const Space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  smMd: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** Border radius grammar — Radius in designTokens.ts. */
export const Radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  chat: 20,
  xxl: 24,
  sheet: 20,
  rail: 18,
  full: 999,
} as const;

/** Editorial type scale — TypographyV2/Type in designTokens.ts.
 *  [fontSize px, lineHeight px, weight, letterSpacing px] */
export const Type = {
  display: { size: 32, lineHeight: 38, weight: 700, letterSpacing: -0.5 },
  hero: { size: 28, lineHeight: 34, weight: 700, letterSpacing: -0.5 },
  screenTitle: { size: 24, lineHeight: 32, weight: 700, letterSpacing: -0.6 },
  sectionTitle: { size: 17, lineHeight: 24, weight: 600, letterSpacing: -0.4 },
  itemTitle: { size: 18, lineHeight: 24, weight: 600, letterSpacing: -0.3 },
  body: { size: 14, lineHeight: 20, weight: 400, letterSpacing: -0.2 },
  bodyEmphasis: { size: 15, lineHeight: 21, weight: 600, letterSpacing: 0 },
  priceList: { size: 20, lineHeight: 24, weight: 700, letterSpacing: -0.3 },
  priceHero: { size: 28, lineHeight: 32, weight: 700, letterSpacing: -0.5 },
  caption: { size: 12, lineHeight: 16, weight: 400, letterSpacing: 0.1 },
  captionElevated: { size: 13, lineHeight: 18, weight: 500, letterSpacing: 0 },
  meta: { size: 11, lineHeight: 14, weight: 500, letterSpacing: 0.15 },
  label: { size: 11, lineHeight: 14, weight: 600, letterSpacing: 0.5 },
  numericMeta: { size: 13, lineHeight: 18, weight: 600, letterSpacing: 0 },
} as const;

/** Elevation — Elevation in designTokens.ts (as CSS box-shadows). */
export const Elevation = {
  none: 'none',
  subtle: '0 1px 6px rgba(0,0,0,0.04)',
  card: '0 2px 10px rgba(0,0,0,0.06)',
  floating: '0 4px 14px rgba(0,0,0,0.10)',
  modal: '0 8px 22px rgba(0,0,0,0.16)',
} as const;

/** Stroke grammar — Stroke in designTokens.ts. */
export const Stroke = {
  hairline: 0.5,
  standard: 1,
  emphasis: 2,
} as const;

/** Control geometry — Control in designTokens.ts. */
export const Control = {
  hit: 44,
  chromeCompact: 32,
  chrome: 36,
  icon: 22,
  iconCompact: 18,
} as const;

/** Icon grammar — IconGrammar in designTokens.ts. */
export const IconGrammar = {
  standard: 22,
  metadata: 16,
  badge: 12,
  hero: 28,
} as const;

/** Avatar sizes — AvatarSize in designTokens.ts. */
export const AvatarSize = {
  inline: 24,
  sm: 32,
  md: 40,
  lg: 56,
  edit: 76,
  identity: 84,
  hero: 88,
  xl: 104,
} as const;

/** Motion presets — duration/easing pairs matching motionTokens.ts intent. */
export const Motion = {
  duration: {
    instant: 80,
    fast: 150,
    normal: 220,
    slow: 320,
    slower: 480,
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
    decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
  },
  /** Press feedback scale — charter range 0.97–0.985. */
  pressScale: 0.975,
} as const;

export const ZIndex = {
  base: 0,
  elevated: 10,
  sticky: 100,
  dropdown: 200,
  modal: 300,
  toast: 400,
  overlay: 500,
} as const;
