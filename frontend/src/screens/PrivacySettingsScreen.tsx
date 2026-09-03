import React from 'react';
import { Text, View, StyleSheet, Linking, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Space, Radius } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { fetchPrivacyPreferences, updateActivityStatus, updateSearchVisibility } from '../services/accountApi';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacySettings'>;

const SAFETY_TIPS = [
  'Keep all payments and messages on ThryftVerse for buyer protection',
  'Check seller ratings and verification badges before buying',
  'Report suspicious listings or users — our team reviews every report',
];

export default function PrivacySettingsScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const accountPreferences = useStore((s) => s.accountPreferences);
  const updateAccountPreferences = useStore((s) => s.updateAccountPreferences);
  const blockedCount = useStore((s) => s.blockedUsers.length);
  const twoFactorEnabled = useStore((s) => s.twoFactorEnabled);
  const { analyticsOptOut, setAnalyticsOptOut } = useSettingsPreferences();

  // Hydrate privacy preferences from backend on mount so the posture score
  // reflects real server-side state, not fabricated defaults.
  const [activityStatusVisible, setActivityStatusVisible] = React.useState<boolean | null>(null);
  const [searchVisibility, setSearchVisibility] = React.useState<'visible' | 'hidden' | null>(null);
  const [fetchError, setFetchError] = React.useState(false);
  const mountedRef = React.useRef(true);

  const loadPrivacyPrefs = React.useCallback(() => {
    setFetchError(false);
    setActivityStatusVisible(null);
    setSearchVisibility(null);
    fetchPrivacyPreferences()
      .then((prefs) => {
        if (!mountedRef.current) return;
        setActivityStatusVisible(prefs.activityStatusVisible);
        setSearchVisibility(prefs.searchVisibility);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setFetchError(true);
      });
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    loadPrivacyPrefs();
    return () => { mountedRef.current = false; };
  }, [loadPrivacyPrefs]);

  const isHydrating = activityStatusVisible === null || searchVisibility === null;

  // Compute privacy posture score — only from hydrated values.
  const postureItems = [
    { label: 'Private profile', active: accountPreferences.privateProfile },
    { label: '2FA enabled', active: twoFactorEnabled },
    { label: 'Activity status hidden', active: !activityStatusVisible },
    { label: 'Search hidden', active: searchVisibility === 'hidden' },
  ];
  const activeCount = postureItems.filter((p) => p.active).length;
  const postureLabel = activeCount >= 3 ? 'Strong' : activeCount >= 2 ? 'Moderate' : activeCount >= 1 ? 'Basic' : 'Open';
  const postureColor = activeCount >= 3 ? colors.success : activeCount >= 2 ? colors.bronze : colors.textMuted;

  const handleOpenExternal = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      show('Unable to open link', 'error');
    }
  };

  const handleActivityStatusToggle = async (v: boolean) => {
    setActivityStatusVisible(v);
    try {
      await updateActivityStatus(v);
      show(v ? 'Activity status visible' : 'Activity status hidden', 'success');
    } catch {
      setActivityStatusVisible(!v);
      show('Failed to update activity status', 'error');
    }
  };

  const handleSearchVisibilityToggle = async (v: boolean) => {
    const next = v ? 'visible' : 'hidden';
    setSearchVisibility(next);
    try {
      await updateSearchVisibility(next);
      show(v ? 'Visible in search' : 'Hidden from search', 'success');
    } catch {
      setSearchVisibility(v ? 'hidden' : 'visible');
      show('Failed to update search visibility', 'error');
    }
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="Privacy & safety" onBack={() => navigation.goBack()} />}>
      {/* Privacy posture — flat rows, no card wrapper.
          Error / hydrating / hydrated states all use SettingsRow so the
          icon sits on a transparent 44pt hit target with no decorative circle. */}
      {fetchError ? (
        <SettingsSection title="Privacy posture">
          <SettingsRow
            icon="cloud-offline-outline"
            iconColor={colors.danger}
            title="Couldn't load privacy settings"
            subtitle="Check your connection and try again."
            isFirst
            isLast
          >
            <Pressable
              style={[styles.retryBtn, { borderColor: colors.brand }]}
              onPress={loadPrivacyPrefs}
              accessibilityRole="button"
              accessibilityLabel="Retry loading privacy preferences"
            >
              <Text style={[styles.retryBtnText, { color: colors.brand }]}>Retry</Text>
            </Pressable>
          </SettingsRow>
        </SettingsSection>
      ) : isHydrating ? (
        <SettingsSection title="Privacy posture">
          <View style={styles.skeletonWrap}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.skeletonBar, { width: i === 0 ? 180 : 220 }]} />
            ))}
          </View>
        </SettingsSection>
      ) : (
        <SettingsSection title="Privacy posture">
          <SettingsRow
            icon="checkmark-circle-outline"
            iconColor={postureColor}
            title="Privacy posture"
            subtitle={`${activeCount} of ${postureItems.length} protections active`}
            isFirst
            isLast
          >
            {/* TODO: replace `${postureColor}18` with postureColorSubtle token when available */}
            <View style={[styles.postureBadge, { backgroundColor: `${postureColor}18` }]}>
              <Text style={[styles.postureBadgeText, { color: postureColor }]}>
                {postureLabel}
              </Text>
            </View>
          </SettingsRow>
        </SettingsSection>
      )}

      <SettingsSection title="Visibility">
        <SettingsRow
          icon="eye-outline"
          title="Private profile"
          subtitle="Only approved followers can see your full profile and listings"
          toggleValue={accountPreferences.privateProfile}
          onToggle={(v) => updateAccountPreferences({ privateProfile: v })}
          isFirst
        />
        <SettingsRow
          icon="radio-button-on-outline"
          title="Activity status"
          subtitle="Show when you're online and active"
          toggleValue={activityStatusVisible === true}
          onToggle={handleActivityStatusToggle}
          disabled={isHydrating || fetchError}
        />
        <SettingsRow
          icon="search-outline"
          title="Search visibility"
          subtitle="Allow others to find you in search"
          toggleValue={searchVisibility === 'visible'}
          onToggle={handleSearchVisibilityToggle}
          disabled={isHydrating || fetchError}
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Shop activity">
        <SettingsRow
          icon="bag-outline"
          title="Holiday mode"
          subtitle="Pause your listings and hide your shop while you're away"
          toggleValue={accountPreferences.holidayMode}
          onToggle={(v) => updateAccountPreferences({ holidayMode: v })}
          isFirst
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Messaging">
        <SettingsRow
          icon="chatbubble-ellipses-outline"
          title="Chat privacy"
          subtitle="Who can message you, read receipts, blocked users"
          onPress={() => navigation.navigate('ChatSettings')}
          isFirst
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Blocked users">
        <SettingsRow
          icon="ban-outline"
          title="Manage blocked users"
          subtitle={blockedCount > 0 ? `${blockedCount} blocked` : 'None blocked'}
          onPress={() => navigation.navigate('BlockedUsers')}
          isFirst
          isLast
        />
      </SettingsSection>

      {/* Safety tips — flattened from a card into a flat info block.
          A marketplace that visibly educates users on safe trading practices
          builds reflective trust. No card wrapper — just a section title and
          checkmark rows, matching the flat composition used elsewhere. */}
      <SettingsSection title="Trading safely">
        {SAFETY_TIPS.map((tip, i) => (
          <SettingsRow
            key={tip}
            icon="checkmark-circle"
            iconColor={colors.success}
            title={tip}
            isFirst={i === 0}
            isLast={i === SAFETY_TIPS.length - 1}
          />
        ))}
      </SettingsSection>

      <SettingsSection title="Data & analytics">
        <SettingsRow
          icon="analytics-outline"
          title="Analytics opt-out"
          subtitle="Stop sending anonymous usage data to Thryftverse. No personal information is ever collected."
          toggleValue={analyticsOptOut}
          onToggle={setAnalyticsOptOut}
          isFirst
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Legal">
        <SettingsRow
          icon="document-text-outline"
          title="Privacy Policy"
          onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
          isFirst
        />
        <SettingsRow
          icon="checkmark-circle-outline"
          title="Terms of Service"
          onPress={() => void handleOpenExternal('https://thryftverse.app/terms')}
          isLast
        />
      </SettingsSection>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    retryBtn: {
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderRadius: Radius.full,
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs },
    retryBtnText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    skeletonWrap: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.lg,
      gap: Space.md },
    skeletonBar: {
      height: 20,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt },
    postureBadge: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full },
    postureBadgeText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily } });
}
