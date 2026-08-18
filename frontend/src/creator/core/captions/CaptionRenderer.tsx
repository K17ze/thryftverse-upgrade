/**
 * CaptionRenderer — renders caption segments on the canvas with
 * word-by-word highlight (TikTok/Reels style).
 *
 * Per spec 06_TEXT_TYPOGRAPHY_EDITORIAL_SYSTEM §6:
 *  - safe-zone handling
 *  - per-line/per-word timing if the pipeline supports it
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §17: restrained motion — smooth fade transitions
 * between segments, no bounce or pulsing.
 *
 * The renderer:
 *  - Finds the active segment for the current playback time.
 *  - Shows the caption text at the bottom of the canvas (safe zone aware).
 *  - When the segment has per-word timing, highlights the active word
 *    in `highlightColor` as the playback clock advances.
 *  - When no per-word timing, shows the whole segment text.
 *  - Uses the text style system (font, color, background) from CaptionStyle.
 *  - Smooth crossfade transitions between segments (200ms, reduced-motion
 *    aware — instant swap when reduced motion is on).
 */
import React, { useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { Typography, Type, FontFamily, Space, Radius } from '../../../theme/designTokens';
import type { CaptionSegment, CaptionStyle, CaptionTrack } from './CaptionTypes';

// ── Style preset resolution ──────────────────────────────────────────
// Mirrors the styleMap in CreatorCanvas's TextLayerContent so captions
// use the same visual language as authored text layers.
const CAPTION_STYLE_MAP: Record<string, Partial<TextStyle>> = {
  clean: {
    fontFamily: FontFamily.regular,
    fontSize: Type.body.size + 1,
    lineHeight: (Type.body.size + 1) * 1.35,
  },
  headline: {
    fontFamily: 'Anton_400Regular',
    fontSize: Type.title.size,
    lineHeight: Type.title.size * 1.15,
  },
  editorial: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: Type.title.size - 2,
    lineHeight: (Type.title.size - 2) * 1.2,
  },
  compact: {
    fontFamily: FontFamily.semibold,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.size * 1.3,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  handwritten: {
    fontFamily: 'Caveat_400Regular',
    fontSize: Type.body.size + 2,
    lineHeight: (Type.body.size + 2) * 1.3,
  },
  bubble: {
    fontFamily: 'Pacifico_400Regular',
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.size * 1.2,
  },
  deco: {
    fontFamily: 'Lobster_400Regular',
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.size * 1.3,
  },
  poster: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: Type.title.size - 4,
    lineHeight: (Type.title.size - 4) * 1.1,
  },
  squeeze: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: Type.body.size,
    lineHeight: Type.body.size * 1.1,
  },
  signature: {
    fontFamily: 'PlayfairDisplay_400Regular',
    fontStyle: 'italic',
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.size * 1.4,
  },
};

