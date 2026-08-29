/**
 * SustainabilityPreferencesScreen — personal sustainability goals & preferences.
 *
 * Lets the user set carbon-saving targets, a secondhand ratio goal, preferred
 * packaging, and toggle sustainability badges, impact tracking and local-first
 * prioritisation. Real impact data is fetched from the backend ledger; when no
 * completed purchases exist yet, an honest empty state is shown.
 *
 * Per EU Directive 2024/825, the "Carbon-neutral shipping" toggle has been
 * removed — no verified carbon-neutral shipping option exists, so offering the
 * preference would be a greenwashing claim.
 *
 * Design (per AGENTS.md §4):
 * - Flat composition, hairline separators, no card-on-card
 * - One dominant panel (the impact summary hero)
 * - Max two non-avatar radius sizes (Radius.md for chips, Radius.lg for hero)
 * - Max three type sizes per viewport (title, body, caption)
 * - All colors via useAppTheme(), all geometry via design tokens
 *
 * State coverage (per AGENTS.md §14):
 * - Loading: impact and preferences fetch in flight
 * - Empty: no completed purchases yet
 * - Populated: real impact figures and full preference set
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { Space, Radius, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import {
  fetchMyImpactLedger,
  fetchSustainabilityPreferences,
  updateSustainabilityPreferences,
  type ImpactLedgerResponse,
  type SustainabilityPreferences } from '../services/impactApi';

type Props = NativeStackScreenProps<RootStackParamList, 'SustainabilityPreferences'>;

// Carbon-saving target options (kg CO2 per year). null = no target.
const CARBON_TARGETS: (number | null)[] = [null, 10, 25, 50, 100, 250];

// Secondhand ratio goal options (percentage of purchases that are secondhand). null = no target.
const RATIO_TARGETS: (number | null)[] = [null, 25, 50, 75, 100];

const METHODOLOGY_TEXT =
  'ThryftVerse calculates net avoided emissions using verified emissions factors (DEFRA 2024, Higg MSI v3.7). We subtract resale shipping and packaging emissions from the avoided production and end-of-life emissions, applying a displacement rate and rebound effect based on WRAP/Vestiaire methodology.';

export default function SustainabilityPreferencesScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [impactLedger, setImpactLedger] = useState<ImpactLedgerResponse | null>(null);
  const [impactLoading, setImpactLoading] = useState(true);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [carbonTarget, setCarbonTarget] = useState<number | null>(null);
  const [ratioTarget, setRatioTarget] = useState<number | null>(null);
  const [plasticFreePackaging, setPlasticFreePackaging] = useState(true);
  const [showBadges, setShowBadges] = useState(true);
  const [trackImpact, setTrackImpact] = useState(true);
  const [localFirst, setLocalFirst] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  // Fetch impact ledger + preferences on mount.
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const ledger = await fetchMyImpactLedger();
        if (mounted) setImpactLedger(ledger);
      } catch {
        // Keep null — empty state will render.
      } finally {
        if (mounted) setImpactLoading(false);
      }
    })();

    (async () => {
      try {
        const prefs = await fetchSustainabilityPreferences();
        if (!mounted) return;
        setCarbonTarget(prefs.carbonTargetKg);
        setRatioTarget(prefs.ratioTargetPct);
        setPlasticFreePackaging(prefs.plasticFreePackaging);
        setShowBadges(prefs.showBadges);
        setTrackImpact(prefs.trackImpact);
        setLocalFirst(prefs.localFirst);
      } catch {
        // Keep defaults — user can still interact; persistence will retry.
      } finally {
        if (mounted) {
          setHydrated(true);
          setPrefsLoading(false);
        }
      }
    })();

    return () => { mounted = false; };
  }, []);

  // Debounced persistence of changed preferences to the backend.
  const prefsRef = useRef({ carbonTarget, ratioTarget, plasticFreePackaging, showBadges, trackImpact, localFirst });
  prefsRef.current = { carbonTarget, ratioTarget, plasticFreePackaging, showBadges, trackImpact, localFirst };

  useEffect(() => {
    if (!hydrated) return;
    const handle = setTimeout(() => {
      const p = prefsRef.current;
      const patch: Partial<SustainabilityPreferences> = {
        carbonTargetKg: p.carbonTarget,
        ratioTargetPct: p.ratioTarget,
        plasticFreePackaging: p.plasticFreePackaging,
        showBadges: p.showBadges,
        trackImpact: p.trackImpact,
        localFirst: p.localFirst };
      updateSustainabilityPreferences(patch).catch((err) => {
        console.warn('[sustainability] persist failed', err);
      });
    }, 500);
    return () => clearTimeout(handle);
  }, [hydrated, carbonTarget, ratioTarget, plasticFreePackaging, showBadges, trackImpact, localFirst]);

  const toggleWithHaptic = (setter: React.Dispatch<React.SetStateAction<boolean>>) => (v: boolean) => {
    haptic.selection();
    setter(v);
  };

  const selectCarbonTarget = (value: number | null) => {
    haptic.selection();
    setCarbonTarget(value);
  };

  const selectRatioTarget = (value: number | null) => {
    haptic.selection();
    setRatioTarget(value);
  };

  const showMethodology = () => {
    haptic.selection();
    setMethodologyOpen((v) => !v);
  };

  const hasImpact = !impactLoading && impactLedger && impactLedger.itemCount > 0;

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Sustainability"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Impact summary — dominant hero panel ── */}
      <View style={styles.summaryBlock}>
        <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>Your impact</Text>

        {impactLoading ? (
          <View style={[styles.heroPanel, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.heroStat, { color: colors.textSecondary }]}>
              Loading your impact…
            </Text>
          </View>
        ) : hasImpact ? (
          <View style={[styles.heroPanel, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.heroStat, { color: colors.textPrimary }]}>
              {impactLedger!.totalCo2eAvoidedKg.toLocaleString()} kg CO₂e avoided
            </Text>
            <Text style={[styles.heroSecondary, { color: colors.textSecondary }]}>
              {impactLedger!.itemCount} {impactLedger!.itemCount === 1 ? 'item' : 'items'} kept in circulation
            </Text>
          </View>
        ) : (
          <View style={[styles.heroPanel, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="leaf-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
              No completed purchases yet. Your impact will appear here once you buy your first pre-owned item.
            </Text>
          </View>
        )}
      </View>

      {/* ── Sustainability goals ── */}
      <SettingsSection title="Sustainability goals" noCard>
        <View style={styles.goalRow}>
          <Text style={[styles.goalLabel, { color: colors.textPrimary }]}>Carbon saving target</Text>
          <Text style={[styles.goalHint, { color: colors.textMuted }]}>kg CO₂ per year</Text>
          <View style={styles.chipRow}>
            {CARBON_TARGETS.map((target) => {
              const selected = carbonTarget === target;
              const label = target === null ? 'None' : String(target);
              return (
                <Pressable
                  key={label}
                  style={[
                    styles.chip,
                    { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                    selected && { backgroundColor: colors.success, borderColor: colors.success },
                  ]}
                  onPress={() => selectCarbonTarget(target)}
                  accessibilityRole="button"
                  accessibilityLabel={target === null ? 'Clear carbon saving target' : `Set carbon saving target to ${target} kilograms`}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, { color: colors.textPrimary }, selected && { color: colors.textInverse }]}>
                    {label}
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
              const label = target === null ? 'None' : `${target}%`;
              return (
                <Pressable
                  key={label}
                  style={[
                    styles.chip,
                    { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                    selected && { backgroundColor: colors.success, borderColor: colors.success },
                  ]}
                  onPress={() => selectRatioTarget(target)}
                  accessibilityRole="button"
                  accessibilityLabel={target === null ? 'Clear secondhand ratio goal' : `Set secondhand ratio goal to ${target} percent`}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, { color: colors.textPrimary }, selected && { color: colors.textInverse }]}>
                    {label}
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
          icon="cube-outline"
          title="Plastic-free packaging"
          subtitle="Prefer sellers using plastic-free packaging"
          toggleValue={plasticFreePackaging}
          onToggle={toggleWithHaptic(setPlasticFreePackaging)}
          isFirst
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

      {/* ── Methodology disclosure ── */}
      <View style={styles.footer}>
        <Pressable
          style={styles.methodologyToggle}
          onPress={showMethodology}
          accessibilityRole="button"
          accessibilityLabel="How we calculate impact"
        >
          <Text style={[styles.methodologyLink, { color: colors.textSecondary }]}>
            How we calculate impact
          </Text>
          <Ionicons
            name={methodologyOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={16}
            color={colors.textSecondary}
          />
        </Pressable>
        {methodologyOpen && (
          <Text style={[styles.methodologyText, { color: colors.textMuted }]}>
            {METHODOLOGY_TEXT}
          </Text>
        )}
      </View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    summaryBlock: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md,
      marginBottom: Space.md },
    summaryTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    heroPanel: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      borderRadius: Radius.lg,
      paddingVertical: Space.md + Space.xs,
      paddingHorizontal: Space.md,
      marginTop: Space.sm },
    heroStat: {
      fontSize: TypographyV2.bodyStrong.size + 4,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      flex: 1 },
    heroSecondary: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: Space.xs / 2,
      flex: 1 },
    emptyStateText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight,
      flex: 1 },
    goalRow: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    goalRowLast: {
      borderBottomWidth: 0 },
    goalLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    goalHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      marginTop: Space.xs / 2,
      letterSpacing: TypographyV2.meta.letterSpacing },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs,
      marginTop: Space.sm },
    chip: {
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      minHeight: Control.chromeCompact,
      alignItems: 'center',
      justifyContent: 'center' },
    chipText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    footer: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      paddingBottom: Space.lg },
    methodologyToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm },
    methodologyLink: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    methodologyText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: Space.xs } });
}
