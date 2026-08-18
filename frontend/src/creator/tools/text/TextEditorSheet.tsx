/**
 * TextEditorSheet — bottom sheet for text editing.
 *
 * Per spec 06_TEXT_TYPOGRAPHY_EDITORIAL_SYSTEM §1:
 *   - Real text model with fill (CreatorColor), stroke, shadow, background
 *   - Every visible UI control maps to a distinct persisted value
 *   - Thin/Thick and Soft/Strong render materially differently
 *
 * Provides:
 *   - TextInput (auto-focus on open)
 *   - FontChooserRail using curated FontRegistry (spec §2, §3)
 *   - Fill color via CreatorColorPicker (spec §1)
 *   - Alignment toggle (left/center/right)
 *   - Stroke controls: enable, width slider, color picker
 *   - Shadow controls: enable, blur slider, offset X/Y, color picker
 *   - Background controls: enable, color picker, padding, radius
 *   - Animation selector (fade/rise/type/pop/slide)
 *   - Done button
 *
 * Backward compat: if a layer has old textColor/textEffect/backgroundColor,
 * they are migrated to the new fill/stroke/shadow/background fields on open.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  PanResponder,
  Animated,
  type TextStyle,
  type LayoutChangeEvent,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Space,
  Radius,
  Type,
  Typography,
  Stroke,
  Control,
  FontFamily,
} from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../../CreatorAnimations';
import { KeyboardAwareScrollView } from '../../../platform/keyboard/KeyboardProvider';
import { useHaptic } from '../../../hooks/useHaptic';
import { FontChooserRail } from './FontChooserRail';
import { CURATED_FONTS, resolveFontPreviewStyle } from './FontRegistry';
import {
  DEFAULT_TEXT_STYLE,
  type TextStyleConfig,
} from './textStylePresets';
import {
  CreatorColorPicker,
  useCreatorColorHistory,
  toRgbaString,
  toHexString,
  fromHexString,
  BLACK,
  WHITE,
  type CreatorColor,
  type RecentColor,
} from '../../color';

export interface TextEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  initialText: string;
  initialStyle?: Partial<TextStyleConfig>;
  onConfirm: (text: string, style: TextStyleConfig) => void;
}

// ── Types ────────────────────────────────────────────────────────────

type AlignmentKey = 'left' | 'center' | 'right' | 'justify';
type AnimationKey = 'none' | 'fade' | 'rise' | 'type' | 'pop' | 'slide';
type ColorSection = 'fill' | 'stroke' | 'shadow' | 'background';

// ── Static option sets ────────────────────────────────────────────────

const ALIGNMENTS: Array<{ key: AlignmentKey; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { key: 'left', icon: 'text-outline' },
  { key: 'center', icon: 'text' },
  { key: 'right', icon: 'list-outline' },
];

const ANIMATIONS: Array<{ key: AnimationKey; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { key: 'none', label: 'None', icon: 'close-outline' },
  { key: 'fade', label: 'Fade', icon: 'eye-outline' },
  { key: 'rise', label: 'Rise', icon: 'arrow-up-outline' },
  { key: 'type', label: 'Type', icon: 'keypad-outline' },
  { key: 'pop', label: 'Pop', icon: 'add-circle-outline' },
  { key: 'slide', label: 'Slide', icon: 'arrow-forward-outline' },
];

const ANIMATION_TO_PAYLOAD: Record<AnimationKey, TextStyleConfig['textAnimation']> = {
  none: 'none',
  fade: 'fade',
  rise: 'slide',
  type: 'typewriter',
  pop: 'bounce',
  slide: 'slide',
};

// ── Helpers ───────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function hexToColor(hex: string): CreatorColor {
  return fromHexString(hex) ?? WHITE;
}

function colorToRgba(c: CreatorColor): string {
  return toRgbaString(c);
}

// ── Component ─────────────────────────────────────────────────────────

export function TextEditorSheet({
  visible,
  onClose,
  initialText,
  initialStyle,
  onConfirm,
}: TextEditorSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useEditorStyles(colors);
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
      Animated.parallel([
        Animated.spring(leftVal, {
          toValue: layout.x,
          useNativeDriver: false,
          stiffness: 300,
          damping: 30,
        }),
        Animated.spring(widthVal, {
          toValue: layout.width,
          useNativeDriver: false,
          stiffness: 300,
          damping: 30,
        }),
      ]).start();
    },
    [],
  );

  // Animate alignment underline when alignment changes
  useEffect(() => {
    const idx = ALIGNMENTS.findIndex((a) => a.key === alignment);
    if (idx >= 0) {
      animateUnderline(alignmentLayouts.current, alignmentUnderlineLeft, alignmentUnderlineWidth, idx);
    }
  }, [alignment, animateUnderline]);

  // Animate animation underline when animation changes
  useEffect(() => {
    const idx = ANIMATIONS.findIndex((a) => a.key === animation);
    if (idx >= 0) {
      animateUnderline(animLayouts.current, animUnderlineLeft, animUnderlineWidth, idx);
    }
  }, [animation, animateUnderline]);

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
        : undefined,
    };

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
    () => resolveFontPreviewStyle(fontId, Type.bodyStrong.size + 2),
    [fontId],
  );

  const canConfirm = text.trim().length > 0;

  // ── Preview text style with effects ──
  const previewTextBase: TextStyle = {
    fontSize: previewFontStyle.fontSize,
    fontFamily: previewFontStyle.fontFamily,
    lineHeight: previewFontStyle.lineHeight,
    textAlign: alignment,
    color: colorToRgba(fillColor),
  };

  // Shadow style for preview
  const previewShadow: TextStyle = shadowEnabled
    ? {
        textShadowColor: colorToRgba(shadowColor),
        textShadowOffset: { width: shadowOffsetX, height: shadowOffsetY },
        textShadowRadius: shadowBlur,
      }
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

  return (
    <SheetContainer visible={visible} onClose={onClose} maxHeight={0.9}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ maxHeight: '100%' }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Edit Text</Text>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close text editor"
            accessibilityHint="Closes the text editor sheet"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
        </View>

        <View style={styles.body}>
          {/* ── Live preview ── */}
          <View
            style={[
              styles.preview,
              bgEnabled && {
                backgroundColor: colorToRgba(bgColor),
                borderRadius: bgRadius,
                paddingHorizontal: bgPaddingX,
                paddingVertical: bgPaddingY,
              },
            ]}
          >
            {strokeEnabled && strokeOffsets.length > 0 ? (
              <View style={styles.strokePreviewWrap}>
                {strokeOffsets.map((offset, i) => (
                  <Text
                    key={`stroke-${i}`}
                    style={[
                      previewTextBase,
                      {
                        position: 'absolute',
                        color: 'transparent',
                        textShadowColor: colorToRgba(strokeColor),
                        textShadowOffset: offset,
                        textShadowRadius: 0,
                      },
                    ]}
                    numberOfLines={3}
                  >
                    {previewText}
                  </Text>
                ))}
                <Text
                  style={[previewTextBase, previewShadow, { position: 'absolute' }]}
                  numberOfLines={3}
                >
                  {previewText}
                </Text>
              </View>
            ) : (
              <Text
                style={[previewTextBase, previewShadow]}
                numberOfLines={3}
              >
                {previewText}
              </Text>
            )}
          </View>

          {/* ── Text input ── */}
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Type your text..."
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={200}
            accessibilityLabel="Text content"
          />

          {/* ── Font chooser rail ── */}
          <Text style={styles.sectionLabel}>Font</Text>
          <FontChooserRail
            text={text}
            fonts={CURATED_FONTS}
            selectedId={fontId}
            onSelect={setFontId}
          />

          {/* ── Fill color ── */}
          <Text style={styles.sectionLabel}>Text Color</Text>
          <CreatorColorPicker
            color={fillColor}
            onChange={setFillColor}
            onCommit={handleFillCommit}
            mode={expandedColor === 'fill' ? 'expanded' : 'compact'}
            recents={recents as RecentColor[]}
            onCommitRecent={addRecent}
            accessibilityLabel="Text fill color picker"
            style={styles.colorPicker}
          />

          {/* ── Alignment ── */}
          <Text style={styles.sectionLabel}>Alignment</Text>
          <View style={styles.tabBar}>
            {ALIGNMENTS.map((a, i) => {
              const isActive = alignment === a.key;
              return (
                <Pressable
                  key={a.key}
                  onPress={() => { haptic.selection(); setAlignment(a.key); }}
                  style={styles.tabItem}
                  accessibilityLabel={`Align ${a.key}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  onLayout={(e) => {
                    alignmentLayouts.current[i] = {
                      x: e.nativeEvent.layout.x,
                      width: e.nativeEvent.layout.width,
                    };
                    if (isActive) {
                      animateUnderline(alignmentLayouts.current, alignmentUnderlineLeft, alignmentUnderlineWidth, i);
                    }
                  }}
                >
                  <Ionicons name={a.icon} size={18} color={isActive ? colors.brand : colors.textSecondary} />
                </Pressable>
              );
            })}
            <Animated.View
              style={[
                styles.tabUnderline,
                { left: alignmentUnderlineLeft, width: alignmentUnderlineWidth },
              ]}
            />
          </View>

          {/* ── Stroke section ── */}
          <View style={styles.effectSectionHeader}>
            <Text style={styles.sectionLabel}>Stroke</Text>
            <Pressable
              onPress={() => { haptic.selection(); setStrokeEnabled((v) => !v); }}
              style={[styles.enableToggle, strokeEnabled && styles.enableToggleActive]}
              accessibilityLabel={strokeEnabled ? 'Disable stroke' : 'Enable stroke'}
              accessibilityRole="switch"
              accessibilityState={{ checked: strokeEnabled }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={strokeEnabled ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={strokeEnabled ? colors.brand : colors.textMuted}
              />
            </Pressable>
          </View>

          {strokeEnabled && (
            <View style={styles.effectControls}>
              <MiniSlider
                label="Width"
                value={strokeWidth}
                min={0}
                max={20}
                step={0.5}
                valueFormatter={(v) => `${v.toFixed(1)}px`}
                onChange={setStrokeWidth}
                colors={colors}
              />
              <Pressable
                onPress={() => toggleColorSection('stroke')}
                style={styles.colorSectionToggle}
                accessibilityLabel="Stroke color"
                accessibilityRole="button"
              >
                <View style={[styles.colorWell, { backgroundColor: colorToRgba(strokeColor) }]} />
                <Text style={[styles.colorWellLabel, { color: colors.textSecondary }]}>
                  {toHexString(strokeColor).toUpperCase()}
                </Text>
                <Ionicons
                  name={expandedColor === 'stroke' ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={16}
                  color={colors.textSecondary}
                />
              </Pressable>
              {expandedColor === 'stroke' && (
                <CreatorColorPicker
                  color={strokeColor}
                  onChange={setStrokeColor}
                  onCommit={handleStrokeCommit}
                  mode="expanded"
                  recents={recents as RecentColor[]}
                  onCommitRecent={addRecent}
                  accessibilityLabel="Stroke color picker"
                  style={styles.colorPicker}
                />
              )}
            </View>
          )}

          {/* ── Shadow section ── */}
          <View style={styles.effectSectionHeader}>
            <Text style={styles.sectionLabel}>Shadow</Text>
            <Pressable
              onPress={() => { haptic.selection(); setShadowEnabled((v) => !v); }}
              style={[styles.enableToggle, shadowEnabled && styles.enableToggleActive]}
              accessibilityLabel={shadowEnabled ? 'Disable shadow' : 'Enable shadow'}
              accessibilityRole="switch"
              accessibilityState={{ checked: shadowEnabled }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={shadowEnabled ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={shadowEnabled ? colors.brand : colors.textMuted}
              />
            </Pressable>
          </View>

          {shadowEnabled && (
            <View style={styles.effectControls}>
              <MiniSlider
                label="Blur"
                value={shadowBlur}
                min={0}
                max={30}
                step={0.5}
                valueFormatter={(v) => `${v.toFixed(1)}px`}
                onChange={setShadowBlur}
                colors={colors}
              />
              <MiniSlider
                label="Offset X"
                value={shadowOffsetX}
                min={-20}
                max={20}
                step={1}
                valueFormatter={(v) => `${v}px`}
                onChange={setShadowOffsetX}
                colors={colors}
              />
              <MiniSlider
                label="Offset Y"
                value={shadowOffsetY}
                min={-20}
                max={20}
                step={1}
                valueFormatter={(v) => `${v}px`}
                onChange={setShadowOffsetY}
                colors={colors}
              />
              <Pressable
                onPress={() => toggleColorSection('shadow')}
                style={styles.colorSectionToggle}
                accessibilityLabel="Shadow color"
                accessibilityRole="button"
              >
                <View style={[styles.colorWell, { backgroundColor: colorToRgba(shadowColor) }]} />
                <Text style={[styles.colorWellLabel, { color: colors.textSecondary }]}>
                  {toHexString(shadowColor).toUpperCase()}
                </Text>
                <Ionicons
                  name={expandedColor === 'shadow' ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={16}
                  color={colors.textSecondary}
                />
              </Pressable>
              {expandedColor === 'shadow' && (
                <CreatorColorPicker
                  color={shadowColor}
                  onChange={setShadowColor}
                  onCommit={handleShadowCommit}
                  mode="expanded"
                  recents={recents as RecentColor[]}
                  onCommitRecent={addRecent}
                  accessibilityLabel="Shadow color picker"
                  style={styles.colorPicker}
                />
              )}
            </View>
          )}

          {/* ── Background section ── */}
          <View style={styles.effectSectionHeader}>
            <Text style={styles.sectionLabel}>Background</Text>
            <Pressable
              onPress={() => { haptic.selection(); setBgEnabled((v) => !v); }}
              style={[styles.enableToggle, bgEnabled && styles.enableToggleActive]}
              accessibilityLabel={bgEnabled ? 'Disable background' : 'Enable background'}
              accessibilityRole="switch"
              accessibilityState={{ checked: bgEnabled }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={bgEnabled ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={bgEnabled ? colors.brand : colors.textMuted}
              />
            </Pressable>
          </View>

          {bgEnabled && (
            <View style={styles.effectControls}>
              <MiniSlider
                label="Padding H"
                value={bgPaddingX}
                min={0}
                max={40}
                step={1}
                valueFormatter={(v) => `${v}px`}
                onChange={setBgPaddingX}
                colors={colors}
              />
              <MiniSlider
                label="Padding V"
                value={bgPaddingY}
                min={0}
                max={40}
                step={1}
                valueFormatter={(v) => `${v}px`}
                onChange={setBgPaddingY}
                colors={colors}
              />
              <MiniSlider
                label="Radius"
                value={bgRadius}
                min={0}
                max={30}
                step={1}
                valueFormatter={(v) => `${v}px`}
                onChange={setBgRadius}
                colors={colors}
              />
              <Pressable
                onPress={() => toggleColorSection('background')}
                style={styles.colorSectionToggle}
                accessibilityLabel="Background color"
                accessibilityRole="button"
              >
                <View style={[styles.colorWell, { backgroundColor: colorToRgba(bgColor) }]} />
                <Text style={[styles.colorWellLabel, { color: colors.textSecondary }]}>
                  {toHexString(bgColor).toUpperCase()}
                </Text>
                <Ionicons
                  name={expandedColor === 'background' ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={16}
                  color={colors.textSecondary}
                />
              </Pressable>
              {expandedColor === 'background' && (
                <CreatorColorPicker
                  color={bgColor}
                  onChange={setBgColor}
                  onCommit={handleBgCommit}
                  mode="expanded"
                  recents={recents as RecentColor[]}
                  onCommitRecent={addRecent}
                  accessibilityLabel="Background color picker"
                  style={styles.colorPicker}
                />
              )}
            </View>
          )}

          {/* ── Animation selector ── */}
          <Text style={styles.sectionLabel}>Animation</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.animContent}>
            {ANIMATIONS.map((a, i) => {
              const isActive = animation === a.key;
              return (
                <View
                  key={a.key}
                  onLayout={(e) => {
                    animLayouts.current[i] = {
                      x: e.nativeEvent.layout.x,
                      width: e.nativeEvent.layout.width,
                    };
                    if (isActive) {
                      animateUnderline(animLayouts.current, animUnderlineLeft, animUnderlineWidth, i);
                    }
                  }}
                >
                  <Pressable
                    onPress={() => { haptic.selection(); setAnimation(a.key); }}
                    style={styles.animTab}
                    accessibilityLabel={`Animation ${a.label}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Ionicons name={a.icon} size={18} color={isActive ? colors.brand : colors.textSecondary} />
                    <Text
                      style={[
                        styles.animTabLabel,
                        { color: isActive ? colors.brand : colors.textSecondary },
                      ]}
                    >
                      {a.label}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
            <Animated.View
              style={[
                styles.tabUnderline,
                { left: animUnderlineLeft, width: animUnderlineWidth },
              ]}
            />
          </ScrollView>

          {/* ── Done button ── */}
          <Pressable
            onPress={handleConfirm}
            style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
            disabled={!canConfirm}
            accessibilityLabel="Done"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canConfirm }}
          >
            <Text style={[styles.confirmBtnText, !canConfirm && { color: colors.textMuted }]}>Done</Text>
            <Ionicons
              name="checkmark"
              size={18}
              color={canConfirm ? colors.textInverse : colors.textMuted}
            />
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </SheetContainer>
  );
}

// ── MiniSlider (PanResponder-based, no new deps) ─────────────────────

interface MiniSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueFormatter: (v: number) => string;
  onChange: (v: number) => void;
  colors: ThemeColors;
}

