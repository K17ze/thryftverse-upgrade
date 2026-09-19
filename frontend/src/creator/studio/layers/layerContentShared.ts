import { StyleSheet } from 'react-native';
import { Space, Radius, Stroke, FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { ThemeColors } from '../../../theme/ThemeContext';

// ── Video player ref contract ──────────────────────────────────────
// The canvas populates this ref with the active expo-video player
// instance so the parent (timeline / PlaybackClock adapter) can issue
// imperative play / pause / seek / rate commands. We model only the
// surface actually consumed downstream — not the full expo-video class —
// so a typo in a method name is a compile error, not a silent no-op.
export interface VideoPlayerRef {
  play(): void;
  pause(): void;
  seekBy(seconds: number): void;
  replay(): void;
  currentTime: number;
  duration: number;
  muted: boolean;
  loop: boolean;
  volume: number;
  playbackRate: number;
  playing: boolean;
  status: string;
}

export const mediaStyles = StyleSheet.create({
  videoBadge: {
    position: 'absolute',
    top: Space.xs,
    left: Space.xs,
    borderRadius: Radius.sm,
    paddingHorizontal: Space.xs,
    paddingVertical: 2 } });

export function createOverlayStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlayPill: {
      backgroundColor: colors.surface,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    overlayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    overlayLabel: {
      color: colors.textPrimary,
      fontFamily: TypographyV2.meta.fontFamily,
      fontSize: TypographyV2.meta.size,
    },
    overlayBody: {
      color: colors.textPrimary,
      fontFamily: TypographyV2.body.fontFamily,
      fontSize: TypographyV2.body.size,
    },
    overlayBodySemibold: {
      color: colors.textPrimary,
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.body.size,
    },
    overlayAccent: {
      color: colors.brand,
      fontFamily: TypographyV2.meta.fontFamily,
      fontSize: TypographyV2.body.size,
    },
    overlayMuted: {
      color: colors.textMuted,
    },
    overlayOption: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      alignItems: 'center',
      minWidth: 60,
      flex: 1,
      maxWidth: '48%',
    },
    overlayOptionCorrect: {
      backgroundColor: colors.successSubtle,
      borderColor: colors.successBorder,
    },
    overlayOptionText: {
      color: colors.textPrimary,
      fontFamily: TypographyV2.body.fontFamily,
      fontSize: TypographyV2.caption.size,
      flex: 1,
    },
    overlayOptionTextCorrect: {
      color: colors.successText,
      fontFamily: TypographyV2.meta.fontFamily,
    },
    overlayCorrectBadge: {
      width: 18,
      height: 18,
      borderRadius: Radius.full,
      backgroundColor: colors.success,
      justifyContent: 'center',
      alignItems: 'center',
    },
    overlayTimerBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    overlayInputAffordance: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm,
    },
    overlaySendHint: {
      width: 18,
      height: 18,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    overlayTrack: {
      flex: 1,
      height: 6,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
    },
    overlayThumb: {
      width: 14,
      height: 14,
      borderRadius: Radius.full,
      backgroundColor: colors.textPrimary,
      borderWidth: 2,
      position: 'absolute',
      left: '50%',
      marginLeft: -7,
    },
  });
}
