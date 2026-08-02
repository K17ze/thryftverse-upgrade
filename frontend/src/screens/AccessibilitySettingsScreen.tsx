/**
 * AccessibilitySettingsScreen — text size, reduced motion, high contrast.
 *
 * Integrates with React Native's Accessibility API and the app's theme
 * system to provide user-controlled accessibility preferences.
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
  { value: 'xlarge', label: 'Extra Large', sample: 19 },
];

export default function AccessibilitySettingsScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();

  // Local state — persisted via AsyncStorage in a real implementation
  const [textSize, setTextSize] = React.useState<TextSize>('medium');
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const [highContrast, setHighContrast] = React.useState(false);
  const [screenReaderHints, setScreenReaderHints] = React.useState(true);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Accessibility" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Text Size */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Text Size</Text>
          <Text style={styles.sectionDescription}>
            Adjust the size of text throughout the app. This works with your device's text size settings.
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

        {/* Motion */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Motion</Text>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Ionicons name="pause-outline" size={20} color={colors.textSecondary} />
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Reduce motion</Text>
                <Text style={styles.toggleDescription}>
                  Minimise animations and transitions
                </Text>
              </View>
            </View>
            <Switch
              value={reducedMotion}
              onValueChange={(v) => { haptic.selection(); setReducedMotion(v); }}
              trackColor={{ false: colors.surfaceAlt, true: colors.brand }}
              thumbColor="#fff"
              accessibilityRole="switch"
              accessibilityLabel="Reduce motion"
            />
          </View>
        </View>

        {/* Display */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Display</Text>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Ionicons name="contrast-outline" size={20} color={colors.textSecondary} />
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>High contrast</Text>
                <Text style={styles.toggleDescription}>
                  Increase contrast between text and backgrounds
                </Text>
              </View>
            </View>
            <Switch
              value={highContrast}
              onValueChange={(v) => { haptic.selection(); setHighContrast(v); }}
              trackColor={{ false: colors.surfaceAlt, true: colors.brand }}
              thumbColor="#fff"
              accessibilityRole="switch"
              accessibilityLabel="High contrast"
            />
          </View>
        </View>

        {/* Screen Reader */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Screen Reader</Text>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Ionicons name="volume-medium-outline" size={20} color={colors.textSecondary} />
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Additional hints</Text>
                <Text style={styles.toggleDescription}>
                  Provide extra context for screen reader users
                </Text>
              </View>
            </View>
            <Switch
              value={screenReaderHints}
              onValueChange={(v) => { haptic.selection(); setScreenReaderHints(v); }}
              trackColor={{ false: colors.surfaceAlt, true: colors.brand }}
              thumbColor="#fff"
              accessibilityRole="switch"
              accessibilityLabel="Additional screen reader hints"
            />
          </View>
        </View>

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.noteText}>
            These settings work alongside your device's built-in accessibility features.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
    section: {
      marginTop: Space.lg,
    },
    sectionTitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      marginBottom: Space.xs,
    },
    sectionDescription: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: Space.md,
    },
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
    note: {
      flexDirection: 'row',
      gap: Space.xs,
      marginTop: Space.xl,
      paddingHorizontal: Space.sm,
    },
    noteText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      lineHeight: 16,
      flex: 1,
    },
  });
}
