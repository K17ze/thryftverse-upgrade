import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke, Control } from '../theme/designTokens';
import { updateActivityStatus, updateSearchVisibility } from '../services/accountApi';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacySettings'>;

export default function PrivacySettingsScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
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
      <View>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: postureColor }]}>
              <Ionicons name="checkmark-done-outline" size={20} color={colors.textInverse} />
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
      </View>

      <View>
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
      </View>

      <View>
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
      </View>

      <View>
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
      </View>

      <View>
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
      </View>

      {/* Safety tips — empowering, not frightening.
          A marketplace that visibly
          educates users on safe trading practices builds reflective trust.
          This section makes safety actionable rather than buried. Research
          (TechVinta 2026): "surface a Report link on every surface" and
          "buyer/seller protection" are core trust pillars. */}
      <View>
        <View style={[styles.safetyTipsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.safetyTipsHeader}>
            <View style={[styles.safetyTipsIcon, { backgroundColor: colors.commerceTrust + '18' }]}>
              <Ionicons name="checkmark-done-outline" size={18} color={colors.commerceTrust} />
            </View>
            <Text style={[styles.safetyTipsTitle, { color: colors.textPrimary }]}>Trading safely</Text>
          </View>
          <View style={styles.safetyTipsList}>
            <View style={styles.safetyTipItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={[styles.safetyTipText, { color: colors.textSecondary }]}>
                Keep all payments and messages on ThryftVerse for buyer protection
              </Text>
            </View>
            <View style={styles.safetyTipItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={[styles.safetyTipText, { color: colors.textSecondary }]}>
                Check seller ratings and verification badges before buying
              </Text>
            </View>
            <View style={styles.safetyTipItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={[styles.safetyTipText, { color: colors.textSecondary }]}>
                Report suspicious listings or users — our team reviews every report
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View>
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
      </View>

      <View>
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
      </View>
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
      fontSize: Type.bodyStrong.size,
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
    // Safety tips card
    safetyTipsCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginBottom: Space.md,
    },
    safetyTipsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + 2,
      marginBottom: Space.sm + 2,
    },
    safetyTipsIcon: {
      width: Control.chrome + Space.xs,
      height: Control.chrome + Space.xs,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    safetyTipsTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.bodyStrong.letterSpacing,
    },
    safetyTipsList: {
      gap: Space.sm,
    },
    safetyTipItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
    },
    safetyTipText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight + 2,
    },
  });
}
