import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFeatureFlag, type FeatureFlagKey } from '../../analytics';
import { Space, FontFamily, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// All feature flags defined in src/analytics/types.ts. Listed here so the
// debug view shows every flag the app can evaluate — QA can verify flag
// states without navigating to each consuming screen.
const ALL_FEATURE_FLAGS: FeatureFlagKey[] = [
  'new_home_feed',
  'live_shopping_enabled',
  'co_own_v2',
  'ai_listing_assist',
  'moodboard_beta',
  'conversational_search',
  'advanced_filters',
  'seller_analytics_v2',
];

/**
 * Read-only feature flag debug section for QA teams.
 *
 * Renders each flag name and its current boolean value. Shown only inside
 * the developer-gated "Advanced" section so ordinary consumers never see
 * implementation detail. Uses the existing `useFeatureFlag` hook — no new
 * hooks, no new dependencies.
 */
export function FeatureFlagDebugSection() {
  const { colors } = useAppTheme();
  return (
    <View style={flagStyles.container}>
      <Text style={[flagStyles.heading, { color: colors.textMuted }]}>
        Feature flags
      </Text>
      {ALL_FEATURE_FLAGS.map((flag) => (
        <FeatureFlagRow key={flag} flagKey={flag} />
      ))}
    </View>
  );
}

/** Single flag row — calls the hook and renders the live value. */
function FeatureFlagRow({ flagKey }: { flagKey: FeatureFlagKey }) {
  const { colors } = useAppTheme();
  const enabled = useFeatureFlag(flagKey);
  return (
    <View style={[flagStyles.row, { borderBottomColor: colors.borderSubtle }]}>
      <Text style={[flagStyles.flagName, { color: colors.textSecondary }]}>
        {flagKey}
      </Text>
      <View
        style={[
          flagStyles.statusPill,
          { backgroundColor: enabled ? colors.successSubtle : colors.surfaceAlt },
        ]}
      >
        <View
          style={[
            flagStyles.statusDot,
            { backgroundColor: enabled ? colors.success : colors.textMuted },
          ]}
        />
        <Text
          style={[
            flagStyles.statusText,
            { color: enabled ? colors.success : colors.textMuted },
          ]}
        >
          {enabled ? 'On' : 'Off'}
        </Text>
      </View>
    </View>
  );
}

const flagStyles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  heading: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth },
  flagName: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    flex: 1 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xxs + 1,
    borderRadius: Radius.full },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full },
  statusText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold } });
