/**
 * InlineTextEditor — in-place text content editing on the canvas
 * (Snapchat/Instagram pattern).
 *
 * When a user double-taps a text layer, this TextInput appears AT the
 * layer's position on the canvas. The user types in place and the canvas
 * stays visible behind it. On blur or Done, the text is committed and the
 * editor dismisses.
 *
 * This is ONLY for content editing (the text string). Styling lives in
 * the InlineTextToolbar and the full TextEditorSheet (opened via "More").
 *
 * Per AGENTS.md §4 (anti-AI-made design):
 *   - No chrome — the text IS the editor (transparent background, no border)
 *   - One purpose: type the text
 *   - Keyboard-aware: shifts up if the keyboard would cover it
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { TextInput } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedStyle,
  withTiming,
  useReducedMotion } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { Typography } from '../../../theme/designTokens';
import { Motion } from '../../../theme/motionTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { getPresetById } from './textStylePresets';
import { toHexString } from '../../color/ColorMath';

import type { CreatorLayer } from '../../composition';

type TextLayer = Extract<CreatorLayer, { type: 'text' }>;

export interface InlineTextEditorProps {
  layer: TextLayer;
  canvasWidth: number;
  canvasHeight: number;
  /** Pixel offset of the canvas top from the screen top (canvasVerticalOffset). */
  canvasTopOffset: number;
  screenWidth: number;
  screenHeight: number;
  onCommit: (text: string) => void;
  onDismiss: () => void;
}

// Per-style typography metrics — mirrors the canvas TextLayerContent
// styleMap sizing so the editor visually matches the rendered layer.
// Font family is resolved from textStylePresets (single source of truth
// for font selection).
const STYLE_METRICS: Record<
  string,
  { fontSize: number; lineHeight: number; letterSpacing?: number; textTransform?: 'uppercase' }
> = {
  headline: { fontSize: TypographyV2.screenTitle.size + 4, lineHeight: (TypographyV2.screenTitle.size + 4) * 1.15 },
  editorial: { fontSize: TypographyV2.screenTitle.size + 1, lineHeight: (TypographyV2.screenTitle.size + 1) * 1.2 },
  clean: { fontSize: TypographyV2.body.size + 1, lineHeight: (TypographyV2.body.size + 1) * 1.35 },
  compact: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.size * 1.3,
    letterSpacing: 0.8,
    textTransform: 'uppercase' },
  handwritten: { fontSize: TypographyV2.body.size + 2, lineHeight: (TypographyV2.body.size + 2) * 1.3 },
  bubble: {
    fontSize: TypographyV2.bodyStrong.size + 6,
    lineHeight: (TypographyV2.bodyStrong.size + 6) * 1.2,
    letterSpacing: 0.5 },
  deco: {
    fontSize: TypographyV2.bodyStrong.size + 2,
    lineHeight: (TypographyV2.bodyStrong.size + 2) * 1.3,
    letterSpacing: 1.5 },
  poster: { fontSize: TypographyV2.screenTitle.size - 2, lineHeight: (TypographyV2.screenTitle.size - 2) * 1.1, letterSpacing: -0.5 },
  squeeze: { fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.size * 1.1, letterSpacing: -0.3 },
  signature: { fontSize: TypographyV2.bodyStrong.size + 2, lineHeight: (TypographyV2.bodyStrong.size + 2) * 1.4 } };

function resolveColor(layer: TextLayer, fallback: string): string {
  const { payload } = layer;
  if (payload.textColor) return payload.textColor;
  if (payload.fill) return toHexString(payload.fill);
  return fallback;
}

export function InlineTextEditor({
  layer,
  canvasWidth,
  canvasHeight,
  canvasTopOffset,
  screenWidth,
  screenHeight,
  onCommit,
  onDismiss }: InlineTextEditorProps) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<TextInput>(null);
  const [value, setValue] = useState(payload.text);
  const committedRef = useRef(false);

  const { height: keyboardHeightSV } = useReanimatedKeyboardAnimation();

  // Auto-focus on mount — keyboard opens immediately so the user can type
  // without a second tap. A short delay avoids a race with mount layout.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const commit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = value.trim();
    // Never commit an empty string — fall back to the existing text so the
    // layer remains valid (the schema requires min(1)).
    onCommit(trimmed.length > 0 ? trimmed : payload.text);
    haptic.light();
    onDismiss();
  }, [value, payload.text, onCommit, onDismiss, haptic]);

  // Geometry — matches the canvas LayerRenderer animatedStyle transform so
  // the editor sits exactly over the rendered text.
  const baseWidth = layer.width * canvasWidth;
  const baseHeight = layer.height * canvasHeight;
  const w = baseWidth * layer.scale;
  const h = baseHeight * layer.scale;
  const left = layer.x * canvasWidth - w / 2;
  const top = canvasTopOffset + layer.y * canvasHeight - h / 2;

  const preset = getPresetById(payload.textStyle ?? 'clean');
  const metrics = STYLE_METRICS[payload.textStyle ?? 'clean'] ?? STYLE_METRICS.clean;
  const color = resolveColor(layer, colors.scrimTextPrimary);

  const alignment = payload.alignment ?? 'center';
  const textAlign: TextStyle['textAlign'] = alignment === 'justify' ? 'left' : alignment;

  // Keyboard-aware shift: if the editor's bottom would be covered by the
  // keyboard, translate it up by the overlap so it stays visible. Capped so
  // it never pushes above the screen top.
  const keyboardShiftStyle = useAnimatedStyle(() => {
    const editorBottom = top + h;
    const keyboardTop = screenHeight - keyboardHeightSV.value;
    const overlap = editorBottom - keyboardTop;
    if (overlap <= 0) return { transform: [{ translateY: 0 }] };
    const shift = Math.min(overlap, top);
    return {
      transform: [
        {
          translateY: reducedMotion
            ? -shift
            : withTiming(-shift, { duration: Motion.duration.normal, easing: Motion.easing.entrance }) },
      ] };
  });

  return (
    <View
      style={[
        styles.container,
        {
          left,
          top,
          width: w,
          height: h,
          transform: [{ rotate: `${layer.rotation}deg` }] },
      ]}
      pointerEvents="box-none"
    >
      <Reanimated.View style={[StyleSheet.absoluteFill, keyboardShiftStyle]} pointerEvents="box-none">
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={setValue}
          onBlur={commit}
          onSubmitEditing={commit}
          multiline
          autoFocus
          returnKeyType="done"
          blurOnSubmit
          selectTextOnFocus
          underlineColorAndroid="transparent"
          style={[
            styles.input,
            {
              color,
              fontFamily: preset?.fontFamily ?? Typography.family.medium,
              fontSize: payload.fontSize ?? metrics.fontSize,
              lineHeight: metrics.lineHeight,
              letterSpacing: metrics.letterSpacing,
              textTransform: metrics.textTransform,
              fontWeight: payload.bold ? 'bold' : 'normal',
              fontStyle: payload.italic ? 'italic' : 'normal',
              textDecorationLine: payload.underline ? 'underline' : 'none',
              textAlign },
          ]}
          accessibilityLabel="Edit text content"
          accessibilityHint="Type to edit the text. Done or tap away to save."
          accessibilityRole="text"
        />
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center' } as ViewStyle,
  input: {
    flex: 1,
    width: '100%',
    padding: 0,
    margin: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    flexWrap: 'wrap' } as TextStyle });
