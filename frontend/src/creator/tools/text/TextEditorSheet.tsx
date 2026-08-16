/**
 * TextEditorSheet — bottom sheet for text editing.
 *
 * Extracted from CreatorAssetPicker's monolithic TextPicker (spec
 * 07_MEDIA_TOOLCHAIN). Provides:
 *   - TextInput (auto-focus on open)
 *   - FontChooserRail below the input
 *   - Color picker row (8 preset colors + custom spectrum)
 *   - Alignment toggle (left/center/right)
 *   - Background toggle (none/pill/outline)
 *   - Stroke toggle (none/thin/thick)
 *   - Shadow toggle (none/soft/strong)
 *   - Animation selector (fade/rise/type/pop/slide)
 *   - Done button
 *
 * The sheet is self-contained and emits a TextStyleConfig on confirm.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Space,
  Radius,
  Type,
  Typography,
  Stroke,
} from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../../CreatorAnimations';
import { KeyboardAwareScrollView } from '../../../platform/keyboard/KeyboardProvider';
import { useHaptic } from '../../../hooks/useHaptic';
import { FontChooserRail } from './FontChooserRail';
import {
  TEXT_STYLE_PRESETS,
  DEFAULT_TEXT_STYLE,
  resolvePreviewStyle,
  type TextStyleConfig,
  type TextStylePreset,
} from './textStylePresets';

export interface TextEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  initialText: string;
  initialStyle?: Partial<TextStyleConfig>;
  onConfirm: (text: string, style: TextStyleConfig) => void;
}

// ── Static option sets ────────────────────────────────────────────────
const PRESET_COLORS = [
  '#ffffff',
  '#000000',
  '#9b0202',
  '#215634',
  '#06489A',
  '#C9A46A',
  '#6B3245',
  '#B85566',
];

type AlignmentKey = 'left' | 'center' | 'right';
const ALIGNMENTS: Array<{ key: AlignmentKey; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { key: 'left', icon: 'text-outline' },
  { key: 'center', icon: 'text' },
  { key: 'right', icon: 'list-outline' },
];

type BackgroundKey = 'none' | 'pill' | 'outline';
const BACKGROUNDS: Array<{ key: BackgroundKey; label: string }> = [
  { key: 'none', label: 'None' },
  { key: 'pill', label: 'Pill' },
  { key: 'outline', label: 'Outline' },
];

type StrokeKey = 'none' | 'thin' | 'thick';
const STROKES: Array<{ key: StrokeKey; label: string }> = [
  { key: 'none', label: 'None' },
  { key: 'thin', label: 'Thin' },
  { key: 'thick', label: 'Thick' },
];

type ShadowKey = 'none' | 'soft' | 'strong';
const SHADOWS: Array<{ key: ShadowKey; label: string }> = [
  { key: 'none', label: 'None' },
  { key: 'soft', label: 'Soft' },
  { key: 'strong', label: 'Strong' },
];

type AnimationKey = 'none' | 'fade' | 'rise' | 'type' | 'pop' | 'slide';
const ANIMATIONS: Array<{ key: AnimationKey; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { key: 'none', label: 'None', icon: 'close-outline' },
  { key: 'fade', label: 'Fade', icon: 'eye-outline' },
  { key: 'rise', label: 'Rise', icon: 'arrow-up-outline' },
  { key: 'type', label: 'Type', icon: 'keypad-outline' },
  { key: 'pop', label: 'Pop', icon: 'add-circle-outline' },
  { key: 'slide', label: 'Slide', icon: 'arrow-forward-outline' },
];

// Map the editor-local animation keys to the composition payload keys.
const ANIMATION_TO_PAYLOAD: Record<AnimationKey, TextStyleConfig['textAnimation']> = {
  none: 'none',
  fade: 'fade',
  rise: 'slide',
  type: 'typewriter',
  pop: 'bounce',
  slide: 'slide',
};

// Map background/stroke/shadow toggles to the composition textEffect field.
// The composition schema models effects as a single enum; we map the
// three-toggle UI onto that enum plus the backgroundColor field.
function resolveEffect(
  bg: BackgroundKey,
  stroke: StrokeKey,
  shadow: ShadowKey,
): { textEffect: TextStyleConfig['textEffect']; backgroundColor?: string; textColor: string } {
  // Stroke takes priority for the textEffect enum, then shadow, then bg.
  if (stroke === 'thin' || stroke === 'thick') {
    return { textEffect: 'outline', textColor: '#ffffff' };
  }
  if (shadow === 'soft' || shadow === 'strong') {
    return { textEffect: 'shadow', textColor: '#ffffff' };
  }
  if (bg === 'pill') {
    return { textEffect: 'none', backgroundColor: '#000000', textColor: '#ffffff' };
  }
  if (bg === 'outline') {
    return { textEffect: 'outline', textColor: '#ffffff' };
  }
  return { textEffect: 'none', textColor: '#ffffff' };
}

const { width: SCREEN_W } = Dimensions.get('window');

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

  const [text, setText] = useState(initialText);
  const [presetId, setPresetId] = useState<string>(initialStyle?.textStyle ?? DEFAULT_TEXT_STYLE.textStyle);
  const [textColor, setTextColor] = useState<string>(initialStyle?.textColor ?? DEFAULT_TEXT_STYLE.textColor);
  const [alignment, setAlignment] = useState<AlignmentKey>(initialStyle?.alignment ?? DEFAULT_TEXT_STYLE.alignment);
  const [bgMode, setBgMode] = useState<BackgroundKey>('none');
  const [strokeMode, setStrokeMode] = useState<StrokeKey>('none');
  const [shadowMode, setShadowMode] = useState<ShadowKey>('none');
  const [animation, setAnimation] = useState<AnimationKey>('none');
  const [showSpectrum, setShowSpectrum] = useState(false);

  // Reset state when the sheet opens with a new initial value.
  useEffect(() => {
    if (visible) {
      setText(initialText);
      setPresetId(initialStyle?.textStyle ?? DEFAULT_TEXT_STYLE.textStyle);
      setTextColor(initialStyle?.textColor ?? DEFAULT_TEXT_STYLE.textColor);
      setAlignment(initialStyle?.alignment ?? DEFAULT_TEXT_STYLE.alignment);
      setBgMode('none');
      setStrokeMode('none');
      setShadowMode('none');
      setAnimation('none');
      setShowSpectrum(false);
      // Auto-focus the input on open.
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [visible, initialText, initialStyle]);

  const handleConfirm = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const resolved = resolveEffect(bgMode, strokeMode, shadowMode);
    const style: TextStyleConfig = {
      text: trimmed,
      textStyle: presetId,
      textColor,
      backgroundColor: resolved.backgroundColor,
      alignment,
      opacity: 1,
      textEffect: resolved.textEffect,
      textAnimation: ANIMATION_TO_PAYLOAD[animation],
    };
    haptic.light();
    onConfirm(trimmed, style);
  }, [text, presetId, textColor, alignment, bgMode, strokeMode, shadowMode, animation, haptic, onConfirm]);

  const previewStyle = useMemo(
    () => resolvePreviewStyle(presetId, Type.bodyEmphasis.size + 2),
    [presetId],
  );

  const canConfirm = text.trim().length > 0;

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
          {/* Live preview */}
          <View style={styles.preview}>
            <Text
              style={[
                styles.previewText,
                { color: textColor, textAlign: alignment, fontFamily: previewStyle.fontFamily },
              ]}
              numberOfLines={3}
            >
              {text.trim() || 'Your text preview'}
            </Text>
          </View>

          {/* Text input */}
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

          {/* Font chooser rail */}
          <Text style={styles.sectionLabel}>Font</Text>
          <FontChooserRail
            text={text}
            presets={TEXT_STYLE_PRESETS}
            selectedId={presetId}
            onSelect={setPresetId}
          />

          {/* Color picker row */}
          <Text style={styles.sectionLabel}>Color</Text>
          <View style={styles.colorRow}>
            {PRESET_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => { haptic.selection(); setTextColor(c); setShowSpectrum(false); }}
                onLongPress={() => { haptic.medium(); setTextColor(c); setShowSpectrum(true); }}
                style={[
                  styles.colorOption,
                  { backgroundColor: c },
                  textColor === c && !showSpectrum && styles.colorOptionActive,
                ]}
                accessibilityLabel={`Text color ${c}`}
                accessibilityRole="button"
                accessibilityState={{ selected: textColor === c && !showSpectrum }}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              />
            ))}
            <Pressable
              onPress={() => { haptic.selection(); setShowSpectrum((v) => !v); }}
              style={[
                styles.colorOption,
                styles.colorOptionCustom,
                showSpectrum && styles.colorOptionActive,
              ]}
              accessibilityLabel="Custom color"
              accessibilityRole="button"
              accessibilityState={{ selected: showSpectrum }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Ionicons name="color-palette-outline" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Spectrum picker */}
          {showSpectrum && (
            <View style={styles.spectrumWrap}>
              <LinearGradient
                colors={['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.spectrumBar}
              >
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={(e) => {
                    const { locationX } = e.nativeEvent;
                    const ratio = Math.max(0, Math.min(1, locationX / (SCREEN_W - Space.md * 2 - 4)));
                    const hue = ratio * 360;
                    const hex = hslToHex(hue, 80, 55);
                    setTextColor(hex);
                  }}
                  accessibilityLabel="Spectrum color picker"
                  accessibilityRole="adjustable"
                />
              </LinearGradient>
              <View style={[styles.spectrumIndicator, { backgroundColor: textColor }]} />
            </View>
          )}

          {/* Alignment */}
          <Text style={styles.sectionLabel}>Alignment</Text>
          <View style={styles.toggleRow}>
            {ALIGNMENTS.map((a) => {
              const isActive = alignment === a.key;
              return (
                <Pressable
                  key={a.key}
                  onPress={() => { haptic.selection(); setAlignment(a.key); }}
                  style={[styles.toggleOption, isActive && styles.toggleOptionActive]}
                  accessibilityLabel={`Align ${a.key}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Ionicons name={a.icon} size={18} color={isActive ? colors.brand : colors.textSecondary} />
                </Pressable>
              );
            })}
          </View>

          {/* Background toggle */}
          <Text style={styles.sectionLabel}>Background</Text>
          <View style={styles.toggleRow}>
            {BACKGROUNDS.map((b) => {
              const isActive = bgMode === b.key;
              return (
                <Pressable
                  key={b.key}
                  onPress={() => { haptic.selection(); setBgMode(b.key); }}
                  style={[styles.toggleOption, isActive && styles.toggleOptionActive]}
                  accessibilityLabel={`Background ${b.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text
                    style={[
                      styles.toggleLabel,
                      { color: isActive ? colors.brand : colors.textSecondary },
                    ]}
                  >
                    {b.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Stroke toggle */}
          <Text style={styles.sectionLabel}>Stroke</Text>
          <View style={styles.toggleRow}>
            {STROKES.map((s) => {
              const isActive = strokeMode === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => { haptic.selection(); setStrokeMode(s.key); }}
                  style={[styles.toggleOption, isActive && styles.toggleOptionActive]}
                  accessibilityLabel={`Stroke ${s.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text
                    style={[
                      styles.toggleLabel,
                      { color: isActive ? colors.brand : colors.textSecondary },
                    ]}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Shadow toggle */}
          <Text style={styles.sectionLabel}>Shadow</Text>
          <View style={styles.toggleRow}>
            {SHADOWS.map((s) => {
              const isActive = shadowMode === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => { haptic.selection(); setShadowMode(s.key); }}
                  style={[styles.toggleOption, isActive && styles.toggleOptionActive]}
                  accessibilityLabel={`Shadow ${s.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text
                    style={[
                      styles.toggleLabel,
                      { color: isActive ? colors.brand : colors.textSecondary },
                    ]}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Animation selector */}
          <Text style={styles.sectionLabel}>Animation</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.animContent}>
            {ANIMATIONS.map((a) => {
              const isActive = animation === a.key;
              return (
                <Pressable
                  key={a.key}
                  onPress={() => { haptic.selection(); setAnimation(a.key); }}
                  style={[styles.animChip, isActive && styles.animChipActive]}
                  accessibilityLabel={`Animation ${a.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Ionicons name={a.icon} size={20} color={isActive ? colors.brand : colors.textSecondary} />
                  <Text
                    style={[
                      styles.animChipLabel,
                      { color: isActive ? colors.brand : colors.textSecondary },
                    ]}
                  >
                    {a.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Done button */}
          <Pressable
            onPress={handleConfirm}
            style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
            disabled={!canConfirm}
            accessibilityLabel="Done"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canConfirm }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.confirmBtnText}>Done</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </SheetContainer>
  );
}

// ── HSL → HEX (for the spectrum color picker) ─────────────────────────
function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
          width: 36,
          height: 36,
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
        },
        previewText: {
          fontSize: Type.bodyEmphasis.size + 2,
          fontFamily: Typography.family.medium,
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
          fontSize: Type.metaElevated.size,
          letterSpacing: Type.metaElevated.letterSpacing,
          textTransform: 'uppercase',
          color: colors.textSecondary,
          marginTop: Space.xs,
        },
        colorRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: Space.sm,
        },
        colorOption: {
          width: 36,
          height: 36,
          borderRadius: Radius.full,
          borderWidth: Stroke.standard,
          borderColor: colors.borderSubtle,
        },
        colorOptionActive: {
          borderWidth: Stroke.emphasis,
          borderColor: colors.brand,
        },
        colorOptionCustom: {
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceAlt,
        },
        spectrumWrap: {
          marginTop: Space.xs,
          gap: Space.xs,
        },
        spectrumBar: {
          height: 36,
          borderRadius: Radius.full,
          overflow: 'hidden',
        },
        spectrumIndicator: {
          width: 36,
          height: 12,
          borderRadius: Radius.full,
          alignSelf: 'center',
        },
        toggleRow: {
          flexDirection: 'row',
          gap: Space.sm,
        },
        toggleOption: {
          flex: 1,
          height: 40,
          borderRadius: Radius.md,
          borderWidth: Stroke.standard,
          borderColor: colors.borderSubtle,
          alignItems: 'center',
          justifyContent: 'center',
        },
        toggleOptionActive: {
          borderWidth: Stroke.emphasis,
          borderColor: colors.brand,
        },
        toggleLabel: {
          fontFamily: Typography.family.medium,
          fontSize: Type.caption.size,
        },
        animContent: {
          gap: Space.sm,
          paddingRight: Space.md,
        },
        animChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.smMd,
          height: 40,
          borderRadius: Radius.md,
          borderWidth: Stroke.standard,
          borderColor: colors.borderSubtle,
        },
        animChipActive: {
          borderWidth: Stroke.emphasis,
          borderColor: colors.brand,
        },
        animChipLabel: {
          fontFamily: Typography.family.medium,
          fontSize: Type.caption.size,
        },
        confirmBtn: {
          backgroundColor: colors.brand,
          borderRadius: Radius.sm,
          height: 52,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: Space.sm,
        },
        confirmBtnDisabled: {
          opacity: 0.4,
        },
        confirmBtnText: {
          fontFamily: Typography.family.semibold,
          fontSize: Type.bodyEmphasis.size,
          color: colors.textInverse,
        },
      }),
    [colors],
  );
}
