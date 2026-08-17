/**
 * AccessibilitySettingsScreen — text size, reduced motion, high contrast.
 *
 * Integrates with React Native's Accessibility API and the app's theme
 * system to provide user-controlled accessibility preferences.
 *
 * Per Design.md: utility canvas mode. Text size uses a visual segmented
 * selector with live preview. Toggle rows use coloured icon badges for
 * visual identity per setting.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { RootStackParamList } from '../navigation/types';
import { useAccessibilityPreferences } from '../context/AccessibilityPreferencesContext';
import type { TextSize } from '../preferences/accessibilityPreferences';

type Props = NativeStackScreenProps<RootStackParamList, 'AccessibilitySettings'>;

const TEXT_SIZES: { value: TextSize; label: string; sample: number }[] = [
  { value: 'small', label: 'Small', sample: 13 },
  { value: 'medium', label: 'Medium', sample: 15 },
  { value: 'large', label: 'Large', sample: 17 },
  { value: 'xlarge', label: 'XL', sample: 19 },
];

interface ToggleConfig {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}

export default function AccessibilitySettingsScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const reducedMotionEnabled = useReducedMotion();
  const {
    textSize,
    reducedMotion,
    highContrast,
    boldText,
    screenReaderHints,
    setTextSize: setContextTextSize,
    setReducedMotion: setContextReducedMotion,
    setHighContrast: setContextHighContrast,
    setBoldText: setContextBoldText,
    setScreenReaderHints: setContextScreenReaderHints,
  } = useAccessibilityPreferences();

  // Live preview text — shows the user exactly how their selected text size
  // and bold setting will look in context.
  // immediate feedback on settings reduces uncertainty and builds confidence
  // that the change is real.
  const previewFontSize = TEXT_SIZES.find((t) => t.value === textSize)?.sample ?? Type.body.size;

  const motionToggles: ToggleConfig[] = [
    {
      key: 'reducedMotion',
      label: 'Reduce motion',
      description: 'Minimise animations and transitions',
      icon: 'pause',
      iconColor: colors.commerceTrust,
      value: reducedMotion,
      onToggle: (v) => { haptic.selection(); setContextReducedMotion(v); },
    },
  ];

  const displayToggles: ToggleConfig[] = [
    {
      key: 'highContrast',
      label: 'High contrast',
      description: 'Increase contrast between text and backgrounds',
      icon: 'contrast',
      iconColor: colors.antiqueGold,
      value: highContrast,
      onToggle: (v) => { haptic.selection(); setContextHighContrast(v); },
    },
    {
      key: 'boldText',
      label: 'Bold text',
      description: 'Make all text heavier for better readability',
      icon: 'text',
      iconColor: colors.brand,
      value: boldText,
      onToggle: (v) => { haptic.selection(); setContextBoldText(v); },
    },
  ];

  const readerToggles: ToggleConfig[] = [
    {
      key: 'screenReaderHints',
      label: 'Additional hints',
      description: 'Provide extra context for screen reader users',
      icon: 'volume-medium',
      iconColor: colors.bronze,
      value: screenReaderHints,
      onToggle: (v) => { haptic.selection(); setContextScreenReaderHints(v); },
    },
  ];

  const renderToggleRow = (config: ToggleConfig) => (
    <View key={config.key} style={styles.toggleRow}>
      <View style={styles.toggleInfo}>
        <View style={[styles.toggleIcon, { backgroundColor: config.iconColor + '18' }]}>
          <Ionicons name={config.icon} size={20} color={config.iconColor} />
        </View>
        <View style={styles.toggleText}>
          <Text style={styles.toggleLabel}>{config.label}</Text>
          <Text style={styles.toggleDescription}>{config.description}</Text>
        </View>
      </View>
      <Switch
        value={config.value}
        onValueChange={config.onToggle}
        trackColor={{ false: colors.surfaceAlt, true: colors.brand }}
        thumbColor={colors.textInverse}
        accessibilityRole="switch"
        accessibilityLabel={config.label}
      />
    </View>
  );

  return (
    <FlagshipScreen
      scrollEnabled={false}
      header={<FlagshipHeader title="Accessibility" onBack={() => navigation.goBack()} />}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero summary */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <View style={styles.heroCard}>
            <View style={styles.heroIconRow}>
              <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                <Ionicons name="accessibility" size={22} color={colors.textInverse} />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Accessibility</Text>
                <Text style={styles.heroSubtitle}>
                  Customise how ThryftVerse looks and feels
                </Text>
              </View>
            </View>
          </View>
        </Reanimated.View>

        {/* Text Size — visual segmented selector */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Text size</Text>
            <Text style={styles.sectionDescription}>
              Adjust the size of text throughout the app. Works with your device's text size settings.
            </Text>
            <View style={styles.textSizeOptions}>
              {TEXT_SIZES.map((option) => {
                const isSelected = textSize === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.textSizeOption,
                      isSelected && { backgroundColor: colors.brand, borderColor: colors.brand },
                    ]}
                    onPress={() => { haptic.selection(); setContextTextSize(option.value); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Text size ${option.label}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.textSizeSample,
                        { fontSize: option.sample },
                        isSelected && { color: colors.textInverse },
                      ]}
                    >
                      Aa
                    </Text>
                    <Text
                      style={[
                        styles.textSizeLabel,
                        isSelected && { color: colors.textInverse },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Live preview — shows how body text will look at the selected
                size and weight. This is the immediate feedback that makes
                the setting feel real and trustworthy. */}
            <View style={[styles.previewCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Text style={styles.previewLabel}>Preview</Text>
              <Text
                style={[
                  styles.previewText,
                  {
                    fontSize: previewFontSize,
                    fontFamily: boldText ? Typography.family.bold : Typography.family.regular,
                    color: colors.textPrimary,
                    lineHeight: previewFontSize + 6,
                  },
                ]}
              >
                Browse curated fashion from independent sellers. Every piece is hand-listed — no mass-market noise, just the good stuff.
              </Text>
            </View>
          </View>
        </Reanimated.View>

        {/* Motion */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Motion</Text>
            {motionToggles.map(renderToggleRow)}
          </View>
        </Reanimated.View>

        {/* Display */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Display</Text>
            {displayToggles.map(renderToggleRow)}
          </View>
        </Reanimated.View>

        {/* Screen Reader */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Screen reader</Text>
            {readerToggles.map(renderToggleRow)}
          </View>
        </Reanimated.View>

        {/* Info note — elevated card */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <View style={styles.noteCard}>
            <View style={styles.noteIconWrap}>
              <Ionicons name="information-circle" size={18} color={colors.textMuted} />
            </View>
            <View style={styles.noteTextWrap}>
              <Text style={styles.noteTitle}>Works with your device</Text>
              <Text style={styles.noteText}>
                These settings work alongside your device's built-in accessibility features.
              </Text>
            </View>
          </View>
        </Reanimated.View>

        <View style={{ height: Space.xxl }} />
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },

    // Hero summary
    heroCard: {
      borderRadius: Radius.xl,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.lg,
      marginTop: Space.sm,
    },
    heroIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    heroIcon: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroText: { flex: 1 },
    heroTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    heroSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      marginTop: Space.xs - 2,
    },

    // Sections
    section: {
      marginTop: Space.lg,
    },
    sectionTitle: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: LetterSpacing.caps,
      opacity: 0.7,
      marginBottom: Space.xs,
      paddingHorizontal: Space.xs,
    },
    sectionDescription: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.captionElevated.lineHeight,
      marginBottom: Space.md,
      paddingHorizontal: Space.xs,
    },

    // Text size selector
    textSizeOptions: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    textSizeOption: {
      flex: 1,
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    textSizeSample: {
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
    },
    textSizeLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
    },
    previewCard: {
      marginTop: Space.md,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
    },
    previewLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: LetterSpacing.caps,
      marginBottom: Space.sm,
    },
    previewText: {
      letterSpacing: -0.2,
    },

    // Toggle rows
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
    },
    toggleInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      flex: 1,
    },
    toggleIcon: {
      width: Control.chrome,
      height: Control.chrome,
      borderRadius: Radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    toggleText: { flex: 1 },
    toggleLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    toggleDescription: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: Space.xs - 2,
      lineHeight: Type.caption.lineHeight,
    },

    // Info note — elevated card
    noteCard: {
      flexDirection: 'row',
      gap: Space.md,
      marginTop: Space.lg,
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
    },
    noteIconWrap: {
      width: Control.chromeCompact,
      height: Control.chromeCompact,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    noteTextWrap: { flex: 1 },
    noteTitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      marginBottom: Space.xs - 2,
    },
    noteText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      lineHeight: Type.caption.lineHeight,
    },
  });
}