function MiniSlider({
  label,
  value,
  min,
  max,
  step,
  valueFormatter,
  onChange,
  colors,
}: MiniSliderProps) {
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const styles = useEditorStyles(colors);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const range = max - min;
  const clamped = clamp(value, min, max);
  const ratio = range === 0 ? 0 : (clamped - min) / range;
  const trackLayoutWidth = trackWidth > 0 ? trackWidth : 1;
  const thumbPosition = ratio * trackLayoutWidth;

  const valueToPosition = useCallback(
    (x: number) => {
      const r = Math.min(1, Math.max(0, x / trackLayoutWidth));
      const raw = min + r * range;
      // Snap to step
      return Math.round(raw / step) * step;
    },
    [trackLayoutWidth, min, range, step],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
          const next = valueToPosition(thumbPosition + g.dx);
          onChange(clamp(next, min, max));
        },
        onPanResponderRelease: () => {},
        onPanResponderTerminationRequest: () => false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [thumbPosition, valueToPosition, onChange],
  );

  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderHeader}>
        <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
        <Text style={[styles.sliderValue, { color: colors.textMuted }]}>
          {valueFormatter(clamped)}
        </Text>
      </View>
      <View
        style={styles.trackWrap}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
        accessibilityLabel={`${label} slider`}
        accessibilityRole="adjustable"
        accessibilityValue={{
          min,
          max,
          now: clamped,
          text: valueFormatter(clamped),
        }}
      >
        <View style={[styles.track, { backgroundColor: colors.border }]} />
        <View
          style={[
            styles.fill,
            { width: thumbPosition, backgroundColor: colors.brand },
          ]}
        />
        <View
          style={[
            styles.thumb,
            { left: thumbPosition, backgroundColor: colors.textPrimary },
          ]}
        />
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

