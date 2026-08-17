/**
 * GreenScreenSheet — bottom sheet for green screen (chroma key) configuration.
 *
 * Real-time chroma keying is not feasible with expo-camera alone (no
 * frame-processor API). The user selects a background image and key
 * parameters; the video is recorded normally and the green screen effect
 * is applied in post-production via Skia. The settings are preserved in
 * CreatorInitialMedia.greenScreen so the timeline can re-render the
 * composite.
 *
 * This is a minimal stub — the full Skia processing pipeline is a future
 * phase. The sheet captures the user's intent (background + key color +
 * tolerance + feather) so the camera and timeline can store it.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, FontFamily, Control, Stroke } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { PressScale } from '../CreatorAnimations';
import { useHaptic } from '../../hooks/useHaptic';

// ── Settings type ────────────────────────────────────────────────────

export interface GreenScreenSettings {
  /** Background image URI to composite behind the subject. */
  backgroundUri: string;
  /** Chroma key color (hex string, e.g. '#00ff00' for green). */
  keyColor: string;
  /** Color tolerance — how similar a pixel must be to the key color to be removed (0–1). */
  tolerance: number;
  /** Edge feathering in pixels — softens the boundary between subject and background. */
  feather: number;
}

// ── Props ────────────────────────────────────────────────────────────