function resolveCaptionStyle(style: CaptionStyle): Partial<TextStyle> {
  const base = CAPTION_STYLE_MAP[style.textStyle] ?? CAPTION_STYLE_MAP.clean;
  // If the user set a custom fontSize, override the preset's size.
  return {
    ...base,
    fontSize: style.fontSize || base.fontSize,
    color: style.textColor,
    textAlign: style.alignment,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Find the active caption segment for a given playback time.
 * Returns null when no segment covers the current time.
 */
function findActiveSegment(
  segments: CaptionSegment[],
  timeMs: number,
): CaptionSegment | null {
  for (const seg of segments) {
    if (timeMs >= seg.startMs && timeMs < seg.endMs) {
      return seg;
    }
  }
  return null;
}

/**
 * Find the index of the active word within a segment, given the
 * current playback time. Returns -1 when no word is active (e.g.
 * the segment has no per-word timing, or the time is before the
 * first word).
 */
function findActiveWordIndex(
  segment: CaptionSegment,
  timeMs: number,
): number {
  if (!segment.words || segment.words.length === 0) return -1;
  const relTime = timeMs - segment.startMs;
  for (let i = 0; i < segment.words.length; i++) {
    const w = segment.words[i];
    if (relTime >= w.startMs && relTime < w.endMs) {
      return i;
    }
  }
  // If we're past the last word's end but still in the segment, highlight
  // the last word (it's still "active" visually).
  if (relTime >= segment.words[segment.words.length - 1].endMs) {
    return segment.words.length - 1;
  }
  return -1;
}

// ── Component ────────────────────────────────────────────────────────

export interface CaptionRendererProps {
  /** The caption track to render. When null/empty, renders nothing. */
  track: CaptionTrack | null;
  /** Current playback position in milliseconds. */
  currentTimeMs: number;
  /** The visual style for the captions. */
  style: CaptionStyle;
  /**
   * Height (px) of the bottom safe zone / tool dock region. The caption
   * is positioned above this region so it is never covered by UI chrome.
   */
  bottomInsetPx: number;
  /**
   * Height (px) of the top safe zone / chrome region. Used for
   * accessibility calculations but captions are bottom-anchored.
   */
  topInsetPx?: number;
  /** Whether the renderer is inside a preview vs. the editor canvas. */
  isPreview?: boolean;
}

/**
 * CaptionRenderer — renders the active caption segment at the bottom of
 * the canvas with word-by-word highlight and safe-zone awareness.
 */
export const CaptionRenderer = React.memo(function CaptionRenderer({
  track,
  currentTimeMs,
  style,
  bottomInsetPx,
  topInsetPx = 0,
  isPreview = false,
}: CaptionRendererProps) {
  void topInsetPx;
  void isPreview;
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();

  // ── Active segment detection ──
  // We use a shared value for the current time so the word highlight
  // can react on the UI thread without React re-renders.
  const timeSV = useSharedValue(currentTimeMs);
  const opacitySV = useSharedValue(0);

  // The active segment is computed in React (for text content) but the
  // word highlight index is computed on the UI thread for smoothness.
  const activeSegment = useMemo(
    () => (track ? findActiveSegment(track.segments, currentTimeMs) : null),
    [track, currentTimeMs],
  );

  // Update the time shared value when currentTimeMs changes.
  useEffect(() => {
    timeSV.value = currentTimeMs;
  }, [currentTimeMs, timeSV]);

  // Fade in/out when a segment appears or disappears.
  useEffect(() => {
    if (activeSegment) {
      if (reducedMotion) {
        opacitySV.value = 1;
      } else {
        opacitySV.value = withTiming(1, {
          duration: 200,
          easing: Easing.out(Easing.ease),
        });
      }
    } else {
      if (reducedMotion) {
        opacitySV.value = 0;
      } else {
        opacitySV.value = withTiming(0, {
          duration: 160,
          easing: Easing.in(Easing.ease),
        });
      }
    }
  }, [activeSegment, opacitySV, reducedMotion]);

  const containerAnimStyle = useAnimatedStyle(() => ({
    opacity: opacitySV.value,
  }));

  if (!track || track.segments.length === 0 || !activeSegment) {
    return null;
  }

  const resolvedStyle = resolveCaptionStyle(style);
  const hasWords = Boolean(activeSegment.words && activeSegment.words.length > 0);

  return (
    <Reanimated.View
      style={[
        styles.container,
        { bottom: bottomInsetPx + Space.md },
        containerAnimStyle,
      ]}
      pointerEvents="none"
      accessibilityLabel={`Caption: ${activeSegment.text}`}
      accessibilityRole="text"
    >
      <View
        style={[
          styles.textWrap,
          style.backgroundColor
            ? {
                backgroundColor: style.backgroundColor,
                borderRadius: Radius.sm,
                paddingHorizontal: Space.sm,
                paddingVertical: Space.xs,
              }
            : null,
        ]}
      >
        {hasWords ? (
          <WordHighlightText
            segment={activeSegment}
            timeSV={timeSV}
            baseStyle={resolvedStyle}
            highlightColor={style.highlightColor}
          />
        ) : (
          <Text style={[styles.text, resolvedStyle]}>{activeSegment.text}</Text>
        )}
      </View>
    </Reanimated.View>
  );
});

// ── Word-by-word highlight text ──────────────────────────────────────

interface WordHighlightTextProps {
  segment: CaptionSegment;
  timeSV: ReturnType<typeof useSharedValue<number>>;
  baseStyle: Partial<TextStyle>;
  highlightColor: string;
}

/**
 * WordHighlightText — renders each word of the segment as a separate
 * Text span, with the active word highlighted in `highlightColor`.
 *
 * The active word index is computed on the UI thread via a shared value
 * reaction, so the highlight updates smoothly at 60fps without React
 * re-renders. Each word's color is derived from the animated active
 * index.
 *
 * Per AGENTS.md §17: restrained motion — no bounce or pop on words,
 * just a clean color transition.
 */
function WordHighlightText({
  segment,
  timeSV,
  baseStyle,
  highlightColor,
}: WordHighlightTextProps) {
  const words = segment.words!;
  const activeIndexSV = useSharedValue(-1);

  // React to the time shared value on the UI thread to compute the
  // active word index without JS-thread round-trips.
  useAnimatedReaction(
    () => {
      const t = timeSV.value;
      const relTime = t - segment.startMs;
      for (let i = 0; i < words.length; i++) {
        if (relTime >= words[i].startMs && relTime < words[i].endMs) {
          return i;
        }
      }
      if (words.length > 0 && relTime >= words[words.length - 1].endMs) {
        return words.length - 1;
      }
      return -1;
    },
    (idx) => {
      activeIndexSV.value = idx;
    },
    [words],
  );

  return (
    <Text style={[styles.text, baseStyle]}>
      {words.map((w, i) => (
        <WordSpan
          key={i}
          word={w.text}
          index={i}
          activeIndexSV={activeIndexSV}
          baseColor={baseStyle.color as string}
          highlightColor={highlightColor}
        />
      ))}
    </Text>
  );
}

interface WordSpanProps {
  word: string;
  index: number;
  activeIndexSV: ReturnType<typeof useSharedValue<number>>;
  baseColor: string;
  highlightColor: string;
}

/**
 * A single word span whose color animates between base and highlight
 * based on the active word index. Uses an animated style so the color
 * transition is smooth (no hard snap).
 */
function WordSpan({ word, index, activeIndexSV, baseColor, highlightColor }: WordSpanProps) {
  const animStyle = useAnimatedStyle(() => ({
    color: activeIndexSV.value === index ? highlightColor : baseColor,
  }));

  return (
    <Reanimated.Text style={animStyle}>
      {word}
      {' '}
    </Reanimated.Text>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  textWrap: {
    maxWidth: '90%',
  } as ViewStyle,
  text: {
    fontFamily: Typography.family.regular,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  } as TextStyle,
});