function useEditorStyles(colors: ThemeColors) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Space.md,
          paddingTop: Space.sm,
          paddingBottom: Space.sm,
        },
        title: {
          fontFamily: Typography.family.bold,
          fontSize: Type.subtitle.size,
          letterSpacing: Type.subtitle.letterSpacing,
        },
        closeBtn: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center',
        },
        body: {
          paddingHorizontal: Space.md,
          paddingBottom: Space.lg,
          gap: Space.sm,
        },
        preview: {
          minHeight: 72,
          borderRadius: Radius.lg,
          borderWidth: Stroke.hairline,
          borderColor: colors.borderSubtle,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          overflow: 'hidden',
        },
        strokePreviewWrap: {
          // The multi-shadow stroke technique requires a relative container
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'stretch',
        },
        input: {
          fontFamily: Typography.family.regular,
          fontSize: Type.body.size,
          color: colors.textPrimary,
          borderWidth: Stroke.standard,
          borderColor: colors.border,
          borderRadius: Radius.md,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          minHeight: 48,
        },
        sectionLabel: {
          fontFamily: Typography.family.semibold,
          fontSize: Type.label.size,
          letterSpacing: Type.label.letterSpacing,
          textTransform: 'uppercase',
          color: colors.textSecondary,
          marginTop: Space.xs,
        },
        colorPicker: {
          // No extra padding — CreatorColorPicker manages its own layout
        },
        tabBar: {
          flexDirection: 'row',
          position: 'relative',
        },
        tabItem: {
          flex: 1,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabUnderline: {
          position: 'absolute',
          bottom: 0,
          height: Stroke.emphasis,
          backgroundColor: colors.brand,
          borderRadius: Stroke.emphasis,
        },
        // ── Effect section header (label + enable toggle) ──
        effectSectionHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        enableToggle: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center',
        },
        enableToggleActive: {},
        effectControls: {
          gap: Space.sm,
        },
        // ── Color section toggle ──
        colorSectionToggle: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
          paddingVertical: Space.xs,
          minHeight: 44,
        },
        colorWell: {
          width: 28,
          height: 28,
          borderRadius: Radius.sm,
          borderWidth: Stroke.hairline,
          borderColor: 'rgba(0,0,0,0.1)',
        },
        colorWellLabel: {
          fontFamily: Typography.family.medium,
          fontSize: Type.caption.size,
          flex: 1,
        },
        // ── Slider ──
        sliderRow: {
          paddingVertical: Space.xs,
        },
        sliderHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: Space.xxs,
        },
        sliderLabel: {
          fontFamily: Typography.family.regular,
          fontSize: Type.caption.size,
        },
        sliderValue: {
          fontFamily: Typography.family.medium,
          fontSize: Type.caption.size,
          fontVariant: ['tabular-nums'],
        },
        trackWrap: {
          height: Control.hit,
          justifyContent: 'center',
          position: 'relative',
        },
        track: {
          position: 'absolute',
          left: 0,
          right: 0,
          height: 3,
          borderRadius: Radius.full,
        },
        fill: {
          position: 'absolute',
          left: 0,
          height: 3,
          borderRadius: Radius.full,
        },
        thumb: {
          position: 'absolute',
          width: 16,
          height: 16,
          borderRadius: Radius.full,
          marginLeft: -8,
          borderWidth: Stroke.standard,
          borderColor: 'rgba(0,0,0,0)',
        },
        // ── Animation ──
        animContent: {
          gap: Space.sm,
          paddingRight: Space.md,
          position: 'relative',
        },
        animTab: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.smMd,
          height: Control.hit,
        },
        animTabLabel: {
          fontFamily: Typography.family.medium,
          fontSize: Type.caption.size,
        },
        // ── Confirm ──
        confirmBtn: {
          backgroundColor: colors.brand,
          borderRadius: Radius.lg,
          height: 50,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Space.xs,
          marginTop: Space.sm,
        },
        confirmBtnDisabled: {
          backgroundColor: colors.surfaceAlt,
        },
        confirmBtnText: {
          fontFamily: FontFamily.semibold,
          fontSize: Type.bodyStrong.size,
          color: colors.textInverse,
        },
      }),
    [colors],
  );
}
