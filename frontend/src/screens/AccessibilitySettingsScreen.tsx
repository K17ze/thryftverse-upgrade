/**
 * AccessibilitySettingsScreen — text size, reduced motion, high contrast.
 *
 * Integrates with React Native's Accessibility API and the app's theme
 * system to provide user-controlled accessibility preferences.
 *
 * Per AGENTS.md §4: flat canvas with hairline separators. Toggle rows use
 * SettingsRow with transparent icon hit targets. Text size uses a visual
 * segmented selector with live preview.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView } from 'react-native';
import type { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Typography, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { AnimatedPressable } from '../components/AnimatedPressable';
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
    setScreenReaderHints: setContextScreenReaderHints } = useAccessibilityPreferences();

  // Live preview text — shows the user exactly how their selected text size
  // and bold setting will look in context.
  // immediate feedback on settings reduces uncertainty and builds confidence
  // that the change is real.
  const previewFontSize = TEXT_SIZES.find((t) => t.value === textSize)?.sample ?? TypographyV2.body.size;

  const motionToggles: ToggleConfig[] = [
    {
      key: 'reducedMotion',
      label: 'Reduce motion',
      description: 'Minimise animations and transitions',
      icon: 'pause-outline',
      iconColor: colors.commerceTrust,
      value: reducedMotion,
      onToggle: (v) => { haptic.selection(); setContextReducedMotion(v); } },
  ];

  const displayToggles: ToggleConfig[] = [
    {
      key: 'highContrast',
      label: 'High contrast',
      description: 'Increase contrast between text and backgrounds',
      icon: 'contrast-outline',
      iconColor: colors.antiqueGold,
      value: highContrast,
      onToggle: (v) => { haptic.selection(); setContextHighContrast(v); } },
    {
      key: 'boldText',
      label: 'Bold text',
      description: 'Make all text heavier for better readability',
      icon: 'text-outline',
      iconColor: colors.brand,
      value: boldText,
      onToggle: (v) => { haptic.selection(); setContextBoldText(v); } },
  ];

  const readerToggles: ToggleConfig[] = [
    {
      key: 'screenReaderHints',
      label: 'Additional hints',
      description: 'Provide extra context for screen reader users',
      icon: 'volume-medium-outline',
      iconColor: colors.bronze,
      value: screenReaderHints,
      onToggle: (v) => { haptic.selection(); setContextScreenReaderHints(v); } },
  ];

  const renderToggleRow = (config: ToggleConfig, index: number, total: number) => (
    <SettingsRow
      key={config.key}
      icon={config.icon}
      iconColor={config.iconColor}
      title={config.label}
      subtitle={config.description}
      toggleValue={config.value}
      onToggle={config.onToggle}
      isFirst={index === 0}
      isLast={index === total - 1}
    />
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
        {/* Text Size — visual segmented selector with live preview */}
        <SettingsSection title="Text size" description="Adjust the size of text throughout the app. Works with your device's text size settings.">
          <View style={styles.textSizeOptions}>
            {TEXT_SIZES.map((option, index) => {
              const isSelected = textSize === option.value;
              return (
                <AnimatedPressable
                  key={option.value}
                  scaleValue={0.98}
                  hapticFeedback="light"
                  style={[
                    styles.textSizeOption,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
                    isSelected && { backgroundColor: colors.brand },
                  ]}
                  onPress={() => { haptic.selection(); setContextTextSize(option.value); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Text size ${option.label}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    maxFontSizeMultiplier={1.5}
                    style={[
                      styles.textSizeSample,
                      { fontSize: option.sample },
                      isSelected && { color: colors.textInverse },
                    ]}
                  >
                    Aa
                  </Text>
                  <Text
                    maxFontSizeMultiplier={1.5}
                    style={[
                      styles.textSizeLabel,
                      isSelected && { color: colors.textInverse },
                    ]}
                  >
                    {option.label}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>

          {/* Live preview — flat text block, no card wrapper.
              Shows how body text will look at the selected size and weight. */}
          <Text maxFontSizeMultiplier={1.5} style={styles.previewLabel}>Preview</Text>
          <Text
            maxFontSizeMultiplier={1.5}
            style={[
              styles.previewText,
              {
                fontSize: previewFontSize,
                fontFamily: boldText ? Typography.family.bold : Typography.family.regular,
                color: colors.textPrimary,
                lineHeight: previewFontSize + 6 },
            ]}
          >
            Browse curated fashion from independent sellers. Every piece is hand-listed — no mass-market noise, just the good stuff.
          </Text>
        </SettingsSection>

        {/* Motion */}
        <SettingsSection title="Motion">
          {motionToggles.map((cfg, i) => renderToggleRow(cfg, i, motionToggles.length))}
        </SettingsSection>

        {/* Display */}
        <SettingsSection title="Display">
          {displayToggles.map((cfg, i) => renderToggleRow(cfg, i, displayToggles.length))}
        </SettingsSection>

        {/* Screen Reader */}
        <SettingsSection title="Screen reader">
          {readerToggles.map((cfg, i) => renderToggleRow(cfg, i, readerToggles.length))}
        </SettingsSection>

        {/* Info note — flat row, no card wrapper */}
        <SettingsSection title="Device settings">
          <SettingsRow
            icon="information-circle-outline"
            title="Works with your device"
            subtitle="These settings work alongside your device's built-in accessibility features."
            isFirst
            isLast
          />
        </SettingsSection>

        <View style={{ height: Space.xxl }} />
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },

    // Text size selector
    textSizeOptions: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      overflow: 'hidden' },
    textSizeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.md },
    textSizeSample: {
      fontFamily: Typography.family.bold,
      color: colors.textPrimary },
    textSizeLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    previewLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: LetterSpacing.caps,
      marginTop: Space.md,
      marginBottom: Space.sm },
    previewText: {
      letterSpacing: -0.2 } });
}
