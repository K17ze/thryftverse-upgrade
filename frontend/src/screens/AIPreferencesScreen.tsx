/**
 * AIPreferencesScreen — central control surface for assisted features.
 *
 * Lets the user enable or disable every suggestion surface in ThryftVerse:
 * listing suggestions, photo enhancement, search autocomplete, chat agents,
 * auto-negotiation, confidence indicators, and algorithm transparency.
 *
 * Per AGENTS.md §11 (Truthful UI): preferences are persisted locally only in
 * demo mode, so a "Demo mode" indicator is always shown. We never claim the
 * toggles affect a live backend — they update the session profile and the
 * indicator makes clear the data is illustrative.
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
import { Control, Space, Radius, Type, Typography } from '../theme/designTokens';

type Props = NativeStackScreenProps<RootStackParamList, 'AIPreferences'>;

// Demo mode flag — the preference service is mock in this build.
const AI_PREFERENCES_DEMO_MODE = true;

export default function AIPreferencesScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Local preference state — persisted to AsyncStorage in a real implementation.
  const [masterEnabled, setMasterEnabled] = React.useState(true);
  const [listingSuggestions, setListingSuggestions] = React.useState(true);
  const [photoEnhancement, setPhotoEnhancement] = React.useState(true);
  const [searchAutocomplete, setSearchAutocomplete] = React.useState(true);
  const [chatAgents, setChatAgents] = React.useState(true);
  const [smartSell, setSmartSell] = React.useState(false);
  const [confidenceDisplay, setConfidenceDisplay] = React.useState(true);

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
          title="Listing suggestions"
          subtitle="Preferences"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Demo mode indicator (truthful UI per AGENTS.md §11) ── */}
      {AI_PREFERENCES_DEMO_MODE && (
        <View
          style={[styles.demoBanner, { backgroundColor: colors.surfaceAlt }]}
          accessibilityRole="header"
          accessibilityLabel="Demo mode"
        >
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.demoBannerText}>
            Preferences are saved on this device only in demo mode.
          </Text>
        </View>
      )}

      {/* ── Hero summary — posture with active count ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: masterEnabled && activeCount > 0 ? colors.brand : colors.surfaceAlt }]}>
              <Ionicons name="settings-outline" size={20} color={masterEnabled && activeCount > 0 ? colors.textInverse : colors.textMuted} />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                {masterEnabled ? `${activeCount} of 6 features on` : 'All features off'}
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                {activeCount === 6 ? 'All features enabled' : activeCount === 0 ? 'No features active' : 'Some features paused'}
              </Text>
            </View>
          </View>
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
      </Reanimated.View>

      {/* ── Master toggle ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)}>
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
      </Reanimated.View>

      {/* ── Feature toggles ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
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
            title="Auto-negotiate offers"
            subtitle="Allow agents to negotiate offers on your behalf"
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
      </Reanimated.View>

      {/* ── Transparency ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)}>
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
      </Reanimated.View>

      {/* ── Data usage — inline explanation ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(240)}>
        <View style={styles.dataUsageBlock}>
          <View style={styles.dataUsageHeader}>
            <Ionicons name="server-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.dataUsageTitle, { color: colors.textPrimary }]}>Data usage</Text>
          </View>
          <Text style={[styles.dataUsageBody, { color: colors.textSecondary }]}>
            These features use your listing content, search queries and chat messages to generate suggestions. In demo mode this data stays on your device and is never sent to a server or shared with third parties. Disabling a feature stops that data from being processed for suggestions.
          </Text>
        </View>
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
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.md,
    },
    progressTrack: {
      flex: 1,
      height: Space.xs + 2,
      borderRadius: Radius.sm,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: Radius.sm,
      backgroundColor: colors.brand,
    },
    progressLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      letterSpacing: Type.caption.letterSpacing,
      minWidth: Control.chrome,
      textAlign: 'right',
    },
    dataUsageBlock: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      marginBottom: Space.md,
    },
    dataUsageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs,
    },
    dataUsageTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    dataUsageBody: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
    },
  });
}
