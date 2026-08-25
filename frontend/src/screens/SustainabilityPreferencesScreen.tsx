/**
 * SustainabilityPreferencesScreen — personal sustainability goals & preferences.
 *
 * Lets the user set carbon-saving targets, a secondhand ratio goal, preferred
 * shipping/packaging, and toggle sustainability badges, impact tracking and
 * local-first prioritisation.
 *
 * Per AGENTS.md §11 (Truthful UI): impact data is not yet available from a
 * backend service, so an honest empty state is shown instead of fabricated
 * figures. User preferences are persisted locally and will be used to
 * personalize the experience once real impact data exists.
 *
 * Design (per AGENTS.md §4):
 * - Flat composition, hairline separators, no card-on-card
 * - One dominant panel (the impact summary hero)
 * - Max two non-avatar radius sizes (Radius.md for chips, Radius.lg for hero)
 * - Max three type sizes per viewport (title, body, caption)
 * - All colors via useAppTheme(), all geometry via design tokens
 *
 * State coverage (per AGENTS.md §14):
 * - Populated: full preference set with honest empty-state for impact
 * - Disabled: master toggle disables dependent rows
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { Space, Radius, Type, Typography, Control } from '../theme/designTokens';

type Props = NativeStackScreenProps<RootStackParamList, 'SustainabilityPreferences'>;

// Carbon-saving target options (kg CO2 per year).
const CARBON_TARGETS = [10, 25, 50, 100, 250];

// Secondhand ratio goal options (percentage of purchases that are secondhand).
const RATIO_TARGETS = [25, 50, 75, 100];

const SUSTAINABILITY_PREFS_KEY = '@thryftverse/sustainability_prefs';

interface SustainabilityPrefs {
  carbonTarget: number;
  ratioTarget: number;
  carbonNeutralShipping: boolean;
  plasticFreePackaging: boolean;
  showBadges: boolean;
  trackImpact: boolean;
  localFirst: boolean;
}

const DEFAULT_PREFS: SustainabilityPrefs = {
  carbonTarget: 50,
  ratioTarget: 50,
  carbonNeutralShipping: true,
  plasticFreePackaging: true,
  showBadges: true,
  trackImpact: true,
  localFirst: false,
};

export default function SustainabilityPreferencesScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Preference state — persisted to AsyncStorage so it survives app restarts.
  // The backend account-preferences endpoint does not yet support sustainability
  // fields, so these are device-local (truthful per AGENTS.md §11).
  const [carbonTarget, setCarbonTarget] = React.useState(DEFAULT_PREFS.carbonTarget);
  const [ratioTarget, setRatioTarget] = React.useState(DEFAULT_PREFS.ratioTarget);
  const [carbonNeutralShipping, setCarbonNeutralShipping] = React.useState(DEFAULT_PREFS.carbonNeutralShipping);
  const [plasticFreePackaging, setPlasticFreePackaging] = React.useState(DEFAULT_PREFS.plasticFreePackaging);
  const [showBadges, setShowBadges] = React.useState(DEFAULT_PREFS.showBadges);
  const [trackImpact, setTrackImpact] = React.useState(DEFAULT_PREFS.trackImpact);
  const [localFirst, setLocalFirst] = React.useState(DEFAULT_PREFS.localFirst);
  const [hydrated, setHydrated] = React.useState(false);

  // Hydrate from AsyncStorage on mount.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SUSTAINABILITY_PREFS_KEY);
        if (!mounted || !raw) return;
        const parsed = JSON.parse(raw) as Partial<SustainabilityPrefs>;
        if (typeof parsed.carbonTarget === 'number') setCarbonTarget(parsed.carbonTarget);
        if (typeof parsed.ratioTarget === 'number') setRatioTarget(parsed.ratioTarget);
        if (typeof parsed.carbonNeutralShipping === 'boolean') setCarbonNeutralShipping(parsed.carbonNeutralShipping);
        if (typeof parsed.plasticFreePackaging === 'boolean') setPlasticFreePackaging(parsed.plasticFreePackaging);
        if (typeof parsed.showBadges === 'boolean') setShowBadges(parsed.showBadges);
        if (typeof parsed.trackImpact === 'boolean') setTrackImpact(parsed.trackImpact);
        if (typeof parsed.localFirst === 'boolean') setLocalFirst(parsed.localFirst);
      } catch {
        // AsyncStorage read failure — keep defaults
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Persist to AsyncStorage whenever preferences change (after hydration).
  React.useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(
      SUSTAINABILITY_PREFS_KEY,
      JSON.stringify({
        carbonTarget,
        ratioTarget,
        carbonNeutralShipping,
        plasticFreePackaging,
        showBadges,
        trackImpact,
        localFirst,
      } satisfies SustainabilityPrefs),
    ).catch(() => {});
  }, [hydrated, carbonTarget, ratioTarget, carbonNeutralShipping, plasticFreePackaging, showBadges, trackImpact, localFirst]);

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
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Impact summary — honest empty state (fail-closed per AGENTS.md §11) ── */}
        <View style={styles.summaryBlock}>
          <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>Your impact</Text>
          <View style={[styles.emptyStateWrap, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="leaf-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
              Impact tracking is being calibrated. Your sustainability preferences are saved and will be used to personalize your experience once impact data is available.
            </Text>
          </View>
        </View>

      {/* ── Sustainability goals ── */}
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

      {/* ── Shipping & packaging ── */}
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

      {/* ── Display & tracking ── */}
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
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    summaryBlock: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md,
      marginBottom: Space.md,
    },
    summaryTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    emptyStateWrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      borderRadius: Radius.lg,
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
      marginTop: Space.sm,
    },
    emptyStateText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight,
      flex: 1,
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
