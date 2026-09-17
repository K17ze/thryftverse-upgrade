import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  withSpring,
  Easing } from 'react-native-reanimated';
import { Space, Radius, FontFamily, FontFamilySerif } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { Motion } from '../../../theme/motionTokens';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { toRgbaString } from '../../color/ColorMath';

// ── Creator text-style font families ───────────────────────────────
// Single source of truth for the 10 display fonts used by the creator
// text layer. Inter and Playfair Display come from the design-token
// FontFamily / FontFamilySerif objects; Anton, Caveat and Bebas Neue are
// creator-only display faces loaded globally in App.tsx. Centralising
// them here means a typo (e.g. 'Anton_400Reglar') is a compile error
// against a `const` reference, not a silent platform fallback.
const CreatorTextFont = {
  anton: 'Anton_400Regular',
  bebasNeue: 'BebasNeue_400Regular',
  caveat: 'Caveat_400Regular',
  interRegular: FontFamily.regular,
  interSemibold: FontFamily.semibold,
  playfairBold: FontFamilySerif.bold,
  playfairRegular: FontFamilySerif.regular,
} as const;

export function TextLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'text' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();

  // Text entrance animation: typewriter, bounce, fade, slide
  const animProgress = useSharedValue(0);
  const animOpacity = useSharedValue(0);
  const animTranslateY = useSharedValue(0);
  const [typewriterText, setTypewriterText] = useState(payload.text);

  useEffect(() => {
    const animation = payload.textAnimation ?? 'none';
    animProgress.value = 0;
    animOpacity.value = 0;
    animTranslateY.value = 0;
    if (animation === 'none' || reducedMotion) {
      // Show text immediately with no animation when Reduce Motion is on
      animOpacity.value = 1;
      animProgress.value = 1;
      animTranslateY.value = 0;
      setTypewriterText(payload.text);
      return;
    }
    if (animation === 'fade') {
      animOpacity.value = withTiming(1, { duration: Motion.duration.crawl, easing: Motion.easing.entrance });
      setTypewriterText(payload.text);
    } else if (animation === 'slide') {
      animTranslateY.value = 24;
      animOpacity.value = 0;
      animOpacity.value = withTiming(1, { duration: Motion.duration.slower, easing: Motion.easing.entrance });
      animTranslateY.value = withTiming(0, { duration: Motion.duration.slower, easing: Motion.easing.entrance });
      setTypewriterText(payload.text);
    } else if (animation === 'bounce') {
      animOpacity.value = 1;
      animTranslateY.value = -16;
      animTranslateY.value = withSpring(0, spring.success);
      setTypewriterText(payload.text);
    } else if (animation === 'typewriter') {
      animOpacity.value = 1;
      setTypewriterText('');
      animProgress.value = withTiming(1, { duration: Math.max(800, (payload.text?.length ?? 0) * 60), easing: Easing.linear });
    }
  }, [payload.textAnimation, payload.text, animProgress, animOpacity, animTranslateY, reducedMotion, spring]);

  // Typewriter: react to progress shared value and update visible substring on JS thread
  useAnimatedReaction(
    () => animProgress.value,
    (progress) => {
      const full = payload.text ?? '';
      runOnJS(setTypewriterText)(full.substring(0, Math.ceil(progress * full.length)));
    },
    [payload.text],
  );

  const animStyle = useAnimatedStyle(() => ({
    opacity: animOpacity.value,
    transform: [{ translateY: animTranslateY.value }] }));

  // Per-style typography — real visual distinction, not just font size
  type TextStyleId = 'headline' | 'editorial' | 'clean' | 'compact' | 'handwritten' | 'bubble' | 'deco' | 'poster' | 'squeeze' | 'signature';
  const styleMap: Record<TextStyleId, TextStyle> = {
    headline: {
      // Anton — display/impact for cover statements
      fontFamily: CreatorTextFont.anton,
      fontSize: TypographyV2.screenTitle.size + 4,
      lineHeight: (TypographyV2.screenTitle.size + 4) * 1.15,
      textShadowColor: colors.mediaOverlayScrim,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4 },
    editorial: {
      // Playfair Display Bold — editorial serif for issue/collection titles
      fontFamily: CreatorTextFont.playfairBold,
      fontSize: TypographyV2.screenTitle.size + 1,
      lineHeight: (TypographyV2.screenTitle.size + 1) * 1.2,
      textShadowColor: colors.mediaOverlayScrim,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3 },
    clean: {
      // Inter Regular — clean modern sans (lighter weight)
      fontFamily: CreatorTextFont.interRegular,
      fontSize: TypographyV2.body.size + 1,
      lineHeight: (TypographyV2.body.size + 1) * 1.35,
      textShadowColor: colors.mediaOverlayScrim,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2 },
    compact: {
      // Inter SemiBold — uppercase labels (kept as-is)
      fontFamily: CreatorTextFont.interSemibold,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.size * 1.3,
      letterSpacing: 0.8,
      textTransform: 'uppercase' },
    handwritten: {
      // Caveat — genuine handwriting font
      fontFamily: CreatorTextFont.caveat,
      fontSize: TypographyV2.body.size + 2,
      lineHeight: (TypographyV2.body.size + 2) * 1.3 },
    bubble: {
      // Playfair Display Regular — editorial serif for a restrained,
      // non-template feel (replaces round script Pacifico)
      fontFamily: CreatorTextFont.playfairRegular,
      fontSize: TypographyV2.bodyStrong.size + 6,
      lineHeight: (TypographyV2.bodyStrong.size + 6) * 1.2,
      letterSpacing: 0.5 },
    deco: {
      // Anton — strong display (replaces retro Lobster for a more
      // cohesive, less template-like feel)
      fontFamily: CreatorTextFont.anton,
      fontSize: TypographyV2.bodyStrong.size + 2,
      lineHeight: (TypographyV2.bodyStrong.size + 2) * 1.3,
      letterSpacing: 1.5 },
    poster: {
      // Bebas Neue — condensed display for poster titles
      fontFamily: CreatorTextFont.bebasNeue,
      fontSize: TypographyV2.screenTitle.size - 2,
      lineHeight: (TypographyV2.screenTitle.size - 2) * 1.1,
      letterSpacing: -0.5 },
    squeeze: {
      // Bebas Neue — condensed display (tighter feel)
      fontFamily: CreatorTextFont.bebasNeue,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.size * 1.1,
      letterSpacing: -0.3 },
    signature: {
      // Playfair Display Regular italic — refined serif signature
      // (replaces generic Dancing Script for a more editorial feel)
      fontFamily: CreatorTextFont.playfairRegular,
      fontStyle: 'italic',
      fontSize: TypographyV2.bodyStrong.size + 2,
      lineHeight: (TypographyV2.bodyStrong.size + 2) * 1.4 } };

  // Text effect styles — prefer the canonical structured fields (fill /
  // stroke / shadow / background) and fall back to the legacy
  // textColor / backgroundColor / textEffect mirrors so older documents
  // still render.
  const textColor = payload.fill ? toRgbaString(payload.fill) : payload.textColor;

  const effectStyle: TextStyle = {};
  if (payload.shadow) {
    effectStyle.textShadowColor = toRgbaString(payload.shadow.color);
    effectStyle.textShadowOffset = { width: payload.shadow.offsetX, height: payload.shadow.offsetY };
    effectStyle.textShadowRadius = payload.shadow.blur;
  } else if (payload.textEffect === 'shadow') {
    effectStyle.textShadowColor = colors.mediaOverlayScrim;
    effectStyle.textShadowOffset = { width: 2, height: 2 };
    effectStyle.textShadowRadius = 4;
  } else if (payload.textEffect === 'neon') {
    effectStyle.textShadowColor = payload.textColor;
    effectStyle.textShadowOffset = { width: 0, height: 0 };
    effectStyle.textShadowRadius = 8;
  } else if (payload.textEffect === 'glow') {
    effectStyle.textShadowColor = payload.textColor;
    effectStyle.textShadowOffset = { width: 0, height: 0 };
    effectStyle.textShadowRadius = 12;
  }

  // Stroke: RN has no text stroke — approximate with 8-directional shadow
  // copies behind the fill text (same technique as TextEditorSheet's
  // preview and the export renderer's paint-order stroke).
  const strokeWidth = payload.stroke?.width ?? 0;
  const strokeOffsets = useMemo(() => {
    if (!payload.stroke || strokeWidth <= 0) return null;
    const w = strokeWidth;
    return [
      { width: -w, height: 0 }, { width: w, height: 0 },
      { width: 0, height: -w }, { width: 0, height: w },
      { width: -w, height: -w }, { width: w, height: -w },
      { width: -w, height: w }, { width: w, height: w },
    ];
  }, [payload.stroke, strokeWidth]);
  const legacyOutline =
    !payload.stroke && (payload.textEffect === 'outline' || payload.textEffect === 'glow')
      ? { color: 'transparent' as const, textShadowColor: colors.textPrimary, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 1 }
      : null;

  const textBase: TextStyle[] = [
    textStyles.text,
    { color: textColor },
    styleMap[payload.textStyle] ?? styleMap.clean,
    payload.alignment ? { textAlign: payload.alignment } : null,
  ].filter(Boolean) as TextStyle[];

  const textBody = strokeOffsets ? (
    <View>
      {strokeOffsets.map((offset, i) => (
        <Text
          key={`stroke-${i}`}
          style={[
            ...textBase,
            {
              position: 'absolute',
              color: 'transparent',
              textShadowColor: toRgbaString(payload.stroke!.color),
              textShadowOffset: offset,
              textShadowRadius: 0,
            },
          ]}
        >
          {typewriterText}
        </Text>
      ))}
      <Text style={[...textBase, effectStyle]}>
        {typewriterText}
      </Text>
    </View>
  ) : (
    <Text style={[...textBase, effectStyle, legacyOutline]}>
      {typewriterText}
    </Text>
  );

  return (
    <View
      style={[
        textStyles.container,
        payload.background
          ? {
              backgroundColor: toRgbaString(payload.background.color),
              borderRadius: payload.background.radius,
              paddingHorizontal: payload.background.paddingX,
              paddingVertical: payload.background.paddingY }
          : payload.backgroundColor
            ? { backgroundColor: payload.backgroundColor }
            : null,
        payload.alignment === 'left' && { alignItems: 'flex-start' },
        payload.alignment === 'right' && { alignItems: 'flex-end' },
      ]}
      accessibilityLabel={`Text, ${payload.text}`}
      accessibilityHint="Displays this text on the canvas"
      accessibilityRole="text"
    >
      <Reanimated.View style={animStyle}>
        {textBody}
      </Reanimated.View>
    </View>
  );
}

const textStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.sm },
  text: {
    fontFamily: TypographyV2.body.fontFamily,
    fontSize: TypographyV2.body.size + 1,
    textAlign: 'center',
    flexWrap: 'wrap' } });
