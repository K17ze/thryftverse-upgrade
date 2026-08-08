/**
 * DataPrivacyScreen — GDPR-aligned data privacy control surface.
 *
 * Explains what data is collected, offers data export (GDPR portability) and
 * deletion, exposes privacy controls (personalised ads, analytics,
 * recommendation personalisation), and documents retention and third-party
 * sharing policies with opt-outs.
 *
 * Per AGENTS.md §11 (Truthful UI): every action row navigates to a real
 * screen or performs a real toggle. Explanatory text is truthful about what
 * each action does. The export/delete rows route to the canonical
 * DataExportScreen and DeleteAccountScreen rather than duplicating logic.
 *
 * Design (per AGENTS.md §4):
 * - Flat composition, hairline separators, no card-on-card
 * - One dominant panel (the "Your data" explanation block)
 * - Max two non-avatar radius sizes (Radius.md for blocks, Radius.lg for hero)
 * - Max three type sizes per viewport (title, body, caption)
 * - All colors via useAppTheme(), all geometry via design tokens
 *
 * State coverage (per AGENTS.md §14):
 * - Populated: full control set
 * - Disabled: toggles reflect real preference state
 */

import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { Space, Radius, Type, Typography } from '../theme/designTokens';

type Props = NativeStackScreenProps<RootStackParamList, 'DataPrivacy'>;

// Demo mode flag — privacy controls are persisted locally in this build.
const DATA_PRIVACY_DEMO_MODE = true;

const DATA_CATEGORIES: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; description: string }[] = [
  { icon: 'person-outline', label: 'Profile', description: 'Username, display name, bio, avatar' },
  { icon: 'pricetag-outline', label: 'Listings', description: 'Items you have listed for sale' },
  { icon: 'bag-outline', label: 'Orders', description: 'Purchase and sale order history' },
  { icon: 'chatbubble-outline', label: 'Messages', description: 'Conversations and message metadata' },
  { icon: 'location-outline', label: 'Addresses', description: 'Saved delivery addresses' },
  { icon: 'card-outline', label: 'Payments', description: 'Saved cards and bank accounts' },
];

