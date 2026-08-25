import { Platform } from 'react-native';
import { DARK_COLORS, LIGHT_COLORS } from '../constants/colors';

/**
 * The visual treatment the header adopts when content scrolls under it.
 * - `solid`: an opaque header background that matches the screen surface.
 * - `translucent`: a blurred material that lets content show through.
 * - `transparent`: no background — content scrolls fully under a bare header.
 */
export type ScrollEdgeEffectStyle = 'solid' | 'translucent' | 'transparent';

/**
 * iOS 26 scroll-edge effect tokens. These describe how the navigation bar
 * adopts the scroll-edge appearance introduced in iOS 26 — the header
 * transitions from transparent to a solid or translucent material as content
 * scrolls beneath it.
 */
export interface Ios26ScrollEdgeTokens {
  /** How the header background behaves at the scroll edge. */
  scrollEdgeEffectStyle: ScrollEdgeEffectStyle;
  /** The color the header adopts when content scrolls under it. */
  scrollEdgeEffectColor: string;
  /** Blur radius (px) for the translucent style. 0 when solid/transparent. */
  scrollEdgeEffectBlurRadius: number;
}

const IOS26_DARK_TOKENS: Ios26ScrollEdgeTokens = {
  scrollEdgeEffectStyle: 'translucent',
  scrollEdgeEffectColor: DARK_COLORS.background,
  scrollEdgeEffectBlurRadius: 24,
};

const IOS26_LIGHT_TOKENS: Ios26ScrollEdgeTokens = {
  scrollEdgeEffectStyle: 'translucent',
  scrollEdgeEffectColor: LIGHT_COLORS.background,
  scrollEdgeEffectBlurRadius: 24,
};

/**
 * Returns the major iOS version when running on iOS, or 0 otherwise.
 * `Platform.Version` is a number on iOS (e.g. 26.0) and a string/number on
 * Android, so we normalize to a truncated integer here.
 */
function getIosMajorVersion(): number {
  if (Platform.OS !== 'ios') return 0;
  const version = Platform.Version as unknown as number;
  return typeof version === 'number' ? Math.floor(version) : 0;
}

/**
 * Checks whether iOS 26 scroll-edge effect tokens are available on the
 * current platform. The scroll-edge effect is iOS 26+.
 */
export function isIos26ScrollEdgeAvailable(): boolean {
  return Platform.OS === 'ios' && getIosMajorVersion() >= 26;
}

/**
 * Returns the iOS 26 scroll-edge effect token set for the given theme mode.
 *
 * On iOS 26+ the full scroll-edge set is returned. On any other platform a
 * solid, non-blurred fallback is returned so consumers can call this
 * unconditionally and still receive a valid token set.
 */
export function getIos26ScrollEdgeTokens(mode: 'dark' | 'light' = 'dark'): Ios26ScrollEdgeTokens {
  if (isIos26ScrollEdgeAvailable()) {
    return mode === 'light' ? IOS26_LIGHT_TOKENS : IOS26_DARK_TOKENS;
  }
  const base = mode === 'light' ? LIGHT_COLORS : DARK_COLORS;
  return {
    scrollEdgeEffectStyle: 'solid',
    scrollEdgeEffectColor: base.header,
    scrollEdgeEffectBlurRadius: 0,
  };
}
