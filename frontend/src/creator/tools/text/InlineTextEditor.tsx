/**
 * InlineTextEditor — in-place text content editing on the canvas
 * (Snapchat/Instagram flagship story pattern).
 *
 * When a user double-taps a text layer, this TextInput appears AT the
 * layer's position on the canvas. The user types in place and the canvas
 * stays visible behind it. Right above the keyboard, a floating font preset
 * rail lets the creator swipe through typography styles (Clean, Headline,
 * Editorial, Signature, Bubble, Deco, etc.) and toggle text alignment and
 * background highlights with instant visual feedback and haptic cues.
 *
 * On blur or Done, the text and selected styling attributes commit cleanly.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { TextInput } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { Typography, Space, Radius, Stroke, IconGrammar } from '../../../theme/designTokens';
import { Motion } from '../../../theme/motionTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { CreatorGlyph } from '../../controls/CreatorGlyph';
import { TEXT_STYLE_PRESETS, getPresetById, type TextStylePreset } from './textStylePresets';
import { toHexString } from '../../color/ColorMath';

import type { CreatorLayer } from '../../composition';

type TextLayer = Extract<CreatorLayer, { type: 'text' }>;

export type TextStylePresetId = NonNullable<TextLayer['payload']['textStyle']>;

export interface InlineTextEditorProps {
  layer: TextLayer;
  canvasWidth: number;
  canvasHeight: number;
  /** Pixel offset of the canvas top from the screen top (canvasVerticalOffset). */
  canvasTopOffset: number;
  screenWidth: number;
  screenHeight: number;
  onCommit: (
    text: string,
    styleUpdates?: {
      textStyle?: TextStylePresetId;
      alignment?: 'left' | 'center' | 'right';
      background?: any;
      textColor?: string;
    }
  ) => void;
  onDismiss: () => void;
}

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
    textTransform: 'uppercase',
  },
  handwritten: { fontSize: TypographyV2.body.size + 2, lineHeight: (TypographyV2.body.size + 2) * 1.3 },
  bubble: {
    fontSize: TypographyV2.bodyStrong.size + 6,
    lineHeight: (TypographyV2.bodyStrong.size + 6) * 1.2,
    letterSpacing: 0.5,
  },
  deco: {
    fontSize: TypographyV2.bodyStrong.size + 2,
    lineHeight: (TypographyV2.bodyStrong.size + 2) * 1.3,
    letterSpacing: 1.5,
  },
  poster: { fontSize: TypographyV2.screenTitle.size - 2, lineHeight: (TypographyV2.screenTitle.size - 2) * 1.1, letterSpacing: -0.5 },
  squeeze: { fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.size * 1.1, letterSpacing: -0.3 },
  signature: { fontSize: TypographyV2.bodyStrong.size + 2, lineHeight: (TypographyV2.bodyStrong.size + 2) * 1.4 },
};

function resolveColor(layer: TextLayer, fallback: string): string {
  const { payload } = layer;
  if (payload.textColor) return payload.textColor;
  if (payload.fill) return toHexString(payload.fill);
  return fallback;
}

type HighlightMode = 'none' | 'semi' | 'solid';

