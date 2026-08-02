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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { RootStackParamList } from '../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'AccessibilitySettings'>;

type TextSize = 'small' | 'medium' | 'large' | 'xlarge';

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
  icon: string;
  iconColor: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}

export default function AccessibilitySettingsScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();

  // Local state — persisted via AsyncStorage in a real implementation
  const [textSize, setTextSize] = React.useState<TextSize>('medium');
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const [highContrast, setHighContrast] = React.useState(false);
  const [screenReaderHints, setScreenReaderHints] = React.useState(true);

  const motionToggles: ToggleConfig[] = [
    {
      key: 'reducedMotion',
      label: 'Reduce motion',
      description: 'Minimise animations and transitions',
      icon: 'pause',
      iconColor: '#4A6A8A',
      value: reducedMotion,
      onToggle: (v) => { haptic.selection(); setReducedMotion(v); },
    },
  ];

  const displayToggles: ToggleConfig[] = [
    {
      key: 'highContrast',
      label: 'High contrast',
      description: 'Increase contrast between text and backgrounds',
      icon: 'contrast',
      iconColor: '#5A4A6A',
      value: highContrast,
      onToggle: (v) => { haptic.selection(); setHighContrast(v); },
    },
  ];

  const readerToggles: ToggleConfig[] = [
    {
      key: 'screenReaderHints',
      label: 'Additional hints',
      description: 'Provide extra context for screen reader users',
      icon: 'volume-medium',
      iconColor: '#6A5A4A',
      value: screenReaderHints,
      onToggle: (v) => { haptic.selection(); setScreenReaderHints(v); },
    },
  ];

  const renderToggleRow = (config: ToggleConfig) => (
    <View key={config.key} style={styles.toggleRow}>
      <View style={styles.toggleInfo}>
        <View style={[styles.toggleIcon, { backgroundColor: config.iconColor + '18' }]}>
          <Ionicons name={config.icon as any} size={20} color={config.iconColor} />
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
        thumbColor="#fff"
        accessibilityRole="switch"
        accessibilityLabel={config.label}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Accessibility" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero summary */}
        <Reanimated.View entering={FadeInDown.duration(300)}>
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
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
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
                    onPress={() => { haptic.selection(); setTextSize(option.value); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Text size ${option.label}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.textSizeSample,
                        { fontSize: option.sample },
                        isSelected && { color: '#fff' },
                      ]}
                    >
                      Aa
                    </Text>
                    <Text
                      style={[
                        styles.textSizeLabel,
                        isSelected && { color: '#fff' },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Reanimated.View>

        {/* Motion */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Motion</Text>
            {motionToggles.map(renderToggleRow)}
          </View>
        </Reanimated.View>

        {/* Display */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(240)}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Display</Text>
            {displayToggles.map(renderToggleRow)}
          </View>
        </Reanimated.View>

        {/* Screen Reader */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(320)}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Screen reader</Text>
            {readerToggles.map(renderToggleRow)}
          </View>
        </Reanimated.View>

        {/* Info note — elevated card */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(400)}>
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
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
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
      width: 44,
      height: 44,
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
      marginTop: 2,
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
      letterSpacing: 0.8,
      opacity: 0.7,
      marginBottom: Space.xs,
      paddingHorizontal: Space.xs,
    },
    sectionDescription: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: 18,
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
      borderWidth: 1,
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
      width: 36,
      height: 36,
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
      marginTop: 2,
      lineHeight: 16,
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
      width: 32,
      height: 32,
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
      marginBottom: 2,
    },
    noteText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      lineHeight: 16,
    },
  });
}