export interface GreenScreenSheetProps {
  visible: boolean;
  onCancel: () => void;
  onApply: (settings: GreenScreenSettings) => void;
  initialSettings?: GreenScreenSettings | null;
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_KEY_COLOR = '#00ff00';
const DEFAULT_TOLERANCE = 0.4;
const DEFAULT_FEATHER = 2;

const KEY_COLOR_PRESETS = [
  { label: 'Green', value: '#00ff00' },
  { label: 'Blue', value: '#0000ff' },
  { label: 'Red', value: '#ff0000' },
  { label: 'Black', value: '#000000' },
];

// ── Component ────────────────────────────────────────────────────────

export function GreenScreenSheet({
  visible,
  onCancel,
  onApply,
  initialSettings,
}: GreenScreenSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const [backgroundUri, setBackgroundUri] = useState(
    initialSettings?.backgroundUri ?? '',
  );
  const [keyColor, setKeyColor] = useState(
    initialSettings?.keyColor ?? DEFAULT_KEY_COLOR,
  );
  const [tolerance, setTolerance] = useState(
    initialSettings?.tolerance ?? DEFAULT_TOLERANCE,
  );
  const [feather, setFeather] = useState(
    initialSettings?.feather ?? DEFAULT_FEATHER,
  );

  if (!visible) return null;

  const handleApply = () => {
    haptic.light();
    onApply({ backgroundUri, keyColor, tolerance, feather });
  };

  const handleCancel = () => {
    haptic.light();
    onCancel();
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={handleCancel} />
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Green Screen
          </Text>
          <PressScale
            accessibilityLabel="Close green screen settings"
            accessibilityRole="button"
            onPress={handleCancel}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={Control.icon} color={colors.textPrimary} />
          </PressScale>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {/* Info banner — flat, hairline separator */}
          <View style={styles.infoBanner}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={colors.textSecondary}
              style={styles.infoIcon}
            />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Green screen is applied in post-production via Skia. The video is
              recorded normally and the chroma key effect is rendered on the timeline.
            </Text>
          </View>

          {/* Background selector placeholder */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Background
          </Text>
          <Pressable
            style={[styles.bgButton, { borderColor: colors.borderSubtle }]}
            onPress={() => {
              haptic.light();
              // Background picker would open here — stub uses a placeholder
            }}
          >
            <Ionicons
              name="image-outline"
              size={24}
              color={colors.textMuted}
            />
            <Text style={[styles.bgButtonText, { color: colors.textMuted }]}>
              {backgroundUri ? 'Background selected' : 'Select background image'}
            </Text>
          </Pressable>

          {/* Key color presets — underline selection */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Key Color
          </Text>
          <View style={styles.chipRow}>
            {KEY_COLOR_PRESETS.map((preset) => {
              const isActive = keyColor === preset.value;
              return (
                <PressScale
                  key={preset.value}
                  accessibilityLabel={`Select ${preset.label} key color`}
                  accessibilityRole="button"
                  onPress={() => {
                    haptic.selection();
                    setKeyColor(preset.value);
                  }}
                  style={styles.chip}
                >
                  <View style={[styles.colorSwatch, { backgroundColor: preset.value }]} />
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isActive ? colors.brand : colors.textSecondary,
                        textDecorationLine: isActive ? 'underline' : 'none',
                      },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </PressScale>
              );
            })}
          </View>

          {/* Tolerance control — underline selection */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Tolerance: {tolerance.toFixed(2)}
          </Text>
          <View style={styles.chipRow}>
            {[0.2, 0.3, 0.4, 0.5, 0.6].map((t) => {
              const isActive = tolerance === t;
              return (
                <PressScale
                  key={t}
                  accessibilityLabel={`Set tolerance to ${t.toFixed(1)}`}
                  accessibilityRole="button"
                  onPress={() => {
                    haptic.selection();
                    setTolerance(t);
                  }}
                  style={styles.chip}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isActive ? colors.brand : colors.textSecondary,
                        textDecorationLine: isActive ? 'underline' : 'none',
                      },
                    ]}
                  >
                    {t.toFixed(1)}
                  </Text>
                </PressScale>
              );
            })}
          </View>

          {/* Feather control — underline selection */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Edge Feather: {feather}px
          </Text>
          <View style={styles.chipRow}>
            {[1, 2, 4, 8].map((f) => {
              const isActive = feather === f;
              return (
                <PressScale
                  key={f}
                  accessibilityLabel={`Set feather to ${f} pixels`}
                  accessibilityRole="button"
                  onPress={() => {
                    haptic.selection();
                    setFeather(f);
                  }}
                  style={styles.chip}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isActive ? colors.brand : colors.textSecondary,
                        textDecorationLine: isActive ? 'underline' : 'none',
                      },
                    ]}
                  >
                    {f}px
                  </Text>
                </PressScale>
              );
            })}
          </View>
        </ScrollView>

        {/* Footer actions */}
        <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}>
          <PressScale
            accessibilityLabel="Cancel green screen"
            accessibilityRole="button"
            onPress={handleCancel}
            style={[styles.actionButton, { borderColor: colors.borderSubtle }]}
          >
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </PressScale>
          <PressScale
            accessibilityLabel="Apply green screen settings"
            accessibilityRole="button"
            onPress={handleApply}
            style={[styles.actionButton, styles.applyButton, { backgroundColor: colors.brand }]}
          >
            <Text style={[styles.actionText, { color: colors.textInverse }]}>
              Apply
            </Text>
          </PressScale>
        </View>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '85%',
    paddingBottom: 34, // safe area
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  title: {
    fontFamily: FontFamily.semibold,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  closeButton: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: Space.md,
  },
  bodyContent: {
    paddingBottom: Space.md,
    gap: Space.sm,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  infoIcon: {
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: Type.meta.letterSpacing,
  },
  label: {
    fontFamily: FontFamily.medium,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
    textTransform: 'uppercase',
  },
  bgButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    height: 50,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    borderStyle: 'dashed',
  },
  bgButtonText: {
    fontFamily: FontFamily.regular,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Space.md,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xs,
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  colorSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: Stroke.hairline,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  chipText: {
    fontFamily: FontFamily.medium,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
  },
  footer: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionButton: {
    flex: 1,
    height: 50,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Stroke.standard,
  },
  applyButton: {
    borderWidth: 0,
  },
  actionText: {
    fontFamily: FontFamily.semibold,
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
  },
});
