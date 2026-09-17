/**
 * useTextEditorState — state model for TextEditorSheet.
 *
 * Extracted from TextEditorSheet.tsx (pure extraction, zero behavior change):
 * owns the text style state, legacy-field migration on open, tab underline
 * spring animations, color-commit handlers, derived preview styles, and the
 * confirm payload builder.
 *
 * Backward compat: if a layer has old textColor/textEffect/backgroundColor,
 * they are migrated to the new fill/stroke/shadow/background fields on open.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Animated, TextInput, type TextStyle } from 'react-native';
import { TypographyV2 } from '../../../theme/typography.v2';
import { Motion } from '../../../theme/motionTokens';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { resolveFontPreviewStyle } from './FontRegistry';
import {
  DEFAULT_TEXT_STYLE,
  type TextStyleConfig } from './textStylePresets';
import {
  useCreatorColorHistory,
  toHexString,
  BLACK,
  WHITE,
  type CreatorColor } from '../../color';
import {
  ALIGNMENTS,
  ANIMATIONS,
  ANIMATION_TO_PAYLOAD,
  hexToColor,
  colorToRgba,
  type AlignmentKey,
  type AnimationKey,
  type ColorSection } from './textEditorShared';

export interface TextEditorStateOptions {
  visible: boolean;
  initialText: string;
  initialStyle?: Partial<TextStyleConfig>;
  onConfirm: (text: string, style: TextStyleConfig) => void;
}

export function useTextEditorState({
  visible,
  initialText,
  initialStyle,
  onConfirm }: TextEditorStateOptions) {
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<TextInput>(null);
  const { recents, commitColor: addRecent } = useCreatorColorHistory();

  // ── State ──
  const [text, setText] = useState(initialText);
  const [fontId, setFontId] = useState<string>(initialStyle?.textStyle ?? DEFAULT_TEXT_STYLE.textStyle);

  // Fill color (CreatorColor)
  const [fillColor, setFillColor] = useState<CreatorColor>(
    initialStyle?.fill ?? (initialStyle?.textColor ? hexToColor(initialStyle.textColor) : WHITE),
  );

  // Alignment
  const [alignment, setAlignment] = useState<AlignmentKey>(
    initialStyle?.alignment ?? DEFAULT_TEXT_STYLE.alignment,
  );

  // Stroke
  const [strokeEnabled, setStrokeEnabled] = useState(Boolean(initialStyle?.stroke));
  const [strokeWidth, setStrokeWidth] = useState(initialStyle?.stroke?.width ?? 2);
  const [strokeColor, setStrokeColor] = useState<CreatorColor>(initialStyle?.stroke?.color ?? BLACK);

  // Shadow
  const [shadowEnabled, setShadowEnabled] = useState(Boolean(initialStyle?.shadow));
  const [shadowBlur, setShadowBlur] = useState(initialStyle?.shadow?.blur ?? 4);
  const [shadowOffsetX, setShadowOffsetX] = useState(initialStyle?.shadow?.offsetX ?? 0);
  const [shadowOffsetY, setShadowOffsetY] = useState(initialStyle?.shadow?.offsetY ?? 2);
  const [shadowColor, setShadowColor] = useState<CreatorColor>(initialStyle?.shadow?.color ?? BLACK);

  // Background
  const [bgEnabled, setBgEnabled] = useState(Boolean(initialStyle?.background));
  const [bgRadius, setBgRadius] = useState(initialStyle?.background?.radius ?? 4);
  const [bgPaddingX, setBgPaddingX] = useState(initialStyle?.background?.paddingX ?? 8);
  const [bgPaddingY, setBgPaddingY] = useState(initialStyle?.background?.paddingY ?? 4);
  const [bgColor, setBgColor] = useState<CreatorColor>(initialStyle?.background?.color ?? BLACK);

  // Animation
  const [animation, setAnimation] = useState<AnimationKey>('none');

  // Track which color section is expanded (only one at a time)
  const [expandedColor, setExpandedColor] = useState<ColorSection | null>(null);

  // ── Tab underline animations ──────────────────────────────────────
  // Alignment tabs (3 fixed-width)
  const alignmentLayouts = useRef<Array<{ x: number; width: number }>>([]);
  const alignmentUnderlineLeft = useRef(new Animated.Value(0)).current;
  const alignmentUnderlineWidth = useRef(new Animated.Value(0)).current;

  // Animation tabs (horizontal scroll, variable width)
  const animLayouts = useRef<Array<{ x: number; width: number }>>([]);
  const animUnderlineLeft = useRef(new Animated.Value(0)).current;
  const animUnderlineWidth = useRef(new Animated.Value(0)).current;

  const animateUnderline = useCallback(
    (
      layouts: Array<{ x: number; width: number }>,
      leftVal: Animated.Value,
      widthVal: Animated.Value,
      index: number,
    ) => {
      const layout = layouts[index];
      if (!layout) return;
      if (reducedMotion) {
        leftVal.setValue(layout.x);
        widthVal.setValue(layout.width);
      } else {
        Animated.parallel([
          Animated.spring(leftVal, {
            toValue: layout.x,
            useNativeDriver: false, // left/width are not native-driver supported
            stiffness: Motion.spring.indicator.stiffness,
            damping: Motion.spring.indicator.damping }),
          Animated.spring(widthVal, {
            toValue: layout.width,
            useNativeDriver: false, // left/width are not native-driver supported
            stiffness: Motion.spring.indicator.stiffness,
            damping: Motion.spring.indicator.damping }),
        ]).start();
      }
    },
    [reducedMotion],
  );

  // Animate alignment underline when alignment changes
  useEffect(() => {
    const idx = ALIGNMENTS.findIndex((a) => a.key === alignment);
    if (idx >= 0) {
      animateUnderline(alignmentLayouts.current, alignmentUnderlineLeft, alignmentUnderlineWidth, idx);
    }
  }, [alignment, animateUnderline, alignmentUnderlineLeft, alignmentUnderlineWidth]);

  // Animate animation underline when animation changes
  useEffect(() => {
    const idx = ANIMATIONS.findIndex((a) => a.key === animation);
    if (idx >= 0) {
      animateUnderline(animLayouts.current, animUnderlineLeft, animUnderlineWidth, idx);
    }
  }, [animation, animateUnderline, animUnderlineLeft, animUnderlineWidth]);

  // ── Migrate legacy fields on open ──
  useEffect(() => {
    if (visible) {
      setText(initialText);
      setFontId(initialStyle?.textStyle ?? DEFAULT_TEXT_STYLE.textStyle);

      // Migrate textColor → fill
      if (initialStyle?.fill) {
        setFillColor(initialStyle.fill);
      } else if (initialStyle?.textColor) {
        setFillColor(hexToColor(initialStyle.textColor));
      } else {
        setFillColor(WHITE);
      }

      setAlignment(initialStyle?.alignment ?? DEFAULT_TEXT_STYLE.alignment);

      // Migrate textEffect → stroke/shadow
      const effect = initialStyle?.textEffect;
      if (initialStyle?.stroke) {
        setStrokeEnabled(true);
        setStrokeWidth(initialStyle.stroke.width);
        setStrokeColor(initialStyle.stroke.color);
      } else if (effect === 'outline' || effect === 'glow') {
        setStrokeEnabled(true);
        setStrokeWidth(effect === 'glow' ? 4 : 2);
        setStrokeColor(BLACK);
      } else {
        setStrokeEnabled(false);
        setStrokeWidth(2);
        setStrokeColor(BLACK);
      }

      if (initialStyle?.shadow) {
        setShadowEnabled(true);
        setShadowBlur(initialStyle.shadow.blur);
        setShadowOffsetX(initialStyle.shadow.offsetX);
        setShadowOffsetY(initialStyle.shadow.offsetY);
        setShadowColor(initialStyle.shadow.color);
      } else if (effect === 'shadow' || effect === 'neon') {
        setShadowEnabled(true);
        setShadowBlur(effect === 'neon' ? 12 : 4);
        setShadowOffsetX(0);
        setShadowOffsetY(2);
        setShadowColor(effect === 'neon' ? { ...WHITE, a: 0.8 } : { ...BLACK, a: 0.8 });
      } else {
        setShadowEnabled(false);
        setShadowBlur(4);
        setShadowOffsetX(0);
        setShadowOffsetY(2);
        setShadowColor(BLACK);
      }

      // Migrate backgroundColor → background
      if (initialStyle?.background) {
        setBgEnabled(true);
        setBgRadius(initialStyle.background.radius);
        setBgPaddingX(initialStyle.background.paddingX);
        setBgPaddingY(initialStyle.background.paddingY);
        setBgColor(initialStyle.background.color);
      } else if (initialStyle?.backgroundColor) {
        setBgEnabled(true);
        setBgRadius(4);
        setBgPaddingX(8);
        setBgPaddingY(4);
        setBgColor(hexToColor(initialStyle.backgroundColor));
      } else {
        setBgEnabled(false);
        setBgRadius(4);
        setBgPaddingX(8);
        setBgPaddingY(4);
        setBgColor(BLACK);
      }

      setAnimation('none');
      setExpandedColor(null);

      // Auto-focus the input on open.
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [visible, initialText, initialStyle]);

  // ── Color picker handlers ──
  const handleFillCommit = useCallback((c: CreatorColor) => {
    setFillColor(c);
    addRecent(c);
  }, [addRecent]);

  const handleStrokeCommit = useCallback((c: CreatorColor) => {
    setStrokeColor(c);
    addRecent(c);
  }, [addRecent]);

  const handleShadowCommit = useCallback((c: CreatorColor) => {
    setShadowColor(c);
    addRecent(c);
  }, [addRecent]);

  const handleBgCommit = useCallback((c: CreatorColor) => {
    setBgColor(c);
    addRecent(c);
  }, [addRecent]);

  const toggleColorSection = useCallback((section: ColorSection) => {
    haptic.selection();
    setExpandedColor((prev) => (prev === section ? null : section));
  }, [haptic]);

  // ── Confirm ──
  const handleConfirm = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const style: TextStyleConfig = {
      text: trimmed,
      textStyle: fontId,
      // Legacy fields (backward compat)
      textColor: toHexString(fillColor),
      backgroundColor: bgEnabled ? toHexString(bgColor) : undefined,
      alignment,
      opacity: 1,
      textEffect: strokeEnabled ? 'outline' : shadowEnabled ? 'shadow' : 'none',
      textAnimation: ANIMATION_TO_PAYLOAD[animation],
      // New canonical fields
      fill: fillColor,
      stroke: strokeEnabled ? { color: strokeColor, width: strokeWidth } : undefined,
      shadow: shadowEnabled
        ? { color: shadowColor, blur: shadowBlur, offsetX: shadowOffsetX, offsetY: shadowOffsetY }
        : undefined,
      background: bgEnabled
        ? { color: bgColor, radius: bgRadius, paddingX: bgPaddingX, paddingY: bgPaddingY }
        : undefined };

    haptic.light();
    onConfirm(trimmed, style);
  }, [
    text, fontId, fillColor, alignment, strokeEnabled, strokeWidth, strokeColor,
    shadowEnabled, shadowBlur, shadowOffsetX, shadowOffsetY, shadowColor,
    bgEnabled, bgColor, bgRadius, bgPaddingX, bgPaddingY, animation,
    haptic, onConfirm,
  ]);

  // ── Preview style ──
  const previewFontStyle = useMemo(
    () => resolveFontPreviewStyle(fontId, TypographyV2.bodyStrong.size + 2),
    [fontId],
  );

  const canConfirm = text.trim().length > 0;

  // ── Preview text style with effects ──
  const previewTextBase: TextStyle = {
    fontSize: previewFontStyle.fontSize,
    fontFamily: previewFontStyle.fontFamily,
    lineHeight: previewFontStyle.lineHeight,
    textAlign: alignment,
    color: colorToRgba(fillColor) };

  // Shadow style for preview
  const previewShadow: TextStyle = shadowEnabled
    ? {
        textShadowColor: colorToRgba(shadowColor),
        textShadowOffset: { width: shadowOffsetX, height: shadowOffsetY },
        textShadowRadius: shadowBlur }
    : {};

  // Stroke preview: use multi-shadow technique (8 directions)
  const strokeOffsets = useMemo(() => {
    if (!strokeEnabled || strokeWidth <= 0) return [];
    const w = strokeWidth;
    return [
      { width: -w, height: 0 },
      { width: w, height: 0 },
      { width: 0, height: -w },
      { width: 0, height: w },
      { width: -w, height: -w },
      { width: w, height: -w },
      { width: -w, height: w },
      { width: w, height: w },
    ];
  }, [strokeEnabled, strokeWidth]);

  const previewText = text.trim() || 'Your text preview';

  return {
    inputRef,
    recents,
    addRecent,
    text,
    setText,
    fontId,
    setFontId,
    fillColor,
    setFillColor,
    alignment,
    setAlignment,
    strokeEnabled,
    setStrokeEnabled,
    strokeWidth,
    setStrokeWidth,
    strokeColor,
    setStrokeColor,
    shadowEnabled,
    setShadowEnabled,
    shadowBlur,
    setShadowBlur,
    shadowOffsetX,
    setShadowOffsetX,
    shadowOffsetY,
    setShadowOffsetY,
    shadowColor,
    setShadowColor,
    bgEnabled,
    setBgEnabled,
    bgRadius,
    setBgRadius,
    bgPaddingX,
    setBgPaddingX,
    bgPaddingY,
    setBgPaddingY,
    bgColor,
    setBgColor,
    animation,
    setAnimation,
    expandedColor,
    alignmentLayouts,
    alignmentUnderlineLeft,
    alignmentUnderlineWidth,
    animLayouts,
    animUnderlineLeft,
    animUnderlineWidth,
    animateUnderline,
    handleFillCommit,
    handleStrokeCommit,
    handleShadowCommit,
    handleBgCommit,
    toggleColorSection,
    handleConfirm,
    canConfirm,
    previewTextBase,
    previewShadow,
    strokeOffsets,
    previewText };
}