export function InlineTextEditor({
  layer,
  canvasWidth,
  canvasHeight,
  canvasTopOffset,
  screenWidth,
  screenHeight,
  onCommit,
  onDismiss,
}: InlineTextEditorProps) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<TextInput>(null);

  const [value, setValue] = useState(payload.text);
  const [activePresetId, setActivePresetId] = useState<TextStylePresetId>(
    (payload.textStyle as TextStylePresetId) ?? 'clean'
  );
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>(
    payload.alignment === 'justify' ? 'left' : (payload.alignment ?? 'center')
  );

  // Initial highlight detection
  const initialHighlight: HighlightMode = useMemo(() => {
    if (!payload.background) return 'none';
    const alpha = payload.background.color?.a ?? 1;
    return alpha < 0.9 ? 'semi' : 'solid';
  }, [payload.background]);

  const [highlightMode, setHighlightMode] = useState<HighlightMode>(initialHighlight);
  const committedRef = useRef(false);

  const { height: keyboardHeightSV } = useReanimatedKeyboardAnimation();

  // Auto-focus on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const commit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = value.trim();
    const finalContent = trimmed.length > 0 ? trimmed : payload.text;

    let backgroundPayload: any = undefined;
    let finalTextColor = resolveColor(layer, colors.scrimTextPrimary);

    if (highlightMode === 'semi') {
      backgroundPayload = {
        color: { space: 'srgb', r: 0.08, g: 0.08, b: 0.1, a: 0.72 },
        radius: 6,
        paddingX: 10,
        paddingY: 6,
      };
      finalTextColor = colors.scrimTextPrimary;
    } else if (highlightMode === 'solid') {
      backgroundPayload = {
        color: { space: 'srgb', r: 0.96, g: 0.96, b: 0.96, a: 1 },
        radius: 6,
        paddingX: 10,
        paddingY: 6,
      };
      finalTextColor = '#121212';
    }

    onCommit(finalContent, {
      textStyle: activePresetId,
      alignment,
      background: backgroundPayload,
      textColor: finalTextColor,
    });
    haptic.light();
    onDismiss();
  }, [
    value,
    payload.text,
    layer,
    colors.scrimTextPrimary,
    highlightMode,
    activePresetId,
    alignment,
    onCommit,
    onDismiss,
    haptic,
  ]);

  const handleToggleAlignment = useCallback(() => {
    haptic.selection();
    setAlignment((prev) => {
      if (prev === 'center') return 'left';
      if (prev === 'left') return 'right';
      return 'center';
    });
  }, [haptic]);

  const handleToggleHighlight = useCallback(() => {
    haptic.selection();
    setHighlightMode((prev) => {
      if (prev === 'none') return 'semi';
      if (prev === 'semi') return 'solid';
      return 'none';
    });
  }, [haptic]);

  const handleSelectPreset = useCallback((presetId: TextStylePresetId) => {
    haptic.selection();
    setActivePresetId(presetId);
  }, [haptic]);

  // Geometry
  const baseWidth = layer.width * canvasWidth;
  const baseHeight = layer.height * canvasHeight;
  const w = baseWidth * layer.scale;
  const h = baseHeight * layer.scale;
  const left = layer.x * canvasWidth - w / 2;
  const top = canvasTopOffset + layer.y * canvasHeight - h / 2;

  const preset = getPresetById(activePresetId);
  const metrics = STYLE_METRICS[activePresetId] ?? STYLE_METRICS.clean;

  // Active color calculation with highlight awareness
  const calculatedColor = useMemo(() => {
    if (highlightMode === 'solid') return colors.background;
    if (highlightMode === 'semi') return colors.scrimTextPrimary;
    return resolveColor(layer, colors.scrimTextPrimary);
  }, [highlightMode, layer, colors.scrimTextPrimary]);

  const textAlign: TextStyle['textAlign'] = alignment;

  // Keyboard-aware shift for the active text box
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
            : withTiming(-shift, { duration: Motion.duration.normal, easing: Motion.easing.entrance }),
        },
      ],
    };
  });

  // Floating toolbar animated position right above the keyboard
  const toolbarAnimatedStyle = useAnimatedStyle(() => {
    return {
      bottom: Math.max(12, keyboardHeightSV.value + 8),
    };
  });

  const alignGlyph =
    alignment === 'left' ? 'align-left'
    : alignment === 'right' ? 'align-right'
    : 'align-center';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* ── Top Bar Controls: Alignment, Highlight Pill, and Done ── */}
      <View
        style={[
          styles.topControlsContainer,
          { top: Math.max(insets.top, 12) + 6 },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.topControlsRow}>
          {/* Alignment toggle */}
          <Pressable
            onPress={handleToggleAlignment}
            style={({ pressed }) => [
              styles.headerPillButton,
              pressed && styles.pillPressed,
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={`Text alignment: ${alignment}. Tap to toggle.`}
            accessibilityRole="button"
          >
            <CreatorGlyph name={alignGlyph} size={18} color="#FFFFFF" />
          </Pressable>

          {/* Highlight toggle */}
          <Pressable
            onPress={handleToggleHighlight}
            style={({ pressed }) => [
              styles.headerPillButton,
              highlightMode !== 'none' && styles.headerPillActive,
              pressed && styles.pillPressed,
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={`Text highlight: ${highlightMode}. Tap to cycle.`}
            accessibilityRole="button"
          >
            <View
              style={[
                styles.highlightIconBadge,
                highlightMode === 'semi' && styles.highlightSemiBadge,
                highlightMode === 'solid' && styles.highlightSolidBadge,
              ]}
            >
              <Text
                style={[
                  styles.highlightIconText,
                  highlightMode === 'solid' && { color: '#000000' },
                ]}
              >
                A
              </Text>
            </View>
          </Pressable>

          {/* Spacer */}
          <View style={styles.flexSpacer} />

          {/* Done action button */}
          <Pressable
            onPress={commit}
            style={({ pressed }) => [
              styles.doneButton,
              pressed && styles.doneButtonPressed,
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
            accessibilityLabel="Done editing text"
            accessibilityRole="button"
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </View>
      </View>

      {/* ── The Text Input Canvas Overlay ── */}
      <View
        style={[
          styles.textInputWrapper,
          {
            left,
            top,
            width: w,
            height: h,
            transform: [{ rotate: `${layer.rotation}deg` }],
          },
        ]}
        pointerEvents="box-none"
      >
        <Reanimated.View style={[StyleSheet.absoluteFill, keyboardShiftStyle]} pointerEvents="box-none">
          <View
            style={[
              styles.inputBackgroundContainer,
              highlightMode === 'semi' && styles.inputSemiBackground,
              highlightMode === 'solid' && styles.inputSolidBackground,
            ]}
          >
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
                  color: calculatedColor,
                  fontFamily: preset?.fontFamily ?? Typography.family.medium,
                  fontSize: payload.fontSize ?? metrics.fontSize,
                  lineHeight: metrics.lineHeight,
                  letterSpacing: metrics.letterSpacing,
                  textTransform: metrics.textTransform,
                  fontWeight: payload.bold ? 'bold' : 'normal',
                  fontStyle: payload.italic ? 'italic' : 'normal',
                  textDecorationLine: payload.underline ? 'underline' : 'none',
                  textAlign,
                },
              ]}
              accessibilityLabel="Edit text content"
              accessibilityHint="Type to edit the text. Done to save."
              accessibilityRole="text"
            />
          </View>
        </Reanimated.View>
      </View>

      {/* ── Floating Typography Toolbar (Docked Above Keyboard) ── */}
      <Reanimated.View
        style={[styles.floatingToolbarContainer, toolbarAnimatedStyle]}
        pointerEvents="box-none"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.fontPresetsContent}
          keyboardShouldPersistTaps="handled"
        >
          {TEXT_STYLE_PRESETS.map((item) => {
            const isSelected = item.id === activePresetId;
            return (
              <Pressable
                key={item.id}
                onPress={() => handleSelectPreset(item.id as TextStylePresetId)}
                style={({ pressed }) => [
                  styles.fontPresetPill,
                  isSelected && styles.fontPresetPillActive,
                  pressed && styles.pillPressed,
                ]}
                accessibilityLabel={`Font style ${item.name}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Text
                  style={[
                    styles.fontPresetText,
                    { fontFamily: item.fontFamily },
                    isSelected && styles.fontPresetTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Reanimated.View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  topControlsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 200,
    paddingHorizontal: Space.md,
  },
  topControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  headerPillButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: colors.mediaOverlayScrim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerPillActive: {
    backgroundColor: colors.scrimTextPrimary,
    borderColor: colors.scrimTextPrimary,
  },
  pillPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  highlightIconBadge: {
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: colors.scrimTextPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  highlightSemiBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  highlightSolidBadge: {
    backgroundColor: colors.scrimTextPrimary,
  },
  highlightIconText: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.meta.size,
    color: colors.scrimTextPrimary,
    lineHeight: 14,
  },
  flexSpacer: {
    flex: 1,
  },
  doneButton: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    backgroundColor: colors.scrimTextPrimary,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  doneButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  doneButtonText: {
    fontFamily: Typography.family.bold,
    fontSize: 14,
    color: '#000000',
  },
  textInputWrapper: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  inputBackgroundContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  inputSemiBackground: {
    backgroundColor: colors.mediaOverlayScrim,
    borderRadius: Radius.sm,
  },
  inputSolidBackground: {
    backgroundColor: colors.scrimTextPrimary,
    borderRadius: Radius.sm,
  },
  input: {
    flex: 1,
    width: '100%',
    padding: 0,
    margin: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    flexWrap: 'wrap',
  } as TextStyle,
  floatingToolbarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 190,
  },
  fontPresetsContent: {
    paddingHorizontal: Space.md,
    gap: Space.xs,
    alignItems: 'center',
  },
  fontPresetPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: colors.mediaOverlayScrim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  fontPresetPillActive: {
    backgroundColor: colors.scrimTextPrimary,
    borderColor: colors.scrimTextPrimary,
  },
  fontPresetText: {
    fontSize: 13,
    color: '#E0E0E0',
  },
  fontPresetTextActive: {
    color: '#000000',
    fontWeight: 'bold',
  },
  });
}
