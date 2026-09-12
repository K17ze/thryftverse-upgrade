/**
 * AIPreferencesScreen — central control surface for assisted features.
 *
 * Lets the user enable or disable every suggestion surface in ThryftVerse:
 * listing suggestions, photo enhancement, search autocomplete, chat agents,
 * auto-negotiation, confidence indicators, and algorithm transparency.
 *
 * Per AGENTS.md §11 (Truthful UI): preferences are persisted on-device only —
 * the backend account-preferences endpoint does not yet support AI feature
 * toggles, so the honesty notice is always shown (not just in demo builds).
 * We never claim the toggles reconfigure a live backend — they record the
 * user's choice on this device, and surfaces read them where wired.
 *
 * Anti-AI art direction (audit §01): all labels are phrased around benefit,
 * not implementation technology. No "AI" prefix on feature names — the user
 * cares about what the feature does, not how it works internally.
 *
 * Design (per AGENTS.md §4):
 * - Flat composition, hairline separators, no card-on-card
 * - One dominant panel (the feature list)
 * - Max two non-avatar radius sizes (Radius.md for the hero, Radius.lg for
 *   the explanation block)
 * - Max three type sizes per viewport (title, body, caption)
 * - All colors via useAppTheme(), all geometry via design tokens
 *
 * State coverage (per AGENTS.md §14):
 * - Populated: full preference set
 * - Disabled: master toggle disables all dependent rows
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { Control, Space, Radius } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';

type Props = NativeStackScreenProps<RootStackParamList, 'AIPreferences'>;

const AI_PREFS_KEY = '@thryftverse/ai_prefs';

interface AIPrefs {
  masterEnabled: boolean;
  listingSuggestions: boolean;
  photoEnhancement: boolean;
  searchAutocomplete: boolean;
  chatAgents: boolean;
  smartSell: boolean;
  confidenceDisplay: boolean;
}

const DEFAULT_PREFS: AIPrefs = {
  masterEnabled: true,
  listingSuggestions: true,
  photoEnhancement: true,
  searchAutocomplete: true,
  chatAgents: true,
  smartSell: false,
  confidenceDisplay: true };

export default function AIPreferencesScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Preference state — persisted to AsyncStorage so it survives app restarts.
  // The backend account-preferences endpoint does not yet support AI feature
  // toggles, so these are device-local in every build — the honesty notice
  // below is always rendered, not gated on __DEV__ (truthful per AGENTS.md §11).
  const [masterEnabled, setMasterEnabled] = React.useState(DEFAULT_PREFS.masterEnabled);
  const [listingSuggestions, setListingSuggestions] = React.useState(DEFAULT_PREFS.listingSuggestions);
  const [photoEnhancement, setPhotoEnhancement] = React.useState(DEFAULT_PREFS.photoEnhancement);
  const [searchAutocomplete, setSearchAutocomplete] = React.useState(DEFAULT_PREFS.searchAutocomplete);
  const [chatAgents, setChatAgents] = React.useState(DEFAULT_PREFS.chatAgents);
  const [smartSell, setSmartSell] = React.useState(DEFAULT_PREFS.smartSell);
  const [confidenceDisplay, setConfidenceDisplay] = React.useState(DEFAULT_PREFS.confidenceDisplay);
  const [hydrated, setHydrated] = React.useState(false);

  // Hydrate from AsyncStorage on mount.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(AI_PREFS_KEY);
        if (!mounted || !raw) return;
        const parsed = JSON.parse(raw) as Partial<AIPrefs>;
        if (typeof parsed.masterEnabled === 'boolean') setMasterEnabled(parsed.masterEnabled);
        if (typeof parsed.listingSuggestions === 'boolean') setListingSuggestions(parsed.listingSuggestions);
        if (typeof parsed.photoEnhancement === 'boolean') setPhotoEnhancement(parsed.photoEnhancement);
        if (typeof parsed.searchAutocomplete === 'boolean') setSearchAutocomplete(parsed.searchAutocomplete);
        if (typeof parsed.chatAgents === 'boolean') setChatAgents(parsed.chatAgents);
        if (typeof parsed.smartSell === 'boolean') setSmartSell(parsed.smartSell);
        if (typeof parsed.confidenceDisplay === 'boolean') setConfidenceDisplay(parsed.confidenceDisplay);
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
      AI_PREFS_KEY,
      JSON.stringify({
        masterEnabled,
        listingSuggestions,
        photoEnhancement,
        searchAutocomplete,
        chatAgents,
        smartSell,
        confidenceDisplay } satisfies AIPrefs),
    ).catch(() => {});
  }, [hydrated, masterEnabled, listingSuggestions, photoEnhancement, searchAutocomplete, chatAgents, smartSell, confidenceDisplay]);

  const activeCount = [
    listingSuggestions,
    photoEnhancement,
    searchAutocomplete,
    chatAgents,
    smartSell,
    confidenceDisplay,
  ].filter(Boolean).length;

  const handleMasterToggle = (v: boolean) => {
    haptic.selection();
    setMasterEnabled(v);
    if (!v) {
      setListingSuggestions(false);
      setPhotoEnhancement(false);
      setSearchAutocomplete(false);
      setChatAgents(false);
      setSmartSell(false);
      setConfidenceDisplay(false);
    }
  };

  const toggleWithHaptic = (setter: React.Dispatch<React.SetStateAction<boolean>>) => (v: boolean) => {
    haptic.selection();
    setter(v);
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Recommendations"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Honesty notice (truthful UI per AGENTS.md §11) ──
          Always rendered: these toggles are device-local in every build and
          some features are still in preview, so the notice is not a demo-only
          indicator. */}
      <View
        style={[styles.demoBanner, { backgroundColor: colors.surfaceAlt }]}
        accessibilityRole="header"
        accessibilityLabel="Preferences saved on this device"
      >
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.demoBannerText}>
          Preferences are saved on this device. Some features are in preview and may not respond to these settings yet.
        </Text>
      </View>

      {/* ── Summary — flat intro block with active count ── */}
        <View style={styles.summaryBlock}>
          <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
            {masterEnabled ? `${activeCount} of 6 features on` : 'All features off'}
          </Text>
          <Text style={[styles.summarySubtitle, { color: colors.textSecondary }]}>
            {activeCount === 6 ? 'All features enabled' : activeCount === 0 ? 'No features active' : 'Some features paused'}
          </Text>
          <View style={styles.progressRow}>
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(activeCount / 6) * 100}%`, backgroundColor: colors.brand },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
              {activeCount}/6
            </Text>
          </View>
        </View>

      {/* ── Master toggle ── */}
        <SettingsSection title="Master control" noCard>
          <SettingsRow
            icon="power-outline"
            title="Enable suggestions"
            subtitle="Turn all assisted features on or off"
            toggleValue={masterEnabled}
            onToggle={handleMasterToggle}
            isFirst
            isLast
          />
        </SettingsSection>

      {/* ── Feature toggles ── */}
        <SettingsSection title="Features" noCard>
          <SettingsRow
            icon="bulb-outline"
            title="Listing suggestions"
            subtitle="Get suggested titles, descriptions and price estimates"
            toggleValue={listingSuggestions}
            onToggle={toggleWithHaptic(setListingSuggestions)}
            disabled={!masterEnabled}
            isFirst
          />
          <SettingsRow
            icon="image-outline"
            title="Photo enhancement"
            subtitle="Receive photo editing suggestions for your listings"
            toggleValue={photoEnhancement}
            onToggle={toggleWithHaptic(setPhotoEnhancement)}
            disabled={!masterEnabled}
          />
          <SettingsRow
            icon="search-outline"
            title="Search autocomplete"
            subtitle="Show autocomplete suggestions while you search"
            toggleValue={searchAutocomplete}
            onToggle={toggleWithHaptic(setSearchAutocomplete)}
            disabled={!masterEnabled}
          />
          <SettingsRow
            icon="chatbubble-ellipses-outline"
            title="Chat agents"
            subtitle="Enable agents to assist in your conversations"
            toggleValue={chatAgents}
            onToggle={toggleWithHaptic(setChatAgents)}
            disabled={!masterEnabled}
          />
          <SettingsRow
            icon="trending-up-outline"
            title="Offer auto-accept rules"
            subtitle="Preview — save a floor price for incoming offers; rules are not applied to live offers yet"
            toggleValue={smartSell}
            onToggle={toggleWithHaptic(setSmartSell)}
            disabled={!masterEnabled}
          />
          <SettingsRow
            icon="stats-chart-outline"
            title="Confidence indicators"
            subtitle="Show confidence indicators on suggestions"
            toggleValue={confidenceDisplay}
            onToggle={toggleWithHaptic(setConfidenceDisplay)}
            disabled={!masterEnabled}
            isLast
          />
        </SettingsSection>

      {/* ── Transparency ── */}
        <SettingsSection title="Transparency" noCard>
          <SettingsRow
            icon="git-network-outline"
            title="Algorithm Transparency"
            subtitle="See the signals that shape your feed"
            onPress={() => navigation.navigate('YourAlgorithm')}
            isFirst
            isLast
          />
        </SettingsSection>

      {/* ── Data usage — inline explanation ── */}
        <View style={styles.dataUsageBlock}>
          <View style={styles.dataUsageHeader}>
            <Ionicons name="server-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.dataUsageTitle, { color: colors.textPrimary }]}>Data usage</Text>
          </View>
          <Text style={[styles.dataUsageBody, { color: colors.textSecondary }]}>
            Assisted features can use your listing content, search queries and chat messages to generate suggestions. Where a server assistant is configured, the relevant content is sent to that provider to produce a response; otherwise suggestions are produced on-device from local signals such as photo file names. Turning a feature off records your preference on this device.
          </Text>
        </View>
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
      marginBottom: Space.md },
    demoBannerText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textSecondary,
      flex: 1 },
    summaryBlock: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      marginBottom: Space.md },
    summaryTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    summarySubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      marginTop: Space.xs / 2,
      letterSpacing: TypographyV2.meta.letterSpacing },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.md },
    progressTrack: {
      flex: 1,
      height: Space.xs + 2,
      borderRadius: Radius.sm,
      backgroundColor: colors.border,
      overflow: 'hidden' },
    progressFill: {
      height: '100%',
      borderRadius: Radius.sm,
      backgroundColor: colors.brand },
    progressLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      letterSpacing: TypographyV2.meta.letterSpacing,
      minWidth: Control.chrome,
      textAlign: 'right' },
    dataUsageBlock: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      marginBottom: Space.md },
    dataUsageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs },
    dataUsageTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    dataUsageBody: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing } });
}
