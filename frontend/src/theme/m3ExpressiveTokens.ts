import { Platform } from 'react-native';
import { Radius, Space } from './designTokens';

/**
 * Material 3 Expressive color roles — extended set introduced in Android 16
 * (API 36). These mirror the M3 color role taxonomy with the Expressive
 * palette's warmer, more saturated primary/tertiary pair.
 */
export interface M3ExpressiveColorRoles {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
}

/**
 * Expressive motion tokens — spring configs for the three emphasized motion
 * curves introduced in M3 Expressive. Each is tuned for a distinct phase of
 * an expressive transition.
 */
export interface M3ExpressiveMotionTokens {
  /** Standard emphasized — the default expressive curve for most transitions. */
  emphasizedStandard: { damping: number; stiffness: number; mass: number };
  /** Emphasized accelerate — for elements leaving (exits, collapses). */
  emphasizedAccelerate: { damping: number; stiffness: number; mass: number };
  /** Emphasized decelerate — for elements arriving (entries, expansions). */
  emphasizedDecelerate: { damping: number; stiffness: number; mass: number };
}

/**
 * Expressive shape tokens — extra-large corner radii for sheets, dialogs, and
 * dominant panels in the M3 Expressive shape system.
 */
export interface M3ExpressiveShapeTokens {
  /** Extra-large radius for full-screen sheets and dialogs. */
  extraLarge: number;
  /** Extra-extra-large radius for the most dominant panels. */
  extraExtraLarge: number;
  /** Top-corner radius for bottom sheets that rise from the screen edge. */
  sheetTop: number;
}

/**
 * The complete M3 Expressive token set — color roles, motion, and shape.
 */
export interface M3ExpressiveTokens {
  colors: M3ExpressiveColorRoles;
  motion: M3ExpressiveMotionTokens;
  shape: M3ExpressiveShapeTokens;
}

const M3_EXPRESSIVE_COLORS: M3ExpressiveColorRoles = {
  primary: '#4A6A3E',
  onPrimary: '#FFFFFF',
  primaryContainer: '#CCF0B0',
  onPrimaryContainer: '#0A2001',
  secondary: '#9CC1A0',
  onSecondary: '#07210B',
  secondaryContainer: '#1E3A20',
  onSecondaryContainer: '#B7E9B8',
  tertiary: '#7AA4B8',
  onTertiary: '#001E2A',
  tertiaryContainer: '#1A3340',
  onTertiaryContainer: '#B4D6EC',
  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
  surface: '#1A1C18',
  onSurface: '#E3E3DC',
  surfaceVariant: '#424840',
  onSurfaceVariant: '#C2C8BB',
  outline: '#8C9386',
  outlineVariant: '#424840',
};

const M3_EXPRESSIVE_MOTION: M3ExpressiveMotionTokens = {
  emphasizedStandard: { damping: 20, stiffness: 200, mass: 1.0 },
  emphasizedAccelerate: { damping: 16, stiffness: 260, mass: 0.9 },
  emphasizedDecelerate: { damping: 24, stiffness: 180, mass: 1.0 },
};

const M3_EXPRESSIVE_SHAPE: M3ExpressiveShapeTokens = {
  extraLarge: 28,
  extraExtraLarge: 38,
  sheetTop: 32,
};

const M3_EXPRESSIVE_TOKENS: M3ExpressiveTokens = {
  colors: M3_EXPRESSIVE_COLORS,
  motion: M3_EXPRESSIVE_MOTION,
  shape: M3_EXPRESSIVE_SHAPE,
};

/**
 * Returns the Android API level when running on Android, or 0 otherwise.
 * Uses the native module constant exposed by React Native on Android.
 */
function getAndroidApiLevel(): number {
  if (Platform.OS !== 'android') return 0;
  const version = (Platform.Version as unknown as number) ?? 0;
  return typeof version === 'number' ? version : 0;
}

/**
 * Checks whether M3 Expressive tokens are available on the current platform.
 * M3 Expressive is Android 16+ (API level 36).
 */
export function isM3ExpressiveAvailable(): boolean {
  return Platform.OS === 'android' && getAndroidApiLevel() >= 36;
}

/**
 * Returns the M3 Expressive token set (colors, motion, shape).
 *
 * On Android 16+ (API 36) the full Expressive set is returned. On any other
 * platform a baseline fallback derived from the existing design tokens is
 * returned so consumers can call this unconditionally and still receive a
 * valid, usable token set.
 */
export function getM3ExpressiveTokens(): M3ExpressiveTokens {
  if (isM3ExpressiveAvailable()) {
    return M3_EXPRESSIVE_TOKENS;
  }
  return {
    colors: M3_EXPRESSIVE_COLORS,
    motion: M3_EXPRESSIVE_MOTION,
    shape: {
      extraLarge: Radius.xxl,
      extraExtraLarge: Radius.xxl + Space.xs,
      sheetTop: Radius.xxl,
    },
  };
}