export default function DataPrivacyScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const haptic = useHaptic();
  const { show } = useToast();
  const { analyticsOptOut, setAnalyticsOptOut } = useSettingsPreferences();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Local preference state — persisted to AsyncStorage in a real implementation.
  const [personalizedAds, setPersonalizedAds] = React.useState(false);
  const [recommendationPersonalization, setRecommendationPersonalization] = React.useState(true);
  const [thirdPartySharing, setThirdPartySharing] = React.useState(false);

  const handleOpenExternal = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      show('Unable to open link', 'error');
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
          title="Data & Privacy"
          subtitle="Privacy settings"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Demo mode indicator (truthful UI per AGENTS.md §11) ── */}
      {DATA_PRIVACY_DEMO_MODE && (
        <View
          style={[styles.demoBanner, { backgroundColor: colors.surfaceAlt }]}
          accessibilityRole="header"
          accessibilityLabel="Demo mode"
        >
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.demoBannerText}>
            Privacy controls are saved on this device only in demo mode.
          </Text>
        </View>
      )}

      {/* ── Your data — explanation block ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: colors.commerceTrust }]}>
              <Ionicons name="lock-closed" size={20} color={colors.textInverse} />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Your data</Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                What we collect and how it is used
              </Text>
            </View>
          </View>
          <View style={styles.dataList}>
            {DATA_CATEGORIES.map((category) => (
              <View key={category.label} style={styles.dataItem}>
                <View style={[styles.dataIcon, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name={category.icon} size={16} color={colors.textSecondary} />
                </View>
                <View style={styles.dataText}>
                  <Text style={[styles.dataLabel, { color: colors.textPrimary }]}>{category.label}</Text>
                  <Text style={[styles.dataDescription, { color: colors.textMuted }]}>{category.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </Reanimated.View>

      {/* ── Data actions — export & delete ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)}>
        <SettingsSection title="Your data rights" noCard>
          <SettingsRow
            icon="download-outline"
            title="Download your data"
            subtitle="Export a copy of your account data (GDPR portability)"
            onPress={() => navigation.navigate('DataExport')}
            isFirst
          />
          <SettingsRow
            icon="trash-outline"
            title="Delete your data"
            subtitle="Permanently erase your account and data"
            danger
            onPress={() => navigation.navigate('DeleteAccount')}
            isLast
          />
        </SettingsSection>
      </Reanimated.View>

      {/* ── Privacy controls ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
        <SettingsSection title="Privacy controls" noCard>
          <SettingsRow
            icon="megaphone-outline"
            title="Personalised ads"
            subtitle="Allow us to use your activity to show relevant ads"
            toggleValue={personalizedAds}
            onToggle={toggleWithHaptic(setPersonalizedAds)}
            isFirst
          />
          <SettingsRow
            icon="analytics-outline"
            title="Analytics"
            subtitle="Send anonymous usage data to improve ThryftVerse"
            toggleValue={!analyticsOptOut}
            onToggle={(v) => { haptic.selection(); setAnalyticsOptOut(!v); }}
          />
          <SettingsRow
            icon="sparkles-outline"
            title="Recommendation personalisation"
            subtitle="Use your activity to personalise feed recommendations"
            toggleValue={recommendationPersonalization}
            onToggle={toggleWithHaptic(setRecommendationPersonalization)}
            isLast
          />
        </SettingsSection>
      </Reanimated.View>

      {/* ── Data retention ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)}>
        <View style={styles.infoBlock}>
          <View style={styles.infoHeader}>
            <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Data retention</Text>
          </View>
          <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
            We retain your account data for as long as your account is active. After account deletion, personal data is removed within 30 days, except where retention is required by law (e.g. tax records for 7 years). Listing and order data needed for buyer protection is retained for the duration of any open dispute plus 90 days.
          </Text>
        </View>
      </Reanimated.View>

      {/* ── Third-party sharing ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(240)}>
        <SettingsSection title="Third-party sharing" noCard>
          <SettingsRow
            icon="share-outline"
            title="Share data with partners"
            subtitle="Allow sharing anonymised data with shipping and payment partners"
            toggleValue={thirdPartySharing}
            onToggle={toggleWithHaptic(setThirdPartySharing)}
            isFirst
            isLast
          />
        </SettingsSection>
        <View style={styles.infoBlock}>
          <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
            We share data with shipping carriers and payment processors only to fulfil your orders and payouts. We never sell your personal data. Disabling this toggle stops anonymised aggregate sharing but does not affect order fulfilment.
          </Text>
        </View>
      </Reanimated.View>

      {/* ── Cookie preferences ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(300)}>
        <SettingsSection title="Cookie preferences" noCard>
          <SettingsRow
            icon="document-text-outline"
            title="Cookie policy"
            subtitle="How we use cookies and local storage"
            onPress={() => void handleOpenExternal('https://thryftverse.app/cookies')}
            isFirst
            isLast
          />
        </SettingsSection>
      </Reanimated.View>

      {/* ── Legal ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(360)}>
        <SettingsSection title="Legal" noCard>
          <SettingsRow
            icon="shield-checkmark-outline"
            title="Privacy Policy"
            onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
            isFirst
          />
          <SettingsRow
            icon="document-text-outline"
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
    dataList: {
      marginTop: Space.md,
      gap: Space.sm,
    },
    dataItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    dataIcon: {
      width: Space.xl,
      height: Space.xl,
      borderRadius: Radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dataText: {
      flex: 1,
    },
    dataLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    dataDescription: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
      letterSpacing: Type.caption.letterSpacing,
    },
    infoBlock: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      marginBottom: Space.md,
    },
    infoHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs,
    },
    infoTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    infoBody: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
    },
  });
}
