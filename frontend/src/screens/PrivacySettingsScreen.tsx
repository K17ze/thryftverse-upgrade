import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { updateActivityStatus, updateSearchVisibility } from '../services/accountApi';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacySettings'>;

export default function PrivacySettingsScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const accountPreferences = useStore((s) => s.accountPreferences);
  const updateAccountPreferences = useStore((s) => s.updateAccountPreferences);
  const blockedCount = useStore((s) => s.blockedUsers.length);
  const twoFactorEnabled = useStore((s) => s.twoFactorEnabled);
  const { analyticsOptOut, setAnalyticsOptOut } = useSettingsPreferences();

  const [activityStatusVisible, setActivityStatusVisible] = React.useState(true);
  const [searchVisibility, setSearchVisibility] = React.useState<'visible' | 'hidden'>('visible');

  // Compute privacy posture score
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
      {/* Privacy posture hero */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: postureColor }]}>
              <Ionicons name="shield" size={20} color={colors.textInverse} />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Privacy posture</Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                {activeCount} of {postureItems.length} protections active
              </Text>
            </View>
            <View style={[styles.postureBadge, { backgroundColor: postureColor + '18' }]}>
              <Text style={[styles.postureBadgeText, { color: postureColor }]}>{postureLabel}</Text>
            </View>
          </View>
        </View>
      </Reanimated.View>

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)}>
      <SettingsSection title="Visibility" noCard>
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
          toggleValue={activityStatusVisible}
          onToggle={handleActivityStatusToggle}
        />
        <SettingsRow
          icon="search-outline"
          title="Search visibility"
          subtitle="Allow others to find you in search"
          toggleValue={searchVisibility === 'visible'}
          onToggle={handleSearchVisibilityToggle}
          isLast
        />
      </SettingsSection>
      </Reanimated.View>

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
      <SettingsSection title="Shop activity" noCard>
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
      </Reanimated.View>

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)}>
      <SettingsSection title="Messaging" noCard>
        <SettingsRow
          icon="chatbubble-ellipses-outline"
          title="Chat privacy"
          subtitle="Who can message you, read receipts, blocked users"
          onPress={() => navigation.navigate('ChatSettings')}
          isFirst
          isLast
        />
      </SettingsSection>
      </Reanimated.View>

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(240)}>
      <SettingsSection title="Blocked users" noCard>
        <SettingsRow
          icon="ban-outline"
          title="Manage blocked users"
          subtitle={blockedCount > 0 ? `${blockedCount} blocked` : 'None blocked'}
          onPress={() => navigation.navigate('BlockedUsers')}
          isFirst
          isLast
        />
      </SettingsSection>
      </Reanimated.View>

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(300)}>
      <SettingsSection title="Data & analytics" noCard>
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
      </Reanimated.View>

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(360)}>
      <SettingsSection title="Legal" noCard>
        <SettingsRow
          icon="document-text-outline"
          title="Privacy Policy"
          onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
          isFirst
        />
        <SettingsRow
          icon="shield-checkmark-outline"
          title="Terms of Service"
          onPress={() => void handleOpenExternal('https://thryftverse.app/terms')}
          isLast
        />
      </SettingsSection>
      </Reanimated.View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    postureBadge: {
      borderRadius: Radius.full,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
    },
    postureBadgeText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
    },
  });
}
