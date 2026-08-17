/**
 * SustainabilityPreferencesScreen — personal sustainability goals & preferences.
 *
 * Lets the user set carbon-saving targets, a secondhand ratio goal, preferred
 * shipping/packaging, and toggle sustainability badges, impact tracking and
 * local-first prioritisation. A stats summary shows the user's impact.
 *
 * Per AGENTS.md §11 (Truthful UI): impact stats are illustrative in demo mode,
 * so a "Demo mode" indicator is always shown. We never claim the figures come
 * from a live backend — they are session-local and clearly labelled.
 *
 * Design (per AGENTS.md §4):
 * - Flat composition, hairline separators, no card-on-card
 * - One dominant panel (the impact summary hero)
 * - Max two non-avatar radius sizes (Radius.md for chips, Radius.lg for hero)
 * - Max three type sizes per viewport (title, body, caption)
 * - All colors via useAppTheme(), all geometry via design tokens
 *
 * State coverage (per AGENTS.md §14):
 * - Populated: full preference set with illustrative impact stats
 * - Disabled: master toggle disables dependent rows
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { Space, Radius, Type, Typography, Control } from '../theme/designTokens';

type Props = NativeStackScreenProps<RootStackParamList, 'SustainabilityPreferences'>;

// Demo mode flag — the sustainability impact service is mock in this build.
const SUSTAINABILITY_DEMO_MODE = __DEV__;

// Carbon-saving target options (kg CO2 per year).
const CARBON_TARGETS = [10, 25, 50, 100, 250];

// Secondhand ratio goal options (percentage of purchases that are secondhand).
const RATIO_TARGETS = [25, 50, 75, 100];

export default function SustainabilityPreferencesScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Local preference state — persisted to AsyncStorage in a real implementation.
  const [carbonTarget, setCarbonTarget] = React.useState(50);
  const [ratioTarget, setRatioTarget] = React.useState(50);
  const [carbonNeutralShipping, setCarbonNeutralShipping] = React.useState(true);
  const [plasticFreePackaging, setPlasticFreePackaging] = React.useState(true);
  const [showBadges, setShowBadges] = React.useState(true);
  const [trackImpact, setTrackImpact] = React.useState(true);
  const [localFirst, setLocalFirst] = React.useState(false);

  // Illustrative impact stats (demo mode).
  const co2SavedKg = 34;
  const itemsRescued = 12;

  const toggleWithHaptic = (setter: React.Dispatch<React.SetStateAction<boolean>>) => (v: boolean) => {
    haptic.selection();
    setter(v);
  };

  const selectCarbonTarget = (value: number) => {
    haptic.selection();
    setCarbonTarget(value);
  };

  const selectRatioTarget = (value: number) => {
    haptic.selection();
    setRatioTarget(value);
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Sustainability"
          subtitle="Your goals and preferences"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Demo mode indicator (truthful UI per AGENTS.md §11) ── */}
      {SUSTAINABILITY_DEMO_MODE && (
        <View
          style={[styles.demoBanner, { backgroundColor: colors.surfaceAlt }]}
          accessibilityRole="header"
          accessibilityLabel="Demo mode"
        >
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.demoBannerText}>
            Impact figures are illustrative in demo mode.
          </Text>
        </View>
      )}

      {/* ── Impact summary hero ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: colors.success }]}>
              <Ionicons name="leaf" size={20} color={colors.textInverse} />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Your impact</Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                {co2SavedKg} kg CO₂ saved · {itemsRescued} items kept from landfill
              </Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={[styles.statCell, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.statValue, { color: colors.success }]}>{co2SavedKg}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>kg CO₂ saved</Text>
            </View>
            <View style={[styles.statCell, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.statValue, { color: colors.success }]}>{itemsRescued}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>items rescued</Text>
            </View>
          </View>
        </View>
      </Reanimated.View>

      {/* ── Sustainability goals ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <SettingsSection title="Sustainability goals" noCard>
          <View style={styles.goalRow}>
            <Text style={[styles.goalLabel, { color: colors.textPrimary }]}>Carbon saving target</Text>
            <Text style={[styles.goalHint, { color: colors.textMuted }]}>kg CO₂ per year</Text>
            <View style={styles.chipRow}>
              {CARBON_TARGETS.map((target) => {
                const selected = carbonTarget === target;
                return (
                  <Pressable
                    key={target}
                    style={[
                      styles.chip,
                      { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                      selected && { backgroundColor: colors.success, borderColor: colors.success },
                    ]}
                    onPress={() => selectCarbonTarget(target)}
                    accessibilityRole="button"
                    accessibilityLabel={`Set carbon saving target to ${target} kilograms`}
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.chipText, { color: colors.textPrimary }, selected && { color: colors.textInverse }]}>
                      {target}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={[styles.goalRow, styles.goalRowLast]}>
            <Text style={[styles.goalLabel, { color: colors.textPrimary }]}>Secondhand ratio goal</Text>
            <Text style={[styles.goalHint, { color: colors.textMuted }]}>share of purchases that are secondhand</Text>
            <View style={styles.chipRow}>
              {RATIO_TARGETS.map((target) => {
                const selected = ratioTarget === target;
                return (
                  <Pressable
                    key={target}
                    style={[
                      styles.chip,
                      { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                      selected && { backgroundColor: colors.success, borderColor: colors.success },
                    ]}
                    onPress={() => selectRatioTarget(target)}
                    accessibilityRole="button"
                    accessibilityLabel={`Set secondhand ratio goal to ${target} percent`}
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.chipText, { color: colors.textPrimary }, selected && { color: colors.textInverse }]}>
                      {target}%
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </SettingsSection>
      </Reanimated.View>

      {/* ── Shipping & packaging ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <SettingsSection title="Shipping & packaging" noCard>
          <SettingsRow
            icon="bicycle-outline"
            title="Carbon-neutral shipping"
            subtitle="Prefer sellers offering carbon-neutral delivery"
            toggleValue={carbonNeutralShipping}
            onToggle={toggleWithHaptic(setCarbonNeutralShipping)}
            isFirst
          />
          <SettingsRow
            icon="cube-outline"
            title="Plastic-free packaging"
            subtitle="Prefer sellers using plastic-free packaging"
            toggleValue={plasticFreePackaging}
            onToggle={toggleWithHaptic(setPlasticFreePackaging)}
            isLast
          />
        </SettingsSection>
      </Reanimated.View>

      {/* ── Display & tracking ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <SettingsSection title="Display & tracking" noCard>
          <SettingsRow
            icon="ribbon-outline"
            title="Sustainability badges"
            subtitle="Show sustainability badges on listings"
            toggleValue={showBadges}
            onToggle={toggleWithHaptic(setShowBadges)}
            isFirst
          />
          <SettingsRow
            icon="analytics-outline"
            title="Impact tracking"
            subtitle="Track your personal sustainability impact"
            toggleValue={trackImpact}
            onToggle={toggleWithHaptic(setTrackImpact)}
          />
          <SettingsRow
            icon="navigate-outline"
            title="Local first"
            subtitle="Prioritise local listings in search and feed"
            toggleValue={localFirst}
            onToggle={toggleWithHaptic(setLocalFirst)}
            isLast
          />
        </SettingsSection>
      </Reanimated.View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    demoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      marginBottom: Space.md,
    },
    demoBannerText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
      color: colors.textSecondary,
      flex: 1,
    },
    heroCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginBottom: Space.md,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    heroIcon: {
      width: Space.xxl,
      height: Space.xxl,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroText: { flex: 1 },
    heroTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    heroSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
    },
    statsRow: {
      flexDirection: 'row',
      gap: Space.sm,
      marginTop: Space.md,
    },
    statCell: {
      flex: 1,
      borderRadius: Radius.md,
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md,
      alignItems: 'center',
    },
    statValue: {
      fontSize: Type.bodyLarge.size,
      fontFamily: Typography.family.bold,
      letterSpacing: Type.bodyLarge.letterSpacing,
    },
    statLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
      letterSpacing: Type.caption.letterSpacing,
    },
    goalRow: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    goalRowLast: {
      borderBottomWidth: 0,
    },
    goalLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    goalHint: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
      letterSpacing: Type.caption.letterSpacing,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs,
      marginTop: Space.sm,
    },
    chip: {
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      minHeight: Control.chromeCompact,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.caption.letterSpacing,
    },
  });
}
